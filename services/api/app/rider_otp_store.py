"""Transactional persistence and guarded outer-command authorization for rider OTP.

Caller is responsible for AUTHENTICATING the issuing operator and verifying
the exact signed rover request. No payment or physical actuation occurs here.
"""
from __future__ import annotations

from fastapi import HTTPException

from . import rider_otp, service


def _preflight(conn, order_id):
    # Match the existing global lock order: bot, then order. Prevents races
    # between assignment changes, timeout worker, and OTP redemption.
    order, bot = service.lock_order(conn, order_id)
    if (not bot or bot.get('is_demo') or order['is_demo']
            or order['status'] != 'Pending' or order['compartment_id'] is None
            or bot['status'] not in {'IDLE_AT_GATE', 'LOADING'}
            or order['rider_due_at'] <= service.now()):
        raise HTTPException(409, 'No current live rider-loading assignment')
    if not service.safe_bot(conn, bot):
        raise HTTPException(409, 'Rover sensors, clock or connection are not safe for loading')
    bay = conn.execute(
        'SELECT outer_closed,inner_closed,is_empty,observed_at '
        'FROM hostelxpress_private.compartment_state WHERE bot_id=%s AND compartment_id=%s',
        (bot['id'], order['compartment_id']),
    ).fetchone()
    if not bay or bay['outer_closed'] is not True or bay['inner_closed'] is not True or bay['is_empty'] is not True:
        raise HTTPException(409, 'A closed, empty loading bay is required')
    return order, bot


def issue_challenge(conn, order_id, secret):
    order, bot = _preflight(conn, order_id)
    prior = conn.execute(
        'SELECT 1 FROM hostelxpress_private.rider_otp_challenges WHERE order_id=%s FOR UPDATE',
        (order_id,),
    ).fetchone()
    if prior:
        # No implicit reissuance: resending/rotating can reset brute-force limits.
        raise HTTPException(409, 'Rider OTP already issued; operator reconciliation required')
    code, challenge = rider_otp.issue(
        secret=secret, order_id=order['id'], bot_id=bot['id'],
        compartment=order['compartment_id'], now=service.now(),
        rider_due_at=order['rider_due_at'],
    )
    conn.execute(
        'INSERT INTO hostelxpress_private.rider_otp_challenges'
        '(order_id,bot_id,compartment,digest,issued_at,expires_at,attempts,consumed_at) '
        'VALUES (%s,%s,%s,%s,%s,%s,%s,%s)',
        (challenge.order_id,challenge.bot_id,challenge.compartment,
         challenge.digest,challenge.issued_at,challenge.expires_at,
         challenge.attempts,challenge.consumed_at),
    )
    return code,challenge


def redeem_challenge(conn, order_id, bot_id, compartment, candidate, secret):
    # The API has already verified a signature from this exact bot identity.
    order, bot = _preflight(conn, order_id)
    if order['bot_id'] != bot_id or order['compartment_id'] != compartment:
        return {'accepted':False}
    saved = conn.execute(
        'SELECT * FROM hostelxpress_private.rider_otp_challenges WHERE order_id=%s FOR UPDATE',
        (order_id,),
    ).fetchone()
    if not saved:
        return {'accepted':False}
    challenge = rider_otp.RiderOtpChallenge(
        order_id=saved['order_id'],bot_id=saved['bot_id'],
        compartment=saved['compartment'],digest=saved['digest'],
        issued_at=saved['issued_at'],expires_at=saved['expires_at'],
        attempts=saved['attempts'],consumed_at=saved['consumed_at'],
    )
    changed, accepted = rider_otp.redeem(
        challenge,candidate,secret=secret,
        order_id=order_id,bot_id=bot_id,compartment=compartment,now=service.now(),
    )
    if not accepted:
        if changed.attempts != challenge.attempts:
            conn.execute(
                'UPDATE hostelxpress_private.rider_otp_challenges SET attempts=%s WHERE order_id=%s',
                (changed.attempts,order_id),
            )
        return {'accepted':False}
    # Do not consume a valid code if an old command already exists. Old commands
    # need operator reconciliation rather than triggering a second actuation.
    old=conn.execute(
        "SELECT id FROM hostelxpress_private.command_outbox WHERE order_id=%s AND command='unlock_outer'",
        (order_id,),
    ).fetchone()
    if old:
        raise HTTPException(409, 'An outer-lid command already exists; reconciliation required')
    command=conn.execute(
        "INSERT INTO hostelxpress_private.command_outbox(order_id,bot_id,compartment,command,is_demo) "
        "VALUES(%s,%s,%s,'unlock_outer',false) RETURNING id",
        (order_id,bot_id,compartment),
    ).fetchone()
    conn.execute(
        'UPDATE hostelxpress_private.rider_otp_challenges '
        'SET attempts=%s,consumed_at=%s WHERE order_id=%s',
        (changed.attempts,changed.consumed_at,order_id),
    )
    return {'accepted':True,'command_id':command['id'],'status':'queued_not_executed'}
