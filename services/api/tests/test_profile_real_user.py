from __future__ import annotations

import os
from datetime import datetime,timedelta,timezone
from types import SimpleNamespace
from uuid import uuid4

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from psycopg.types.json import Jsonb

from app.config import Settings
from app.main import create_app

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
