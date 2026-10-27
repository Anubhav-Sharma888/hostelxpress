from __future__ import annotations

import hashlib
import hmac
import json
from datetime import timedelta
from uuid import uuid4

import httpx
from fastapi import HTTPException

from . import service


class RazorpayProvider:
    """Official HTTPS QR/Payment APIs. Secrets remain exclusively on the server."""
    def __init__(self, settings):
        self.settings = settings

    def request(self, method, path, **kwargs):
        if not self.settings.razorpay_key_id or not self.settings.razorpay_key_secret:
            raise HTTPException(503,'Razorpay is not configured')
        try:
            with httpx.Client(base_url='https://api.razorpay.com/v1',
                              auth=(self.settings.razorpay_key_id,self.settings.razorpay_key_secret),
                              timeout=10,follow_redirects=False) as client:
                response = client.request(method,path,**kwargs)
                response.raise_for_status()
                return response.json()
        except (httpx.HTTPError,ValueError):
            raise HTTPException(502,'The payment provider could not confirm this request; retry safely') from None

    def create_qr(self, order_id, request_id, expires_at):
        return self.request('POST','/payments/qr_codes',json={
            'type':'upi_qr','name':'Hostelxpress delivery','usage':'single_use','fixed_amount':True,
            'payment_amount':1000,'close_by':int(expires_at.timestamp()),
            'notes':{'hostelxpress_order_id':str(order_id),'request_id':str(request_id)}})

    def payment_and_qrs(self,payment_id):
        payment = self.request('GET','/payments/'+payment_id)
        qrs = self.request('GET','/payments/qr_codes',params={'payment_id':payment_id})
        return payment,qrs.get('items',[])


def response(payment):
    is_demo = payment['is_demo']
    return {'order_id':payment['order_id'],'qr_id':payment['razorpay_qr_id'],
            'amount':payment['amount'],'currency':payment['currency'],
            'provider':'demo' if is_demo else 'razorpay',
            'status':'paid' if payment['status'] in {'Captured','Refunded'} else 'pending',
            'qr_image_url':None if is_demo else payment['qr_image_url'],
            'qr_payload':('HOSTELXPRESS_DEMO_NONPAYABLE:'+str(payment['request_id'])) if is_demo else None,
            'expires_at':payment['expires_at'],'is_demo':is_demo}


def create_payment(db, provider, order_id, user_id, is_demo):
    with db.connection() as conn:
        order,bot = service.lock_order(conn,order_id,user_id)
        if order['status'] not in {'Arrived','Paid'} or not bot:
            raise HTTPException(409,'Payment is available after your delivery arrives')
        existing = conn.execute("SELECT * FROM public.transactions WHERE order_id=%s AND status IN ('Pending','Authorized','Captured','Refunded') ORDER BY created_at DESC LIMIT 1 FOR UPDATE",(order_id,)).fetchone()
        if existing:
            if existing['provider_state']=='creating':
                raise HTTPException(409,'Payment creation is pending reconciliation; no second QR was created')
            if existing['expires_at'] and existing['expires_at']<=service.now() and existing['status']=='Pending':
                raise HTTPException(409,'This QR expired; payment must be reconciled before another QR is issued')
            return response(existing)
        expires_at = service.now()+timedelta(minutes=16)
        payment = conn.execute("INSERT INTO public.transactions(order_id,provider_state,is_demo,expires_at) VALUES(%s,'creating',%s,%s) RETURNING *",(order_id,is_demo,expires_at)).fetchone()
        request_id = payment['request_id']
    # The creating intent is durable before making an external network call.
    if is_demo:
        qr = {'id':'demo_qr_'+str(request_id),'image_url':None,'payment_amount':1000,
              'fixed_amount':True,'usage':'single_use','type':'upi_qr'}
    else:
        try:
            qr = provider.create_qr(order_id,request_id,expires_at)
        except HTTPException:
            # An HTTP timeout can still mean a provider QR exists: retain creating
            # state and require reconciliation rather than creating a duplicate.
            raise
    if not (isinstance(qr.get('id'),str) and qr['id'] and qr.get('payment_amount')==1000
            and qr.get('fixed_amount') is True and qr.get('usage')=='single_use'
            and qr.get('type')=='upi_qr'):
        raise HTTPException(502,'Provider QR does not match this fixed-price payment intent')
    with db.connection() as conn:
        service.lock_order(conn,order_id,user_id)
        payment = conn.execute("UPDATE public.transactions SET razorpay_qr_id=%s,qr_image_url=%s,provider_state='ready' WHERE request_id=%s AND provider_state='creating' RETURNING *",(qr['id'],qr.get('image_url'),request_id)).fetchone()
        if not payment:
            raise HTTPException(409,'Payment intent changed; refresh your order')
        return response(payment)


def verify_signature(raw:bytes,signature:str | None,secret:str):
    if not secret:
        raise HTTPException(503,'Payment webhook is not configured')
    expected = hmac.new(secret.encode(),raw,hashlib.sha256).hexdigest()
    if signature is None or len(signature)!=64 or not hmac.compare_digest(expected,signature):
        raise HTTPException(401,'Invalid payment webhook signature')


