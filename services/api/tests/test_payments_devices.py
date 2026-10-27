from __future__ import annotations

import hashlib
import hmac
import json
from datetime import datetime,timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from psycopg.types.json import Jsonb

from app.config import Settings
from app.main import create_app

WEBHOOK_SECRET='test-only-webhook-secret-not-a-live-credential'
DEVICE_SECRET=b'test-only-device-secret-at-least-32-bytes'


class Provider:
    def __init__(self,qr_id):
        self.qr_id=qr_id
        self.amount=1000
        self.status="captured"
        self.calls=0
    def payment_and_qrs(self,payment_id):
        self.calls+=1
        return {'id':payment_id,'status':self.status,'captured':self.status=='captured','amount':self.amount,'currency':'INR'},[{'id':self.qr_id}]


@pytest.fixture
def live(db,database_url):
    user,bot,order,qr=uuid4(),uuid4(),uuid4(),'qr_test_'+str(uuid4())
    with db.connection() as conn:
        conn.execute('INSERT INTO auth.users(id,raw_user_meta_data) VALUES(%s,%s)',(user,Jsonb({'name':'Live Fixture'})))
        conn.execute("INSERT INTO public.bots(id,status,last_seen_at,battery_level) VALUES(%s,'AT_HOSTEL',now(),90)",(bot,))
        conn.execute('INSERT INTO hostelxpress_private.device_state(bot_id,clock_synchronized) VALUES(%s,true)',(bot,))
        conn.execute('INSERT INTO hostelxpress_private.device_credentials(bot_id,secret) VALUES(%s,%s)',(bot,DEVICE_SECRET))
        for compartment in range(1,4):
            conn.execute('INSERT INTO hostelxpress_private.compartment_state(bot_id,compartment_id,outer_closed,inner_closed,is_empty,observed_at) VALUES(%s,%s,true,true,%s,now())',(bot,compartment,compartment!=1))
        conn.execute("INSERT INTO public.orders(id,user_id,bot_id,compartment_id,status,destination_hostel_block) VALUES(%s,%s,%s,1,'Arrived','A')",(order,user,bot))
        conn.execute('INSERT INTO public.transactions(order_id,razorpay_qr_id) VALUES(%s,%s)',(order,qr))
    settings=Settings(app_env='production',database_url=database_url,supabase_url='https://example.supabase.co',
                      razorpay_webhook_secret=WEBHOOK_SECRET,worker_enabled=False,trusted_hosts='testserver')
    with TestClient(create_app(settings)) as client:
        client.app.state.provider=Provider(qr)
        yield {'client':client,'db':db,'user':user,'bot':bot,'order':order,'qr':qr}


def webhook(live,event_id=None,payment_id='pay_test_fixture',extra=None,event_type='payment.captured'):
    body={'event':event_type,'payload':{'payment':{'entity':{'id':payment_id}}}}
    if extra:
        body.update(extra)
    raw=json.dumps(body,separators=(',',':')).encode()
    signature=hmac.new(WEBHOOK_SECRET.encode(),raw,hashlib.sha256).hexdigest()
    return live['client'].post('/webhooks/razorpay',content=raw,headers={'Content-Type':'application/json',
        'X-Razorpay-Signature':signature,'X-Razorpay-Event-Id':event_id or str(uuid4())})


def device(live,body):
    raw=json.dumps(body,separators=(',',':')).encode()
    stamp=str(int(datetime.now(timezone.utc).timestamp()))
    path=f'/v1/devices/{live["bot"]}/messages'
    signature=hmac.new(DEVICE_SECRET,f'{stamp}.POST.{path}.'.encode()+raw,hashlib.sha256).hexdigest()
    return live['client'].post(path,content=raw,headers={'Content-Type':'application/json','X-Device-Timestamp':stamp,'X-Device-Signature':signature})


def base(live,kind):
    return {'schema_version':1,'message_type':kind,'message_id':str(uuid4()),'bot_id':str(live['bot']),
            'sent_at':datetime.now(timezone.utc).isoformat().replace('+00:00','Z')}


def test_verified_capture_is_atomic_and_idempotent(live):
    event_id=str(uuid4())
    first=webhook(live,event_id)
    assert first.status_code==200,first.text
    assert first.json()['outcome']=='captured_unlock_queued'
    same=webhook(live,event_id)
    assert same.status_code==200 and same.json()['duplicate'] is True
    different_event=webhook(live)
    assert different_event.status_code==200
    with live['db'].connection() as conn:
        assert conn.execute('SELECT status FROM public.orders WHERE id=%s',(live['order'],)).fetchone()['status']=='Paid'
        assert conn.execute('SELECT count(*) AS n FROM hostelxpress_private.command_outbox WHERE order_id=%s',(live['order'],)).fetchone()['n']==1
        assert conn.execute('SELECT count(*) AS n FROM hostelxpress_private.webhook_inbox').fetchone()['n']==2


