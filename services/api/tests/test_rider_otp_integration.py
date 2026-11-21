"""Gate 2 OTP tests: disposable PostgreSQL + fake signed rover, no external calls."""
from __future__ import annotations

import hashlib
import hmac
import json
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from psycopg.types.json import Jsonb

from app.config import Settings
from app.main import create_app

OPERATOR_KEY="gate-operator-fixture-" + "G" * 40
OTP_SECRET="otp-test-fixture-secret-" + "S" * 40
DEVICE_SECRET=b"disposable-device-hmac-secret-with-32-bytes"


@pytest.fixture
def gate(db,database_url):
    user,bot,order=uuid4(),uuid4(),uuid4()
    with db.connection() as conn:
        conn.execute('INSERT INTO auth.users(id,raw_user_meta_data) VALUES(%s,%s)',
                     (user,Jsonb({'name':'OTP test owner'})))
        conn.execute(
            "INSERT INTO public.bots(id,status,last_seen_at,is_demo) "
            "VALUES(%s,'IDLE_AT_GATE',now(),false)",(bot,))
        conn.execute('INSERT INTO hostelxpress_private.device_state(bot_id,clock_synchronized) VALUES(%s,true)',(bot,))
        conn.execute('INSERT INTO hostelxpress_private.device_credentials(bot_id,secret) VALUES(%s,%s)',(bot,DEVICE_SECRET))
        for n in range(1,4):
            conn.execute('INSERT INTO hostelxpress_private.compartment_state'
                         '(bot_id,compartment_id,outer_closed,inner_closed,is_empty,observed_at) '
                         'VALUES(%s,%s,true,true,true,now())',(bot,n))
        conn.execute("INSERT INTO public.orders(id,user_id,bot_id,compartment_id,status,destination_hostel_block,is_demo) "
                     "VALUES(%s,%s,%s,2,'Pending','B',false)",(order,user,bot))
    settings=Settings(app_env='production',database_url=database_url,
        supabase_url='https://example.supabase.co',gate_operator_token=OPERATOR_KEY,
        rider_otp_secret=OTP_SECRET,worker_enabled=False,trusted_hosts='testserver')
    with TestClient(create_app(settings)) as client:
        yield {'db':db,'client':client,'user':user,'bot':bot,'order':order}


def issue(g,token=OPERATOR_KEY):
    headers={} if token is None else {'X-Gate-Operator-Key':token}
    return g['client'].post(f"/v1/operator/orders/{g['order']}/rider-otp",headers=headers)


def submit(g,code,*,order_id=None,compartment=2,bad_signature=False):
    path=f"/v1/devices/{g['bot']}/rider-otp"
    body=json.dumps({'order_id':str(order_id or g['order']),'compartment':compartment,'code':code},
                    separators=(',',':')).encode()
    timestamp=str(int(datetime.now(timezone.utc).timestamp()))
    signature=hmac.new(DEVICE_SECRET,f"{timestamp}.POST.{path}.".encode()+body,hashlib.sha256).hexdigest()
    if bad_signature:
        signature="0"*64
    return g['client'].post(path,content=body,headers={
        'Content-Type':'application/json','X-Device-Timestamp':timestamp,
        'X-Device-Signature':signature})


def test_operator_auth_secret_storage_and_client_denial(gate):
    assert issue(gate,None).status_code==401
    assert issue(gate,'wrong').status_code==401
    result=issue(gate)
    assert result.status_code==200,result.text
    code=result.json()['code']
    assert len(code)==6 and code.isascii() and code.isdigit()
    assert result.json()['delivery_channel']=='operator_manual_handoff'
    assert result.headers['cache-control']=='no-store'
    with gate['db'].connection() as conn:
        row=conn.execute('SELECT * FROM hostelxpress_private.rider_otp_challenges WHERE order_id=%s',
                         (gate['order'],)).fetchone()
        assert code not in str(row) and row['attempts']==0
        for role in ('anon','authenticated'):
            assert conn.execute("SELECT has_table_privilege(%s,'hostelxpress_private.rider_otp_challenges','SELECT') AS permitted",
                                (role,)).fetchone()['permitted'] is False


