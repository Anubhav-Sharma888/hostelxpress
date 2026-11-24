"""Two unrelated OTPs: courier display-only OTP1, verified student pickup OTP2.

The database is private, values encrypted at rest and never logged.
OTP1 NEVER authorizes a lid or claims verification by Amazon/Flipkart.
OTP2 authorizes only a guarded, pending inner-lid command after captured ₹10.
"""
from __future__ import annotations

import hashlib
import hmac
import re
import secrets
from datetime import timedelta
from uuid import UUID

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import HTTPException

from . import service

_PICKUP_FORMAT=re.compile(r"[0-9]{6}\Z",re.ASCII)
_COURIER_FORMAT=re.compile(r"[0-9]{4,8}\Z",re.ASCII)
_TTL=timedelta(minutes=5)


def _secret(secret:bytes):
    if not isinstance(secret,bytes) or len(secret)<32:
        raise ValueError('OTP server secret must be 32+ bytes')


def _aad(purpose,order_id,bot_id,bay):
    return f"hostelxpress:{purpose}:{order_id}:{bot_id}:{bay}".encode('ascii')


def _key(secret,purpose):
    _secret(secret)
    return hashlib.sha256(b"hostelxpress-aesgcm-v1:"+purpose.encode()+b":"+secret).digest()


def _seal(secret,purpose,order_id,bot_id,bay,code):
    nonce=secrets.token_bytes(12)
    ciphertext=AESGCM(_key(secret,purpose)).encrypt(
        nonce,code.encode('ascii'),_aad(purpose,order_id,bot_id,bay))
    return nonce+ciphertext


def _open(secret,purpose,order_id,bot_id,bay,blob):
    if blob is None or len(blob)<29:
        raise HTTPException(409,'Code storage is unavailable; ask support for reconciliation')
    try:
        return AESGCM(_key(secret,purpose)).decrypt(
            bytes(blob[:12]),bytes(blob[12:]),_aad(purpose,order_id,bot_id,bay)).decode('ascii')
    except Exception:
        raise HTTPException(409,'Code could not be recovered; operator reconciliation required') from None


def _digest(secret,order_id,bot_id,bay,code):
    return hmac.new(secret,_aad('pickup-otp2',order_id,bot_id,bay)+b":"+code.encode('ascii'),hashlib.sha256).hexdigest()


def _order(conn,order_id,user_id=None):
    order,bot=service.lock_order(conn,order_id,user_id)
    if not bot or order['is_demo'] or bot['is_demo'] or order['compartment_id'] is None:
        raise HTTPException(409,'A live assigned rover and compartment are required')
    return order,bot


def _paid(conn,order_id,user_id=None):
    order,bot=_order(conn,order_id,user_id)
    if order['status']!='Paid' or bot['status'] not in {'AT_HOSTEL','UNLOCKED'}:
        raise HTTPException(409,'Student pickup requires confirmed arrival and payment')
    captured=conn.execute(
        "SELECT id FROM public.transactions WHERE order_id=%s AND status='Captured' "
        "AND amount=1000 AND currency='INR' AND is_demo=false",
        (order_id,)).fetchone()
    if not captured:
        raise HTTPException(409,'₹10 payment must be verified as captured')
    return order,bot


def _pickup_result(order,bot,row,secret):
    now=service.now()
    if row['consumed_at'] is not None or row['attempts']>=3 or row['expires_at']<=now:
        raise HTTPException(409,'Pickup OTP2 already used, locked or expired; contact support')
    if row['bot_id']!=bot['id'] or row['compartment']!=order['compartment_id']:
        raise HTTPException(409,'Pickup rover assignment changed; contact support')
    code=_open(secret,'pickup-otp2',row['order_id'],row['bot_id'],row['compartment'],row['code_ciphertext'])
    return {'order_id':order['id'],'code':code,'expires_at':row['expires_at'],
            'otp_type':'student_pickup_otp2','compartment':order['compartment_id']}


