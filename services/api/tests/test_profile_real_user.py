from __future__ import annotations

import os
from datetime import datetime,timedelta,timezone
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from psycopg.errors import InsufficientPrivilege
from psycopg.types.json import Jsonb

from app.config import Settings
from app.main import create_app
from app.models import Booking
from app.service import book

# Real-mode Supabase Auth verification uses ES256/RS256 JWKS. The suite mints a
# local ES256 key and swaps app.state.jwks for a stub, so token verification
# stays fully offline while exercising the production code path unchanged.
SIGNING_KEY=ec.generate_private_key(ec.SECP256R1())


class StubJwks:
    def __init__(self,key):
        self.key=key
    def get_signing_key_from_jwt(self,token):
        return SimpleNamespace(key=self.key)


@pytest.fixture
def real(db,database_url):
    user=uuid4()
    with db.connection() as conn:
        # auth.users insert fires hostelxpress_auth_user_created, which seeds the
        # public.users profile row exactly like a real Supabase signup would.
        conn.execute('INSERT INTO auth.users(id,raw_user_meta_data) VALUES(%s,%s)',(user,Jsonb({'name':'Signup Name'})))
    settings=Settings(app_env='production',database_url=database_url,supabase_url='https://example.supabase.co',
                      worker_enabled=False,trusted_hosts='testserver')
    with TestClient(create_app(settings)) as client:
        client.app.state.jwks=StubJwks(SIGNING_KEY.public_key())
        def token(**overrides):
            now=datetime.now(timezone.utc)
            claims={'sub':str(user),'iss':settings.issuer,'aud':'authenticated','role':'authenticated',
                    'iat':now,'exp':now+timedelta(minutes=10)}
            claims.update(overrides)
            return jwt.encode(claims,SIGNING_KEY,algorithm='ES256')
        yield {'client':client,'db':db,'user':user,'token':token}


def headers(real,**claims):
    return {'Authorization':'Bearer '+real['token'](**claims)}


def test_staging_booking_is_idempotent_and_has_no_rover_or_payment(real,database_url):
    settings=Settings(app_env='production',database_url=database_url,supabase_url='https://example.supabase.co',
                      worker_enabled=False,trusted_hosts='testserver',staging_booking_user_id=real['user'])
    with TestClient(create_app(settings)) as client:
        client.app.state.jwks=StubJwks(SIGNING_KEY.public_key())
        key=str(uuid4())
        payload={'destination_hostel_block':'B','parcel_label':'Staging test parcel'}
        denied=client.post('/v1/orders',headers={**headers(real,sub=str(uuid4())),'Idempotency-Key':key},json=payload)
        assert denied.status_code==403,denied.text
        booked=client.post('/v1/orders',headers={**headers(real),'Idempotency-Key':key},json=payload)
        assert booked.status_code==201,booked.text
        order=booked.json()
        assert order['status']=='Pending' and order['is_demo'] is True
        assert order['bot_id'] is None and order['compartment_id'] is None and order['payment_status'] is None
        retry=client.post('/v1/orders',headers={**headers(real),'Idempotency-Key':key},json=payload)
        assert retry.status_code==201 and retry.json()==order
        assert client.get('/v1/orders',headers=headers(real)).json()=={'items':[order]}
        assert client.post('/v1/orders/'+order['id']+'/payment',headers=headers(real)).status_code==503


def test_staging_database_role_can_only_create_unassigned_test_orders(real):
    with real['db'].connection() as conn:
        conn.execute('CREATE ROLE hostelxpress_health NOLOGIN NOINHERIT NOBYPASSRLS')
        conn.execute('GRANT USAGE ON SCHEMA public, hostelxpress_private TO hostelxpress_health')
        conn.execute('GRANT SELECT (id, name, hostel_block) ON public.users TO hostelxpress_health')
        conn.execute('GRANT SELECT ON public.orders TO hostelxpress_health')
        conn.execute('CREATE POLICY test_profile_read ON public.users FOR SELECT TO hostelxpress_health USING (true)')
        conn.execute('CREATE POLICY test_order_read ON public.orders FOR SELECT TO hostelxpress_health USING (true)')
        permissions=Path(__file__).resolve().parents[3]/'supabase/staging/booking_permissions.sql'
        conn.execute(permissions.read_text())
        conn.execute('INSERT INTO hostelxpress_private.staging_booking_accounts VALUES (%s)',(real['user'],))
        other=uuid4()
        conn.execute('INSERT INTO auth.users (id) VALUES (%s)',(other,))
        conn.execute('SET LOCAL ROLE hostelxpress_health')
        order=book(conn,real['user'],Booking(destination_hostel_block='B',parcel_label='Test parcel'),uuid4(),False,staging=True)
        assert order['status']=='Pending' and order['bot_id'] is None and order['payment_status'] is None
        assert order['timeline'][0]['status']=='Pending'
        for account,is_demo in ((other,True),(real['user'],False)):
            with pytest.raises(InsufficientPrivilege),conn.transaction():
                conn.execute("INSERT INTO public.orders(user_id,destination_hostel_block,is_demo) VALUES(%s,'B',%s)",(account,is_demo))
        with pytest.raises(InsufficientPrivilege),conn.transaction():
            conn.execute('UPDATE public.orders SET compartment_id=1 WHERE id=%s',(order['id'],))
        with pytest.raises(InsufficientPrivilege),conn.transaction():
            conn.execute('INSERT INTO public.transactions(order_id) VALUES(%s)',(order['id'],))
        conn.rollback()