def test_correct_signed_code_is_single_use_and_only_queues_command(gate):
    code=issue(gate).json()['code']
    response=submit(gate,code)
    assert response.status_code==200,response.text
    assert response.json()['accepted'] is True and response.json()['status']=='queued_not_executed'
    assert submit(gate,code).status_code==403
    with gate['db'].connection() as conn:
        cmd=conn.execute('SELECT * FROM hostelxpress_private.command_outbox WHERE order_id=%s',
                         (gate['order'],)).fetchone()
        assert cmd['command']=='unlock_outer' and cmd['status']=='pending'
        assert cmd['attempts']==0 and cmd['compartment']==2 and cmd['bot_id']==gate['bot']
        assert conn.execute('SELECT count(*) AS n FROM hostelxpress_private.command_outbox WHERE order_id=%s',
                            (gate['order'],)).fetchone()['n']==1
        challenge=conn.execute('SELECT attempts,consumed_at FROM hostelxpress_private.rider_otp_challenges '
                               'WHERE order_id=%s',(gate['order'],)).fetchone()
        assert challenge['attempts']==1 and challenge['consumed_at'] is not None
        assert conn.execute('SELECT status FROM public.orders WHERE id=%s',
                            (gate['order'],)).fetchone()['status']=='Pending'


def test_three_wrong_attempts_persist_despite_error_status(gate):
    code=issue(gate).json()['code']
    wrong='999999' if code!='999999' else '888888'
    for n in range(1,4):
        assert submit(gate,wrong).status_code==403
        with gate['db'].connection() as conn:
            assert conn.execute('SELECT attempts FROM hostelxpress_private.rider_otp_challenges WHERE order_id=%s',
                                (gate['order'],)).fetchone()['attempts']==n
    assert submit(gate,code).status_code==403
    with gate['db'].connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM hostelxpress_private.command_outbox WHERE order_id=%s',
                            (gate['order'],)).fetchone()['n']==0


def test_bad_device_signature_cannot_guess(gate):
    code=issue(gate).json()['code']
    assert submit(gate,code,bad_signature=True).status_code==401
    with gate['db'].connection() as conn:
        assert conn.execute('SELECT attempts FROM hostelxpress_private.rider_otp_challenges WHERE order_id=%s',
                            (gate['order'],)).fetchone()['attempts']==0


def test_wrong_order_or_bay_does_not_consume_code(gate):
    code=issue(gate).json()['code']
    assert submit(gate,code,compartment=1).status_code==403
    assert submit(gate,code,order_id=uuid4()).status_code==404
    assert submit(gate,code).status_code==200


def test_repeated_issuance_denied(gate):
    assert issue(gate).status_code==200
    assert issue(gate).status_code==409


def test_stale_rover_cannot_receive_code(gate):
    with gate['db'].connection() as conn:
        conn.execute("UPDATE public.bots SET last_seen_at=now()-interval '1 minute' WHERE id=%s",
                     (gate['bot'],))
    assert issue(gate).status_code==409


def test_expired_code_cannot_queue_command(gate):
    code=issue(gate).json()['code']
    with gate['db'].connection() as conn:
        conn.execute("UPDATE hostelxpress_private.rider_otp_challenges SET "
                     "issued_at=now()-interval '10 minutes',expires_at=now()-interval '5 minutes' "
                     "WHERE order_id=%s",(gate['order'],))
    assert submit(gate,code).status_code==403
    with gate['db'].connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM hostelxpress_private.command_outbox WHERE order_id=%s',
                            (gate['order'],)).fetchone()['n']==0


def test_invalid_configuration_never_enables_rider_otp(database_url):
    base=dict(app_env='production',database_url=database_url,
              supabase_url='https://example.supabase.co',worker_enabled=False)
    for args in (
        {'gate_operator_token':OPERATOR_KEY},
        {'gate_operator_token':OPERATOR_KEY,'rider_otp_secret':'weak'},
        {'gate_operator_token':'weak','rider_otp_secret':OTP_SECRET},
        {'gate_operator_token':OPERATOR_KEY,'rider_otp_secret':OTP_SECRET,
         'staging_booking_user_id':uuid4()},
    ):
        with pytest.raises(ValueError):
            Settings(**base,**args)


def test_feature_routes_absent_in_default_demo_mode(client):
    assert client.post(f'/v1/operator/orders/{uuid4()}/rider-otp').status_code==404
    assert client.post(f'/v1/devices/{uuid4()}/rider-otp').status_code==404



