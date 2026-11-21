"""Razorpay QR contract tests with a disposable PostgreSQL 17 database.

No Razorpay credentials, network payments or enrolled rover are used. These
tests validate the real HTTP + SQL path against an explicit provider double.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from psycopg.types.json import Jsonb

from app import service
from app.auth import Principal, current_user
from app.config import Settings
from app.main import create_app


class FakeQR:
    def __init__(self):
        self.calls=0
        self.overrides={}
        self.failure=False
        self.close_by=None
    def create_qr(self,order_id,request_id,expires_at):
        self.calls += 1
        if self.failure:
            raise HTTPException(502,'The test provider timed out')
        self.close_by=int((service.now()+timedelta(minutes=15)).timestamp())
        return {
            'id':'qr_test_RiderPaymentContract2026',
            'type':'upi_qr','status':'active','usage':'single_use',
            'payment_amount':1000,'fixed_amount':True,
            'close_by':self.close_by,'image_url':'https://rzp.io/i/test-contract',
            **self.overrides,
        }


@pytest.fixture
def payment_api(db,database_url):
    user,bot,order=uuid4(),uuid4(),uuid4()
    with db.connection() as conn:
        conn.execute('INSERT INTO auth.users(id,raw_user_meta_data) VALUES(%s,%s)',
                     (user,Jsonb({'name':'Payment contract fixture'})))
        conn.execute("INSERT INTO public.bots(id,status,last_seen_at,is_demo) "
                     "VALUES(%s,'AT_HOSTEL',now(),false)",(bot,))
        conn.execute("INSERT INTO public.orders(id,user_id,bot_id,compartment_id,status,destination_hostel_block,is_demo) "
                     "VALUES(%s,%s,%s,1,'Arrived','A',false)",(order,user,bot))
    settings=Settings(app_env='production',database_url=database_url,
        supabase_url='https://example.supabase.co',worker_enabled=False,
        razorpay_key_id='rzp_test_disposable_fixture_only',
        razorpay_key_secret='not-a-real-key',
        razorpay_webhook_secret='not-a-real-webhook-secret',
        trusted_hosts='testserver')
    with TestClient(create_app(settings)) as client:
        client.app.dependency_overrides[current_user]=lambda: Principal(user, False)
        provider=FakeQR()
        client.app.state.provider=provider
        yield {'client':client,'db':db,'user':user,'bot':bot,'order':order,'provider':provider}


def pay(env):
    return env['client'].post('/v1/orders/'+str(env['order'])+'/payment')


def test_create_fixed_price_single_use_qr_once_and_preserve_actual_provider_expiry(payment_api):
    env=payment_api
    first=pay(env)
    assert first.status_code==200,first.text
    body=first.json()
    assert body['amount']==1000 and body['currency']=='INR'
    assert body['provider']=='razorpay' and body['status']=='pending'
    assert body['qr_id']=='qr_test_RiderPaymentContract2026'
    assert body['qr_image_url']=='https://rzp.io/i/test-contract'
    assert int(datetime.fromisoformat(body['expires_at']).timestamp())==env['provider'].close_by
    repeat=pay(env)
    assert repeat.status_code==200 and repeat.json()['qr_id']==body['qr_id']
    assert env['provider'].calls==1
    with env['db'].connection() as conn:
        row=conn.execute('SELECT * FROM public.transactions WHERE order_id=%s',(env['order'],)).fetchone()
        assert row['provider_state']=='ready' and row['status']=='Pending'
        assert int(row['expires_at'].timestamp())==env['provider'].close_by
        assert conn.execute('SELECT count(*) AS n FROM public.transactions WHERE order_id=%s',
                            (env['order'],)).fetchone()['n']==1


@pytest.mark.parametrize('bad_response',[
    {'payment_amount':999},
    {'fixed_amount':False},
    {'usage':'multiple_use'},
    {'type':'other_qr'},
    {'status':'closed'},
    {'id':'unsafe-id'},
    {'close_by':True},
    {'close_by':'bad-timestamp'},
    {'close_by':2147483647},
    {'image_url':'http://insecure.example/qr.png'},
    {'image_url':[]},
])
def test_malformed_provider_qr_fails_closed_without_issuing_second_qr(payment_api,bad_response):
    env=payment_api
    env['provider'].overrides=bad_response
    first=pay(env)
    assert first.status_code==502,first.text
    duplicate=pay(env)
    assert duplicate.status_code==409,duplicate.text
    assert env['provider'].calls==1
    with env['db'].connection() as conn:
        row=conn.execute('SELECT provider_state,status,razorpay_qr_id FROM public.transactions WHERE order_id=%s',
                         (env['order'],)).fetchone()
        assert row['provider_state']=='creating' and row['razorpay_qr_id'] is None
        assert row['status']=='Pending'


def test_timeout_never_creates_another_qr_when_result_is_ambiguous(payment_api):
    env=payment_api
    env['provider'].failure=True
    assert pay(env).status_code==502
    assert pay(env).status_code==409
    assert env['provider'].calls==1


def test_expired_qr_requires_reconciliation_not_an_automatic_second_charge(payment_api):
    env=payment_api
    assert pay(env).status_code==200
    with env['db'].connection() as conn:
        conn.execute("UPDATE public.transactions SET expires_at=now()-interval '1 minute' WHERE order_id=%s",
                     (env['order'],))
    response=pay(env)
    assert response.status_code==409
    assert 'expired' in response.json()['detail'].lower()
    assert env['provider'].calls==1


def test_different_student_cannot_create_or_view_anothers_payment(payment_api):
    env=payment_api
    env['client'].app.dependency_overrides[current_user]=lambda: Principal(uuid4(), False)
    assert pay(env).status_code==404
    assert env['provider'].calls==0
    with env['db'].connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM public.transactions WHERE order_id=%s',
                            (env['order'],)).fetchone()['n']==0
