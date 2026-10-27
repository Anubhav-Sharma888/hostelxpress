from __future__ import annotations

import os
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg.conninfo import conninfo_to_dict

TEST_URL=os.environ.get('TEST_DATABASE_URL','')
os.environ.setdefault('DATABASE_URL',TEST_URL or 'host=/tmp dbname=hostelxpress_test user=postgres')
os.environ.setdefault('APP_ENV','test')

from app.config import Settings
from app.main import create_app

ROOT=Path(__file__).resolve().parents[3]


@pytest.fixture(scope='session')
def database_url():
    if os.environ.get('HOSTELXPRESS_TEST_DATABASE')!='disposable' or not TEST_URL:
        pytest.skip('Set TEST_DATABASE_URL and HOSTELXPRESS_TEST_DATABASE=disposable for isolated database tests')
    params=conninfo_to_dict(TEST_URL)
    if not params.get('dbname','').endswith('_test'):
        raise RuntimeError('Destructive tests require a separate database name ending in _test')
    if params.get('host','') not in {'','localhost','127.0.0.1','::1'} and not params.get('host','').startswith('/'):
        raise RuntimeError('Destructive tests refuse a remote database')
    with psycopg.connect(TEST_URL,autocommit=True) as conn:
        existing=conn.execute("SELECT to_regclass('hostelxpress_private.schema_migrations')").fetchone()[0]
        if not existing:
            if conn.execute("SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='auth') OR EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public')").fetchone()[0]:
                raise RuntimeError('Refusing to initialize a nonempty test database')
            # The bootstrap role names are cluster-wide. A shared disposable cluster
            # may already contain them from another isolated database.
            roles=conn.execute("SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')").fetchone()[0]
            fixture=(ROOT/'supabase/tests/bootstrap_local_auth.sql').read_text()
            if roles:
                if roles!=3:
                    raise RuntimeError('Partial Auth fixture roles found; use a fresh disposable cluster')
                fixture=fixture.replace("  if exists (select 1 from pg_roles where rolname in ('anon', 'authenticated', 'service_role')) then\n    raise exception 'Refusing test bootstrap: test role names already exist';\n  end if;\n",'')
                fixture=fixture.replace('create role anon nologin;','').replace('create role authenticated nologin;','').replace('create role service_role nologin bypassrls;','')
            conn.execute(fixture)
            conn.execute((ROOT/'supabase/init.sql').read_text())
        for migration in sorted((ROOT/'supabase/migrations').glob('*.sql')):
            marker=conn.execute('SELECT EXISTS(SELECT 1 FROM hostelxpress_private.schema_migrations WHERE version=%s)',(migration.stem,)).fetchone()[0] if conn.execute("SELECT to_regclass('hostelxpress_private.schema_migrations')").fetchone()[0] else False
            if not marker:
                conn.execute(migration.read_text())
    return TEST_URL


@pytest.fixture
def client(database_url):
    with psycopg.connect(database_url,autocommit=True) as conn:
        conn.execute('TRUNCATE auth.users,public.users,public.bots,public.orders,public.transactions,public.order_events,hostelxpress_private.webhook_inbox RESTART IDENTITY CASCADE')
    settings=Settings(app_env='test',database_url=database_url,worker_enabled=False,
                      trusted_hosts='testserver,localhost,127.0.0.1')
    with TestClient(create_app(settings)) as test_client:
        yield test_client


@pytest.fixture
def db(client):
    return client.app.state.db


@pytest.fixture
def login(client):
    def create(name='Alice',hostel='A'):
        result=client.post('/auth/demo',json={'name':name,'hostel_block':hostel})
        assert result.status_code==200,result.text
        body=result.json()
        return {'Authorization':'Bearer '+body['access_token']},body['user']
    return create


@pytest.fixture
def booking(client,login):
    def create(headers=None,hostel='A',parcel_label='Dinner'):
        if headers is None:
            headers,_=login()
        response=client.post('/v1/orders',headers={**headers,'Idempotency-Key':str(uuid4())},
                             json={'destination_hostel_block':hostel,'parcel_label':parcel_label})
        assert response.status_code==201,response.text
        return headers,response.json()
    return create