def issue_pickup_code(conn,order_id,user_id,secret):
    order,bot=_paid(conn,order_id,user_id)
    row=conn.execute(
        'SELECT * FROM hostelxpress_private.pickup_otp_challenges WHERE order_id=%s FOR UPDATE',
        (order_id,)).fetchone()
    if row:
        return _pickup_result(order,bot,row,secret)
    now=service.now()
    code=f'{secrets.randbelow(1_000_000):06d}'
    cipher=_seal(secret,'pickup-otp2',order['id'],bot['id'],order['compartment_id'],code)
    row=conn.execute(
        'INSERT INTO hostelxpress_private.pickup_otp_challenges'
        '(order_id,bot_id,compartment,digest,code_ciphertext,issued_at,expires_at)'
        ' VALUES(%s,%s,%s,%s,%s,%s,%s) RETURNING *',
        (order['id'],bot['id'],order['compartment_id'],
         _digest(secret,order['id'],bot['id'],order['compartment_id'],code),
         cipher,now,now+_TTL)).fetchone()
    return _pickup_result(order,bot,row,secret)


def get_pickup_code(conn,order_id,user_id,secret):
    order,bot=_paid(conn,order_id,user_id)
    row=conn.execute(
        'SELECT * FROM hostelxpress_private.pickup_otp_challenges WHERE order_id=%s',
        (order_id,)).fetchone()
    if not row:
        raise HTTPException(404,'Pickup OTP2 has not been generated')
    return _pickup_result(order,bot,row,secret)


def redeem_pickup_code(conn,order_id,bot_id,compartment,candidate,secret):
    # The HTTP route MUST authenticate the rover's signed request first.
    order,bot=_paid(conn,order_id)
    if bot_id!=bot['id'] or compartment!=order['compartment_id']:
        return {'accepted':False}
    if not service.safe_bot(conn,bot):
        raise HTTPException(409,'Rover connection and physical sensors are unsafe')
    bay=conn.execute(
        'SELECT outer_closed,inner_closed,is_empty FROM hostelxpress_private.compartment_state '
        'WHERE bot_id=%s AND compartment_id=%s',
        (bot_id,compartment)).fetchone()
    if not bay or bay['outer_closed'] is not True or bay['inner_closed'] is not True or bay['is_empty'] is not False:
        raise HTTPException(409,'Closed loaded compartment required for pickup')
    row=conn.execute(
        'SELECT * FROM hostelxpress_private.pickup_otp_challenges WHERE order_id=%s FOR UPDATE',
        (order_id,)).fetchone()
    if not row or row['bot_id']!=bot_id or row['compartment']!=compartment:
        return {'accepted':False}
    now=service.now()
    if row['consumed_at'] is not None or row['expires_at']<=now or row['attempts']>=3:
        return {'accepted':False}
    normalized=candidate if isinstance(candidate,str) and _PICKUP_FORMAT.fullmatch(candidate) else 'INVALID'
    candidate_digest=_digest(secret,order_id,bot_id,compartment,normalized)
    accepted=hmac.compare_digest(row['digest'],candidate_digest) and normalized!='INVALID'
    if not accepted:
        conn.execute('UPDATE hostelxpress_private.pickup_otp_challenges '
                     'SET attempts=attempts+1 WHERE order_id=%s',(order_id,))
        return {'accepted':False}
    prior=conn.execute(
        "SELECT id FROM hostelxpress_private.command_outbox WHERE order_id=%s AND command='unlock_inner'",
        (order_id,)).fetchone()
    if prior:
        raise HTTPException(409,'An inner command already exists; operator reconciliation required')
    conn.execute(
        'UPDATE hostelxpress_private.pickup_otp_challenges '
        'SET consumed_at=%s,attempts=attempts+1,code_ciphertext=NULL WHERE order_id=%s',
        (now,order_id))
    if not service.enqueue_unlock(conn,order,bot,is_demo=False):
        raise HTTPException(409,'Inner-lid safety checks failed; no OTP was consumed')
    command=conn.execute(
        "SELECT id FROM hostelxpress_private.command_outbox "
        "WHERE order_id=%s AND command='unlock_inner'",(order_id,)).fetchone()
    if not command:
        raise HTTPException(409,'No inner command was queued')
    return {'accepted':True,'command_id':command['id'],
            'status':'queued_not_executed','otp_type':'student_pickup_otp2'}