def signed_observation(gate, message_type, **fields):
    """Simulate signed HTTPS rover traffic, not the physical rover."""
    path=f"/v1/devices/{gate['bot']}/messages"
    stamp=datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
    payload={
        'schema_version':1,'message_type':message_type,'message_id':str(uuid4()),
        'bot_id':str(gate['bot']),'sent_at':stamp,
        'order_id':str(gate['order']),'compartment':2,
        **fields,
    }
    if message_type=='event':
        payload['observed_at']=stamp
    raw=json.dumps(payload,separators=(',',':')).encode()
    timestamp=str(int(datetime.now(timezone.utc).timestamp()))
    signature=hmac.new(DEVICE_SECRET,
        f"{timestamp}.POST.{path}.".encode()+raw,hashlib.sha256).hexdigest()
    return gate['client'].post(path,content=raw,headers={
        'Content-Type':'application/json','X-Device-Timestamp':timestamp,
        'X-Device-Signature':signature,
    })


def test_gate_otp_signed_ack_and_sensor_load_state_machine(gate):
    """No OTP bypass: queued is not executed and no parcel may load before ACK."""
    code=issue(gate).json()['code']
    result=submit(gate,code)
    assert result.status_code==200,result.text
    command_id=result.json()['command_id']
    with gate['db'].connection() as conn:
        cmd=conn.execute('SELECT status,attempts FROM hostelxpress_private.command_outbox WHERE id=%s',
                         (command_id,)).fetchone()
        assert cmd['status']=='pending' and cmd['attempts']==0

    # An attacker or prematurely reporting bot cannot mark a parcel loaded
    # simply because OTP redemption enqueued a command.
    fake_loaded=signed_observation(
        gate,'event',event_type='parcel_loaded',
        outer_closed=True,inner_closed=True,is_empty=False)
    assert fake_loaded.status_code==409,fake_loaded.text
    with gate['db'].connection() as conn:
        assert conn.execute('SELECT status FROM public.orders WHERE id=%s',
                            (gate['order'],)).fetchone()['status']=='Pending'

    # Simulate the backend publisher marking the command as sent. This test
    # only exercises the signed transport/state-machine boundary, not GPIO.
    with gate['db'].connection() as conn:
        conn.execute("UPDATE hostelxpress_private.command_outbox "
                     "SET status='published',attempts=1 WHERE id=%s",(command_id,))

    ack=signed_observation(gate,'ack',command_id=str(command_id),result='executed')
    assert ack.status_code==200,ack.text
    with gate['db'].connection() as conn:
        assert conn.execute('SELECT status FROM hostelxpress_private.command_outbox WHERE id=%s',
                            (command_id,)).fetchone()['status']=='executed'
        # A signed execution ACK alone cannot manufacture an opened lid.
        assert conn.execute('SELECT status FROM public.orders WHERE id=%s',
                            (gate['order'],)).fetchone()['status']=='Pending'

    opened=signed_observation(gate,'event',event_type='outer_lid_opened',
                               command_id=str(command_id),outer_closed=False)
    assert opened.status_code==200,opened.text
    with gate['db'].connection() as conn:
        assert conn.execute('SELECT status FROM public.bots WHERE id=%s',
                            (gate['bot'],)).fetchone()['status']=='LOADING'
        assert conn.execute('SELECT status FROM public.orders WHERE id=%s',
                            (gate['order'],)).fetchone()['status']=='Pending'

    closed=signed_observation(gate,'event',event_type='outer_lid_closed',
                               outer_closed=True)
    assert closed.status_code==200,closed.text
    loaded=signed_observation(gate,'event',event_type='parcel_loaded',
                               outer_closed=True,inner_closed=True,is_empty=False)
    assert loaded.status_code==200,loaded.text

    with gate['db'].connection() as conn:
        order=conn.execute('SELECT status,loaded_at FROM public.orders WHERE id=%s',
                           (gate['order'],)).fetchone()
        assert order['status']=='Loaded' and order['loaded_at'] is not None
        assert conn.execute("SELECT count(*) AS n FROM hostelxpress_private.command_outbox "
                            "WHERE order_id=%s AND command='unlock_outer'",
                            (gate['order'],)).fetchone()['n']==1
        assert conn.execute("SELECT count(*) AS n FROM hostelxpress_private.command_outbox "
                            "WHERE order_id=%s AND command='unlock_inner'",
                            (gate['order'],)).fetchone()['n']==0
        assert conn.execute('SELECT count(*) AS n FROM public.transactions WHERE order_id=%s',
                            (gate['order'],)).fetchone()['n']==0
