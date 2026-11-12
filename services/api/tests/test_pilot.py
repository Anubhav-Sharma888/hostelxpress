from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

# After Hours pilot acceptance: schedule boundary, frozen quotes, capacity
# races, merchant access restrictions, rejection, and the payment/collection
# distinction. Everything runs on the disposable schema; fees are backend data.


@pytest.fixture(scope='module')
def api(database_url):
    settings=Settings(app_env='test',database_url=database_url,
                      worker_enabled=False,trusted_hosts='testserver,localhost,127.0.0.1')
    with TestClient(create_app(settings)) as client:
        yield client


@pytest.fixture
def fresh(api):
    with psycopg.connect(api.app.state.settings.database_url,autocommit=True) as conn:
        conn.execute('TRUNCATE public.pilot_orders,public.pilot_quotes,public.pilot_departures,public.pilot_items,public.pilot_merchants,public.pilot_schedule RESTART IDENTITY CASCADE')
        conn.execute("INSERT INTO public.pilot_schedule(id,start_local,end_local,tuck_fee_paise,hot_food_fee_paise) VALUES(true,'01:30','03:30',1000,2000)")
    return api


def student(api,name='Pilot Student',hostel='C'):
    response=api.post('/auth/demo',json={'name':name,'hostel_block':hostel})
    assert response.status_code==200,response.text
    token=response.json()['access_token']
    return {'Authorization':'Bearer '+token}


def seed_merchant(api,slug,kind='tuck_shop',token=None,capacity=2):
    with psycopg.connect(api.app.state.settings.database_url,autocommit=True) as conn:
        merchant_id=conn.execute("INSERT INTO public.pilot_merchants(slug,name,kind,hostel_block,staff_token) VALUES(%s,%s,%s,'C',%s) RETURNING id",
                                 (slug,slug.title(),kind,token or 'token-'+slug)).fetchone()[0]
        item_id=conn.execute("INSERT INTO public.pilot_items(merchant_id,name,price_paise) VALUES(%s,%s,%s) RETURNING id",
                             (merchant_id,'Test paratha',5000)).fetchone()[0]
        ist=datetime.now(timezone(timedelta(hours=5,minutes=30)))
        departure_id=conn.execute("INSERT INTO public.pilot_departures(merchant_id,hostel_block,window_start,window_end,capacity) VALUES(%s,'C',%s,%s,%s) RETURNING id",
                                  (merchant_id,ist+timedelta(minutes=5),ist+timedelta(minutes=65),capacity)).fetchone()[0]
        return {'merchant_id':str(merchant_id),'item_id':str(item_id),'departure_id':str(departure_id)}


def quote(api,auth,seed,quantity=1):
    response=api.post('/v1/pilot/quotes',headers=auth,json={'merchant_id':seed['merchant_id'],'departure_id':seed['departure_id'],
                                                            'items':[{'item_id':seed['item_id'],'quantity':quantity}]})
    assert response.status_code==200,response.text
    return response.json()


def ist_now():
    return datetime.now(timezone(timedelta(hours=5,minutes=30)))


def set_schedule(api,start,end):
    with psycopg.connect(api.app.state.settings.database_url,autocommit=True) as conn:
        conn.execute('UPDATE public.pilot_schedule SET start_local=%s,end_local=%s WHERE id=true',
                     (start.time().replace(tzinfo=None),end.time().replace(tzinfo=None)))


def test_schedule_defaults_to_0130_asia_kolkata(fresh):
    body=fresh.get('/v1/pilot/schedule',headers=student(fresh)).json()
    assert body['start_local']=='01:30:00' and body['end_local']=='03:30:00'
    assert body['timezone']=='Asia/Kolkata' and body['tuck_fee_paise']==1000 and body['hot_food_fee_paise']==2000


def test_tuck_shop_quote_freezes_price_and_total(fresh):
    seed=seed_merchant(fresh,'tuck-a')
    auth=student(fresh)
    priced=quote(fresh,auth,seed)
    assert priced['fee_paise']==1000 and priced['total_paise']==6000
    with psycopg.connect(fresh.app.state.settings.database_url,autocommit=True) as conn:
        conn.execute('UPDATE public.pilot_items SET price_paise=9999')
    order=fresh.post('/v1/pilot/orders',headers=auth,json={'quote_id':priced['quote_id']})
    assert order.status_code==201,order.text
    body=order.json()
    assert body['fee_paise']==1000 and body['total_paise']==6000, 'the saved quote, not a recomputed price, must be charged'


def test_after_hours_boundary_gates_hot_food_only(fresh):
    seed=seed_merchant(fresh,'hot-a',kind='hot_food')
    tuck=seed_merchant(fresh,'tuck-b')
    auth=student(fresh)
    now=ist_now()
    set_schedule(fresh,now+timedelta(minutes=1),now+timedelta(minutes=90))
    closed=fresh.post('/v1/pilot/quotes',headers=auth,json={'merchant_id':seed['merchant_id'],'departure_id':seed['departure_id'],
                                                            'items':[{'item_id':seed['item_id'],'quantity':1}]})
    assert closed.status_code==409,closed.text
    assert fresh.post('/v1/pilot/quotes',headers=auth,json={'merchant_id':tuck['merchant_id'],'departure_id':tuck['departure_id'],
                                                            'items':[{'item_id':tuck['item_id'],'quantity':1}]}).status_code==200
    set_schedule(fresh,now-timedelta(minutes=1),now+timedelta(minutes=90))
    opened=quote(fresh,auth,seed)
    assert opened['fee_paise']==2000


