from __future__ import annotations

import hashlib
import hmac
import json
from datetime import datetime,timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from psycopg.types.json import Jsonb

from app.auth import Principal,current_user
from app.config import Settings
from app.main import create_app

WEBHOOK_SECRET='test-only-webhook-secret-not-a-live-credential'
DEVICE_SECRET=b'test-only-device-secret-at-least-32-bytes'


class Provider:
    def __init__(self,qr_id):
        self.qr_id=qr_id
        self.amount=1000
        self.currency="INR"
        self.status="captured"
        self.calls=0
        self.qr_payment_matches=True
    def payment_and_qrs(self,payment_id,qr_id=None):
        self.calls+=1
        return {'id':payment_id,'status':self.status,'captured':self.status=='captured','amount':self.amount,'currency':self.currency},[{'id':qr_id or self.qr_id}]

    def payment_matches_qr(self,payment_id,qr_id):
        return self.qr_payment_matches and qr_id==self.qr_id


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
                      razorpay_webhook_secret=WEBHOOK_SECRET,pickup_otp_secret='fixture-otp2-secret-at-least-32-chars',
                      worker_enabled=False,trusted_hosts='testserver')
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



def student_pickup(live):
    """Authenticated student gets OTP2; signed rover redeems it."""
    live['client'].app.dependency_overrides[current_user]=lambda:Principal(live['user'],False)
    issued=live['client'].post('/v1/orders/'+str(live['order'])+'/pickup-otp')
    assert issued.status_code==200,issued.text
    path=f'/v1/devices/{live["bot"]}/pickup-otp'
    body=json.dumps({'order_id':str(live['order']),'compartment':1,'code':issued.json()['code']},
                    separators=(',',':')).encode()
    stamp=str(int(datetime.now(timezone.utc).timestamp()))
    signature=hmac.new(DEVICE_SECRET,f'{stamp}.POST.{path}.'.encode()+body,hashlib.sha256).hexdigest()
    return live['client'].post(path,content=body,headers={
        'Content-Type':'application/json','X-Device-Timestamp':stamp,
        'X-Device-Signature':signature})


def base(live,kind):
    return {'schema_version':1,'message_type':kind,'message_id':str(uuid4()),'bot_id':str(live['bot']),
            'sent_at':datetime.now(timezone.utc).isoformat().replace('+00:00','Z')}


@pytest.mark.parametrize("missing", ["razorpay_key_id", "razorpay_key_secret", "razorpay_webhook_secret"])
def test_unconfigured_qr_is_refused_before_creating_intent(missing, monkeypatch):
    settings = Settings(
        app_env="production",
        database_url="host=/tmp dbname=unused",
        supabase_url="https://example.supabase.invalid",
        razorpay_key_id="fixture",
        razorpay_key_secret="fixture",
        razorpay_webhook_secret="fixture",
    )
    monkeypatch.setattr(settings, missing, "")
    app = create_app(settings)
    app.dependency_overrides[current_user] = lambda: Principal(uuid4(), False)
    # Bypass lifespan so any attempt to use the database will fail the test.
    response = TestClient(app).post(f"/v1/orders/{uuid4()}/payment")
    assert response.status_code == 503
    assert "Payments are not configured" in response.json()["detail"]


def test_qr_credited_uses_webhook_identity_and_provider_confirmation(live):
    payload={"payment":{"entity":{"id":"pay_test_fixture"}},
             "qr_code":{"entity":{"id":live['qr']}}}
    provider=live['client'].app.state.provider
    provider.qr_payment_matches=False
    assert webhook(live,event_type='qr_code.credited',extra={'payload':payload}).status_code==400
    provider.qr_payment_matches=True
    assert webhook(live,event_type='qr_code.credited',extra={'payload':payload}).status_code==200


def test_verified_capture_is_atomic_and_idempotent(live):
    event_id=str(uuid4())
    first=webhook(live,event_id)
    assert first.status_code==200,first.text
    assert first.json()['outcome']=='captured_awaiting_pickup_otp'
    same=webhook(live,event_id)
    assert same.status_code==200 and same.json()['duplicate'] is True
    different_event=webhook(live)
    assert different_event.status_code==200
    with live['db'].connection() as conn:
        assert conn.execute('SELECT status FROM public.orders WHERE id=%s',(live['order'],)).fetchone()['status']=='Paid'
        assert conn.execute('SELECT count(*) AS n FROM hostelxpress_private.command_outbox WHERE order_id=%s',(live['order'],)).fetchone()['n']==0
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
    assert result.json()['outcome']=='captured_awaiting_pickup_otp'
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
    assert student_pickup(live).status_code==200
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



def test_payment_webhook_rejects_currency_status_and_duplicate_event_identity(live):
    provider=live['client'].app.state.provider
    provider.currency="USD"
    assert webhook(live).status_code==400
    provider.currency="INR"
    provider.status="authorized"
    assert webhook(live).status_code==400
    provider.status="captured"
    event_id=str(uuid4())
    first=webhook(live,event_id)
    assert first.status_code==200,first.text
    assert first.json()['outcome']=='captured_awaiting_pickup_otp'
    # A valid new signature does not allow an old event ID to be reused for a
    # different body; it cannot alter the settled payment or reissue unlocks.
    altered=webhook(live,event_id,event_type='qr_code.credited',
                    extra={'payload':{
                        'payment':{'entity':{'id':'pay_test_fixture'}},
                        'qr_code':{'entity':{'id':live['qr']}}
                    }})
    assert altered.status_code==409
    with live['db'].connection() as conn:
        assert conn.execute("SELECT status FROM public.orders WHERE id=%s",
                            (live['order'],)).fetchone()['status']=='Paid'
        assert conn.execute("SELECT count(*) AS n FROM hostelxpress_private.webhook_inbox",
                            ).fetchone()['n']==1
        assert conn.execute("SELECT count(*) AS n FROM hostelxpress_private.command_outbox "
                            "WHERE order_id=%s",(live['order'],)).fetchone()['n']==0