def test_real_first_profile_completion_creates_row(real):
    with real['db'].connection() as conn:
        conn.execute('DELETE FROM public.users WHERE id=%s',(real['user'],))
    response=real['client'].patch('/v1/me',headers=headers(real),json={'name':'Priya Sharma','hostel_block':'B'})
    assert response.status_code==200,response.text
    assert response.json()['name']=='Priya Sharma' and response.json()['hostel_block']=='B'
    with real['db'].connection() as conn:
        row=conn.execute('SELECT name,hostel_block,created_at,updated_at FROM public.users WHERE id=%s',(real['user'],)).fetchone()
        assert row['name']=='Priya Sharma' and row['hostel_block']=='B'
        assert row['created_at'] is not None and row['updated_at'] is not None


def test_real_partial_patch_keeps_existing_name(real):
    # Regression: the upsert coalesced a missing name to 'Student' in the VALUES
    # clause, so excluded.name was never NULL and a hostel_block-only PATCH
    # reset an existing profile's name to 'Student'.
    response=real['client'].patch('/v1/me',headers=headers(real),json={'hostel_block':'D'})
    assert response.status_code==200,response.text
    assert response.json()['name']=='Signup Name'
    with real['db'].connection() as conn:
        row=conn.execute('SELECT name,hostel_block FROM public.users WHERE id=%s',(real['user'],)).fetchone()
        assert row['name']=='Signup Name' and row['hostel_block']=='D'


def test_real_patch_updates_both_fields_and_touches_updated_at(real):
    with real['db'].connection() as conn:
        before=conn.execute('SELECT updated_at FROM public.users WHERE id=%s',(real['user'],)).fetchone()['updated_at']
    response=real['client'].patch('/v1/me',headers=headers(real),json={'name':'New Name','hostel_block':'C'})
    assert response.status_code==200,response.text
    assert response.json()=={'id':str(real['user']),'name':'New Name','hostel_block':'C'}
    with real['db'].connection() as conn:
        after=conn.execute('SELECT updated_at FROM public.users WHERE id=%s',(real['user'],)).fetchone()['updated_at']
        assert after>before


def test_real_patch_only_touches_own_row(real):
    other=uuid4()
    with real['db'].connection() as conn:
        conn.execute('INSERT INTO auth.users(id,raw_user_meta_data) VALUES(%s,%s)',(other,Jsonb({'name':'Other Student'})))
    assert real['client'].patch('/v1/me',headers=headers(real),json={'name':'Me','hostel_block':'Z'}).status_code==200
    with real['db'].connection() as conn:
        row=conn.execute('SELECT name,hostel_block FROM public.users WHERE id=%s',(other,)).fetchone()
        assert row['name']=='Other Student' and row['hostel_block'] is None


def test_real_empty_patch_creates_nothing(real):
    with real['db'].connection() as conn:
        conn.execute('DELETE FROM public.users WHERE id=%s',(real['user'],))
    assert real['client'].patch('/v1/me',headers=headers(real),json={}).status_code==404
    with real['db'].connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM public.users WHERE id=%s',(real['user'],)).fetchone()['n']==0


def test_real_patch_rejects_null_fields(real):
    response=real['client'].patch('/v1/me',headers=headers(real),json={'name':None})
    assert response.status_code==422,response.text


def test_demo_mode_token_never_reaches_the_real_branch(real):
    now=datetime.now(timezone.utc)
    token=jwt.encode({'sub':str(real['user']),'iss':'hostelxpress-local-demo','aud':'hostelxpress-demo',
                      'iat':now,'exp':now+timedelta(hours=1),'mode':'demo'},
                     'attacker-chosen-secret-long-enough-for-hs256',algorithm='HS256')
    assert real['client'].get('/v1/me',headers={'Authorization':'Bearer '+token}).status_code==401


def test_nonexistent_jwt_subject_cannot_materialize_a_row(real):
    # Defense in depth: public.users.id references auth.users(id), so a validly
    # signed token for an unknown subject fails closed instead of creating data.
    ghost=str(uuid4())
    response=real['client'].patch('/v1/me',headers=headers(real,sub=ghost),json={'name':'Ghost','hostel_block':'X'})
    assert response.status_code==503,response.text
    with real['db'].connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM public.users WHERE id=%s',(ghost,)).fetchone()['n']==0
        assert conn.execute('SELECT count(*) AS n FROM public.users WHERE id=%s',(real['user'],)).fetchone()['n']==1


def test_auth_trigger_seeds_profile_names_from_metadata(db):
    # SQL-boundary contract of hostelxpress_auth_user_created, reproduced
    # against the disposable schema: the trigger stores the canonical 'name'
    # metadata key (the key the app sends so the name survives email
    # confirmation on any deployed trigger version) and seeds the DDL default
    # when it is absent. Legacy full_name-only metadata is deliberately not
    # consumed by SQL (recorded 29 October decision): onboarding reads it only
    # for missing fields and Profile -> Edit remains the recovery path.
    named,legacy,unnamed=uuid4(),uuid4(),uuid4()
    with db.connection() as conn:
        conn.execute('INSERT INTO auth.users(id,raw_user_meta_data) VALUES(%s,%s)',(named,Jsonb({'name':'Trigger Name'})))
        conn.execute('INSERT INTO auth.users(id,raw_user_meta_data) VALUES(%s,%s)',(legacy,Jsonb({'full_name':'Legacy Full Name'})))
        conn.execute('INSERT INTO auth.users(id,raw_user_meta_data) VALUES(%s,%s)',(unnamed,Jsonb({})))
    with db.connection() as conn:
        assert conn.execute('SELECT name FROM public.users WHERE id=%s',(named,)).fetchone()['name']=='Trigger Name'
        assert conn.execute('SELECT name FROM public.users WHERE id=%s',(legacy,)).fetchone()['name']=='Student'
        assert conn.execute('SELECT name FROM public.users WHERE id=%s',(unnamed,)).fetchone()['name']=='Student'