def test_webhook_rejects_bad_signature_without_provider_call(live):
    response=live['client'].post('/webhooks/razorpay',content=b'{}',headers={'X-Razorpay-Signature':'0'*64,'X-Razorpay-Event-Id':'bad'})
    assert response.status_code==401
    assert live['client'].app.state.provider.calls==0


def test_webhook_rejects_wrong_amount_and_cross_qr(live):
    provider=live['client'].app.state.provider
    provider.amount=999
    assert webhook(live).status_code==400
    provider.amount=1000
    provider.qr_id='qr_some_other_order'
    assert webhook(live).status_code==400
    with live['db'].connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM hostelxpress_private.command_outbox').fetchone()['n']==0
        assert conn.execute('SELECT status FROM public.orders WHERE id=%s',(live['order'],)).fetchone()['status']=='Arrived'


def test_offline_payment_stays_paid_without_unlock(live):
    with live['db'].connection() as conn:
        conn.execute("UPDATE public.bots SET last_seen_at=now()-interval '30 seconds' WHERE id=%s",(live['bot'],))
    result=webhook(live)
    assert result.status_code==200,result.text
    assert result.json()['outcome']=='captured_waiting_for_safe_device'
    with live['db'].connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM hostelxpress_private.command_outbox').fetchone()['n']==0
        assert conn.execute('SELECT status FROM public.orders WHERE id=%s',(live['order'],)).fetchone()['status']=='Paid'


def test_canonical_device_telemetry_stored_and_deduplicated(live):
    body=base(live,'telemetry')
    body.update(boot_id=str(uuid4()),sequence=0,observed_at=body['sent_at'],current_lat=12.0,current_lng=77.0,battery_level=80,
                clock_synchronized=True,compartments=[{'compartment':i,'outer_closed':True,'inner_closed':True,'is_empty':i!=1} for i in range(1,4)])
    first=device(live,body)
    assert first.status_code==200,first.text
    assert first.json()['stored'] is True
    assert device(live,body).json()['duplicate'] is True
    forged={**body,'message_id':str(uuid4()),'bot_id':str(uuid4())}
    assert device(live,forged).status_code==403
    stale={**body,'message_id':str(uuid4()),'sequence':0}
    assert device(live,stale).status_code==409


def test_device_event_cannot_arrive_another_order(live):
    body=base(live,'event')
    body.update(observed_at=body['sent_at'],event_type='arrived',order_id=str(uuid4()),compartment=1)
    assert device(live,body).status_code==403


def test_replayed_ack_cannot_reopen_completed_order(live):
    assert webhook(live).status_code==200
    with live['db'].connection() as conn:
        command=conn.execute("UPDATE hostelxpress_private.command_outbox SET status='executed',attempts=1 WHERE order_id=%s RETURNING id",(live['order'],)).fetchone()['id']
        conn.execute("UPDATE public.orders SET status='Completed',completed_at=now(),compartment_released_at=now() WHERE id=%s",(live['order'],))
        conn.execute("UPDATE public.bots SET status='RETURNING' WHERE id=%s",(live['bot'],))
    body=base(live,'ack')
    body.update(command_id=str(command),order_id=str(live['order']),compartment=1,result='executed')
    assert device(live,body).status_code in {403,409}
    with live['db'].connection() as conn:
        assert conn.execute('SELECT status FROM public.bots WHERE id=%s',(live['bot'],)).fetchone()['status']=='RETURNING'


def test_verified_payment_failure_preserves_parcel_and_requires_evidence(live):
    live['client'].app.state.provider.status='failed'
    result=webhook(live,event_type='payment.failed')
    assert result.status_code==200,result.text
    assert result.json()['outcome']=='payment_failed_evidence_required'
    with live['db'].connection() as conn:
        order=conn.execute('SELECT status,compartment_released_at FROM public.orders WHERE id=%s',(live['order'],)).fetchone()
        assert order['status']=='Failed' and order['compartment_released_at'] is None
        assert conn.execute('SELECT status FROM public.bots WHERE id=%s',(live['bot'],)).fetchone()['status']=='FAULT_MODE'
        assert conn.execute('SELECT clip_seconds FROM hostelxpress_private.incidents WHERE order_id=%s',(live['order'],)).fetchone()['clip_seconds']==120
        assert conn.execute('SELECT count(*) AS n FROM hostelxpress_private.command_outbox').fetchone()['n']==0


def test_late_capture_on_failed_order_records_money_without_unlock(live):
    with live['db'].connection() as conn:
        conn.execute("UPDATE public.orders SET status='Failed',failure_reason='operator_hold',failed_at=now() WHERE id=%s",(live['order'],))
    result=webhook(live)
    assert result.status_code==200,result.text
    assert result.json()['outcome']=='requires_reconciliation'
    with live['db'].connection() as conn:
        assert conn.execute('SELECT status FROM public.transactions WHERE order_id=%s',(live['order'],)).fetchone()['status']=='Captured'
        assert conn.execute('SELECT status FROM public.orders WHERE id=%s',(live['order'],)).fetchone()['status']=='Failed'
        assert conn.execute('SELECT count(*) AS n FROM hostelxpress_private.command_outbox').fetchone()['n']==0