def authorize_outer_loading(conn,order_id):
    """Separate authenticated staff action, never validated by either OTP."""
    order,bot=_order(conn,order_id)
    if order['status']!='Pending' or bot['status'] not in {'IDLE_AT_GATE','LOADING'} or order['rider_due_at']<=service.now():
        raise HTTPException(409,'Loading window is not open')
    if not service.safe_bot(conn,bot):
        raise HTTPException(409,'Rover must have fresh, safe telemetry')
    bay=conn.execute(
        'SELECT outer_closed,inner_closed,is_empty FROM hostelxpress_private.compartment_state '
        'WHERE bot_id=%s AND compartment_id=%s',(bot['id'],order['compartment_id'])).fetchone()
    if not bay or bay['outer_closed'] is not True or bay['inner_closed'] is not True or bay['is_empty'] is not True:
        raise HTTPException(409,'A closed empty loading bay is required')
    if conn.execute(
        "SELECT id FROM hostelxpress_private.command_outbox WHERE order_id=%s AND command='unlock_outer'",
        (order_id,)).fetchone():
        raise HTTPException(409,'Outer-lid command already issued; reconcile instead of replaying')
    row=conn.execute(
        "INSERT INTO hostelxpress_private.command_outbox"
        "(order_id,bot_id,compartment,command,is_demo) VALUES(%s,%s,%s,'unlock_outer',false) RETURNING id",
        (order_id,bot['id'],order['compartment_id'])).fetchone()
    return {'command_id':row['id'],'status':'queued_not_executed',
            'authorization':'authenticated_gate_staff_not_otp1'}


def submit_courier_code(conn,order_id,user_id,code,secret):
    """OTP1: store encrypted to display once to assigned rover, NO validation."""
    if not isinstance(code,str) or not _COURIER_FORMAT.fullmatch(code):
        raise HTTPException(422,'Courier OTP1 must be 4–8 ASCII digits')
    order,bot=_order(conn,order_id,user_id)
    if order['status']!='Pending' or bot['status'] not in {'IDLE_AT_GATE','LOADING'} or order['rider_due_at']<=service.now():
        raise HTTPException(409,'Courier code is only available during live rider handoff')
    now=service.now()
    expiry=min(now+_TTL,order['rider_due_at'])
    cipher=_seal(secret,'courier-display-otp1',order_id,bot['id'],order['compartment_id'],code)
    # Student may replace an undelivered code, but cannot recover a displayed code.
    previous=conn.execute(
        'SELECT read_at FROM hostelxpress_private.courier_code_messages '
        'WHERE order_id=%s FOR UPDATE',(order_id,)).fetchone()
    if previous and previous['read_at'] is not None:
        raise HTTPException(409,'Courier code already delivered; contact gate staff')
    conn.execute(
        'INSERT INTO hostelxpress_private.courier_code_messages '
        '(order_id,bot_id,compartment,code_ciphertext,created_at,expires_at) '
        'VALUES(%s,%s,%s,%s,%s,%s) ON CONFLICT(order_id) DO UPDATE SET '
        'bot_id=excluded.bot_id,compartment=excluded.compartment,'
        'code_ciphertext=excluded.code_ciphertext,created_at=excluded.created_at,'
        'expires_at=excluded.expires_at',
        (order_id,bot['id'],order['compartment_id'],cipher,now,expiry))
    return {'order_id':order_id,'status':'queued_for_rover_display',
            'otp_type':'courier_display_otp1','expires_at':expiry}


def take_courier_code(conn,order_id,bot_id,compartment,secret):
    """Signed device retrieves OTP1 at most once. Never queues a lid command."""
    order,bot=_order(conn,order_id)
    if order['status']!='Pending' or bot['id']!=bot_id or order['compartment_id']!=compartment or order['rider_due_at']<=service.now():
        raise HTTPException(409,'Courier display assignment invalid or expired')
    row=conn.execute(
        'SELECT * FROM hostelxpress_private.courier_code_messages '
        'WHERE order_id=%s FOR UPDATE',(order_id,)).fetchone()
    if not row or row['read_at'] is not None or row['expires_at']<=service.now():
        raise HTTPException(404,'No undelivered courier OTP1')
    if row['bot_id']!=bot_id or row['compartment']!=compartment:
        raise HTTPException(409,'Courier code is not assigned to this rover')
    code=_open(secret,'courier-display-otp1',order_id,bot_id,compartment,row['code_ciphertext'])
    conn.execute(
        'UPDATE hostelxpress_private.courier_code_messages '
        'SET code_ciphertext=NULL,read_at=now() WHERE order_id=%s',(order_id,))
    return {'order_id':order_id,'code':code,'otp_type':'courier_display_otp1',
            'status':'display_once_only','compartment':compartment}