def test_two_students_cannot_both_claim_the_last_compartment(fresh):
    seed=seed_merchant(fresh,'tuck-c',capacity=1)
    a=student(fresh,'Student A')
    first=quote(fresh,a,seed)
    first_order=fresh.post('/v1/pilot/orders',headers=a,json={'quote_id':first['quote_id']})
    assert first_order.status_code==201,first_order.text
    b=student(fresh,'Student B')
    second=quote(fresh,b,seed)
    second_order=fresh.post('/v1/pilot/orders',headers=b,json={'quote_id':second['quote_id']})
    assert second_order.status_code==409 and 'last compartment' in second_order.json()['detail']


def test_merchant_sees_and_acts_only_on_own_orders(fresh):
    a=seed_merchant(fresh,'own-a',token='staff-a')
    b=seed_merchant(fresh,'own-b',token='staff-b')
    auth=student(fresh)
    order=fresh.post('/v1/pilot/orders',headers=auth,json={'quote_id':quote(fresh,auth,a)['quote_id']})
    order_id=order.json()['order_id']
    theirs=fresh.get('/v1/pilot/merchant/orders',headers={'X-Pilot-Token':'staff-b'}).json()['orders']
    assert all(row['order_id']!=order_id for row in theirs)
    assert fresh.post(f'/v1/pilot/merchant/orders/{order_id}/accept',headers={'X-Pilot-Token':'staff-b'}).status_code==404
    assert fresh.post(f'/v1/pilot/merchant/orders/{order_id}/accept',headers={'X-Pilot-Token':'staff-a'}).status_code==200
    assert fresh.post(f'/v1/pilot/merchant/orders/{order_id}/reject',headers={'X-Pilot-Token':'staff-a'}).status_code==200


def test_rejected_order_frees_capacity(fresh):
    seed=seed_merchant(fresh,'tuck-d',capacity=1)
    auth=student(fresh)
    b=student(fresh,'Student B')
    first_order_id=fresh.post('/v1/pilot/orders',headers=auth,json={'quote_id':quote(fresh,auth,seed)['quote_id']}).json()['order_id']
    assert fresh.post('/v1/pilot/quotes',headers=auth,json={'merchant_id':seed['merchant_id'],'departure_id':seed['departure_id'],
                                                            'items':[{'item_id':seed['item_id'],'quantity':1}]}).status_code==200
    second_quote=quote(fresh,b,seed)
    assert fresh.post('/v1/pilot/orders',headers=b,json={'quote_id':second_quote['quote_id']}).status_code==409
    assert fresh.post(f'/v1/pilot/merchant/orders/{first_order_id}/reject',headers={'X-Pilot-Token':'token-tuck-d'}).status_code==200
    assert fresh.post('/v1/pilot/orders',headers=b,json={'quote_id':second_quote['quote_id']}).status_code==201


def test_payment_loading_and_collection_stay_distinct(fresh):
    seed=seed_merchant(fresh,'tuck-e')
    auth=student(fresh)
    order_id=fresh.post('/v1/pilot/orders',headers=auth,json={'quote_id':quote(fresh,auth,seed)['quote_id']}).json()['order_id']
    staff={'X-Pilot-Token':'token-tuck-e'}
    assert fresh.post(f'/v1/pilot/merchant/orders/{order_id}/request_rover',headers=staff).status_code==409, 'rover before ready must refuse'
    assert fresh.post(f'/v1/pilot/merchant/orders/{order_id}/accept',headers=staff).status_code==200
    assert fresh.post(f'/v1/pilot/merchant/orders/{order_id}/ready',headers=staff).status_code==200
    assert fresh.post(f'/v1/pilot/merchant/orders/{order_id}/request_rover',headers=staff).status_code==409, 'rover before payment must refuse'
    status_before_pay=fresh.get('/v1/pilot/orders',headers=auth).json()['orders'][0]['status']
    paid=fresh.post(f'/v1/pilot/orders/{order_id}/pay',headers=auth).json()
    assert paid['payment_status']=='SimPaid', 'payment must be recorded'
    assert paid['status']==status_before_pay, 'payment must not advance the fulfilment status'
    assert fresh.post(f'/v1/pilot/merchant/orders/{order_id}/request_rover',headers=staff).status_code==200
    loaded=fresh.post(f'/v1/pilot/merchant/orders/{order_id}/confirm_loading',headers=staff).json()
    assert loaded['status']=='Loaded'
    mine=fresh.get('/v1/pilot/orders',headers=auth).json()['orders'][0]
    assert mine['payment_status']=='SimPaid' and mine['status']=='Loaded'


def test_insulated_bay_appears_only_after_backend_assignment(fresh):
    seed=seed_merchant(fresh,'hot-bay',kind='hot_food')
    now=ist_now()
    set_schedule(fresh,now-timedelta(minutes=1),now+timedelta(minutes=90))
    auth=student(fresh)
    order_id=fresh.post('/v1/pilot/orders',headers=auth,json={'quote_id':quote(fresh,auth,seed)['quote_id']}).json()['order_id']
    before=fresh.get('/v1/pilot/merchants',headers=auth).json()['merchants']
    assert all(row['insulated_bay'] is None for row in before if row['merchant_id']==seed['merchant_id'])
    assert fresh.post(f'/v1/pilot/merchant/orders/{order_id}/accept',headers={'X-Pilot-Token':'token-hot-bay'}).status_code==200
    after=fresh.get('/v1/pilot/merchants',headers=auth).json()['merchants']
    bay=[row['insulated_bay'] for row in after if row['merchant_id']==seed['merchant_id']][0]
    assert bay=='Bay 01'
    mine=fresh.get('/v1/pilot/orders',headers=auth).json()['orders'][0]
    assert mine['insulated_bay']=='Bay 01'