def process_webhook(db,provider,raw,event_id):
    if not event_id or len(event_id)>255 or not event_id.isprintable():
        raise HTTPException(400,'A valid Razorpay event ID is required')
    try:
        body=json.loads(raw)
        event_type=body['event']
        if not isinstance(event_type,str):
            raise ValueError()
    except (ValueError,KeyError,TypeError):
        raise HTTPException(400,'Malformed payment webhook') from None
    digest=hashlib.sha256(raw).hexdigest()
    advisory=int.from_bytes(hashlib.sha256(('razorpay:'+event_id).encode()).digest()[:8],'big',signed=True)
    with db.connection() as conn:
        conn.execute('SELECT pg_advisory_xact_lock(%s)',(advisory,))
        prior=conn.execute("SELECT * FROM hostelxpress_private.webhook_inbox WHERE provider='razorpay' AND event_id=%s",(event_id,)).fetchone()
        if prior:
            if prior['payload_sha256']!=digest:
                raise HTTPException(409,'Webhook event ID was reused with a different body')
            return {'received':True,'duplicate':True,'outcome':prior['outcome']}
        outcome='ignored'
        payment_id=None
        if event_type in {'payment.captured','qr_code.credited','payment.failed'}:
            payload=body.get('payload')
            payment_wrapper=payload.get('payment') if isinstance(payload,dict) else None
            entity=payment_wrapper.get('entity') if isinstance(payment_wrapper,dict) else None
            if not isinstance(entity,dict):
                raise HTTPException(400,'Malformed provider payment resource')
            payment_id=entity.get('id')
            if not isinstance(payment_id,str) or not payment_id.startswith('pay_') or len(payment_id)>128:
                raise HTTPException(400,'Missing provider payment identity')
            payment,qrs=provider.payment_and_qrs(payment_id)
            expected_status='failed' if event_type=='payment.failed' else 'captured'
            valid_state=isinstance(payment,dict) and (payment.get('status')==expected_status or (expected_status=='failed' and payment.get('status')=='captured' and payment.get('captured') is True))
            if not (valid_state and payment.get('id')==payment_id
                    and (expected_status=='failed' or payment.get('captured') is True) and payment.get('amount')==1000
                    and payment.get('currency')=='INR'):
                raise HTTPException(400,'Provider payment state, amount, or currency does not match this event')
            qr_ids=[qr['id'] for qr in qrs if isinstance(qr,dict) and isinstance(qr.get('id'),str)]
            candidates=conn.execute('SELECT * FROM public.transactions WHERE razorpay_qr_id=ANY(%s) AND is_demo=false',(qr_ids,)).fetchall() if qr_ids else []
            candidate=candidates[0] if len(candidates)==1 else None
            if not candidate:
                raise HTTPException(400,'Payment does not belong to a saved application QR')
            order,bot=service.lock_order(conn,candidate['order_id'])
            candidate=conn.execute('SELECT * FROM public.transactions WHERE id=%s FOR UPDATE',(candidate['id'],)).fetchone()
            if order['is_demo'] or candidate['amount']!=1000 or candidate['currency']!='INR':
                raise HTTPException(400,'Payment and application order do not match')
            if expected_status=='failed':
                if payment.get('status')=='captured' or candidate['status'] in {'Captured','Refunded'} or order['status'] in service.TERMINAL:
                    outcome='ignored_stale_failure'
                else:
                    conn.execute("UPDATE public.transactions SET status='Failed',razorpay_payment_id=%s WHERE id=%s",(payment_id,candidate['id']))
                    conn.execute("UPDATE public.orders SET status='Failed',failed_at=now(),failure_reason='payment_failure' WHERE id=%s",(order['id'],))
                    conn.execute("UPDATE public.bots SET status='FAULT_MODE',fault_reason='payment_failure' WHERE id=%s",(bot['id'],))
                    conn.execute("INSERT INTO hostelxpress_private.incidents(id,bot_id,order_id,reason) VALUES(%s,%s,%s,'payment_failure')",(uuid4(),bot['id'],order['id']))
                    service.event(conn,order['id'],'Failed','Payment failed; retain physical custody and the last 120 seconds of camera evidence')
                    outcome='payment_failed_evidence_required'
            elif candidate['status'] in {'Captured','Refunded'}:
                if candidate['razorpay_payment_id']!=payment_id:
                    raise HTTPException(409,'A different payment already settled this delivery')
                outcome='already_captured'
            elif order['status'] not in {'Arrived','Paid'}:
                # Record the financial fact, while retaining the terminal order
                # and withholding unlock until an operator reconciles the parcel.
                settled=conn.execute("SELECT id FROM public.transactions WHERE order_id=%s AND status IN ('Captured','Refunded')",(order['id'],)).fetchone()
                if not settled:
                    conn.execute("UPDATE public.transactions SET status='Captured',razorpay_payment_id=%s,captured_at=now(),capture_webhook_event_id=%s WHERE id=%s",(payment_id,event_id,candidate['id']))
                outcome='requires_reconciliation'
            else:
                conn.execute("UPDATE public.transactions SET status='Captured',razorpay_payment_id=%s,captured_at=now(),capture_webhook_event_id=%s WHERE id=%s",(payment_id,event_id,candidate['id']))
                if order['status']=='Arrived':
                    conn.execute("UPDATE public.orders SET status='Paid',paid_at=now() WHERE id=%s",(order['id'],))
                    service.event(conn,order['id'],'Paid','Razorpay captured payment verified by the server')
                queued=service.enqueue_unlock(conn,order,bot,is_demo=False)
                outcome='captured_unlock_queued' if queued else 'captured_waiting_for_safe_device'
        conn.execute('INSERT INTO hostelxpress_private.webhook_inbox(event_id,payload_sha256,event_type,payment_id,outcome) VALUES(%s,%s,%s,%s,%s)',(event_id,digest,event_type,payment_id,outcome))
        return {'received':True,'duplicate':False,'outcome':outcome}