def test_late_failed_event_after_capture_does_not_revoke_paid_order(live):
    assert webhook(live).status_code==200
    provider=live['client'].app.state.provider
    provider.status='failed'
    late=webhook(live,event_type='payment.failed')
    assert late.status_code==200,late.text
    assert late.json()['outcome']=='ignored_stale_failure'
    with live['db'].connection() as conn:
        assert conn.execute("SELECT status FROM public.orders WHERE id=%s",
                            (live['order'],)).fetchone()['status']=='Paid'
        assert conn.execute("SELECT status FROM public.transactions WHERE order_id=%s",
                            (live['order'],)).fetchone()['status']=='Captured'
        assert conn.execute("SELECT count(*) AS n FROM hostelxpress_private.command_outbox "
                            "WHERE order_id=%s",(live['order'],)).fetchone()['n']==0
        assert conn.execute("SELECT count(*) AS n FROM hostelxpress_private.incidents WHERE order_id=%s",
                            (live['order'],)).fetchone()['n']==0


def test_synthetic_capture_to_signed_inner_lid_completion_without_real_actuation(live):
    """End-to-end financial + device state machine, with no UPI or physical rover."""
    response=webhook(live)
    assert response.status_code==200,response.text
    assert response.json()['outcome']=='captured_awaiting_pickup_otp'
    live['client'].app.dependency_overrides[current_user] = lambda: Principal(live['user'], False)
    payment=live['client'].get('/v1/orders/'+str(live['order'])+'/payment')
    assert payment.status_code==200,payment.text
    assert payment.json()['status']=='paid'
    assert payment.json()['qr_image_url'] is None

    with live['db'].connection() as conn:
        assert conn.execute("SELECT count(*) AS n FROM hostelxpress_private.command_outbox "
                            "WHERE order_id=%s",(live['order'],)).fetchone()['n']==0
    pickup=student_pickup(live)
    assert pickup.status_code==200,pickup.text
    assert pickup.json()['status']=='queued_not_executed'

    with live['db'].connection() as conn:
        row=conn.execute("SELECT * FROM hostelxpress_private.command_outbox "
                         "WHERE order_id=%s AND command='unlock_inner'",(live['order'],)).fetchone()
        assert row['status']=='pending' and row['attempts']==0
        command_id=row['id']
        assert conn.execute("SELECT status FROM public.orders WHERE id=%s",
                            (live['order'],)).fetchone()['status']=='Paid'

    # No physical event is claimed by merely queuing a command. A forged or
    # prematurely executed ACK is refused when the publisher hasn't sent it.
    unauthorized=base(live,'ack')
    unauthorized.update(command_id=str(command_id),order_id=str(live['order']),
                        compartment=1,result='executed')
    ack_before_send=device(live,unauthorized)
    assert ack_before_send.status_code==409,ack_before_send.text

    # Device publisher is simulated by marking the command as published.
    # Actual hardware execution remains a separate robotics-team obligation.
    with live['db'].connection() as conn:
        conn.execute("UPDATE hostelxpress_private.command_outbox SET "
                     "status='published',attempts=1 WHERE id=%s",(command_id,))

    accepted_ack=base(live,'ack')
    accepted_ack.update(command_id=str(command_id),order_id=str(live['order']),
                        compartment=1,result='executed')
    done=device(live,accepted_ack)
    assert done.status_code==200,done.text
    with live['db'].connection() as conn:
        assert conn.execute("SELECT status FROM hostelxpress_private.command_outbox "
                            "WHERE id=%s",(command_id,)).fetchone()['status']=='executed'
        assert conn.execute("SELECT status FROM public.orders WHERE id=%s",
                            (live['order'],)).fetchone()['status']=='Paid'
        assert conn.execute("SELECT status FROM public.bots WHERE id=%s",
                            (live['bot'],)).fetchone()['status']=='UNLOCKED'

    # A signed lid-open event is an observation, not proof the parcel was taken.
    opened=base(live,'event')
    opened.update(observed_at=opened['sent_at'],event_type='inner_lid_opened',
                  order_id=str(live['order']),compartment=1,
                  command_id=str(command_id),inner_closed=False)
    receipt=device(live,opened)
    assert receipt.status_code==200,receipt.text
    with live['db'].connection() as conn:
        assert conn.execute("SELECT status FROM public.orders WHERE id=%s",
                            (live['order'],)).fetchone()['status']=='Paid'

    # Only the correlated closing and empty-compartment sensor observation
    # releases physical custody and marks the order Completed.
    closed=base(live,'event')
    closed.update(observed_at=closed['sent_at'],event_type='inner_lid_closed',
                  order_id=str(live['order']),compartment=1,
                  command_id=str(command_id),inner_closed=True,is_empty=True)
    receipt=device(live,closed)
    assert receipt.status_code==200,receipt.text
    with live['db'].connection() as conn:
        order=conn.execute("SELECT status,completed_at,compartment_released_at "
                           "FROM public.orders WHERE id=%s",(live['order'],)).fetchone()
        assert order['status']=='Completed'
        assert order['completed_at'] is not None
        assert order['compartment_released_at'] is not None
        assert conn.execute("SELECT count(*) AS n FROM hostelxpress_private.command_outbox "
                            "WHERE order_id=%s",(live['order'],)).fetchone()['n']==1
        assert conn.execute("SELECT count(*) AS n FROM public.transactions "
                            "WHERE order_id=%s AND status='Captured'",(live['order'],)).fetchone()['n']==1
