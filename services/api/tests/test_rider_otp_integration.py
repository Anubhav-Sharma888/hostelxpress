"""OTP1 display-only and OTP2 student pickup authorization; disposable PostgreSQL.

No carrier API, money, real device or physical actuation is involved.
"""
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

OTP_SECRET="hostelxpress-test-only-pickup-secret-EXAMPLE-not-real"
GATE_KEY="hostelxpress-fixture-gate-operator-EXAMPLE-not-real"
DEVICE_SECRET=b"hostelxpress-fixture-device-secret-long-enough"


@pytest.fixture
def delivery(db,database_url):
    user,bot,order=uuid4(),uuid4(),uuid4()
    with db.connection() as conn:
        conn.execute("INSERT INTO auth.users(id,raw_user_meta_data) VALUES(%s,%s)",
                     (user,Jsonb({"name":"Pickup OTP owner"})))
        conn.execute("INSERT INTO public.bots(id,status,last_seen_at,is_demo) "
                     "VALUES(%s,'IDLE_AT_GATE',now(),false)",(bot,))
        conn.execute("INSERT INTO hostelxpress_private.device_state(bot_id,clock_synchronized) "
                     "VALUES(%s,true)",(bot,))
        conn.execute("INSERT INTO hostelxpress_private.device_credentials(bot_id,secret) "
                     "VALUES(%s,%s)",(bot,DEVICE_SECRET))
        for bay in range(1,4):
            conn.execute("INSERT INTO hostelxpress_private.compartment_state"
                         "(bot_id,compartment_id,outer_closed,inner_closed,is_empty,observed_at)"
                         "VALUES(%s,%s,true,true,true,now())",(bot,bay))
        conn.execute("INSERT INTO public.orders(id,user_id,bot_id,compartment_id,status,destination_hostel_block,is_demo)"
                     "VALUES(%s,%s,%s,2,'Pending','B',false)",(order,user,bot))
    settings=Settings(app_env="production",database_url=database_url,
                      supabase_url="https://example.supabase.co",
                      pickup_otp_secret=OTP_SECRET,gate_operator_token=GATE_KEY,
                      worker_enabled=False,trusted_hosts="testserver")
    with TestClient(create_app(settings)) as client:
        client.app.dependency_overrides[current_user]=lambda:Principal(user,False)
        yield {"client":client,"db":db,"user":user,"bot":bot,"order":order}


def signed_request(env,path,body,*,secret=DEVICE_SECRET):
    raw=json.dumps(body,separators=(",",":")).encode()
    timestamp=str(int(datetime.now(timezone.utc).timestamp()))
    signature=hmac.new(secret,f"{timestamp}.POST.{path}.".encode()+raw,
                       hashlib.sha256).hexdigest()
    return env["client"].post(path,content=raw,headers={
        "Content-Type":"application/json","X-Device-Timestamp":timestamp,
        "X-Device-Signature":signature})


def pickup_request(env,code,*,bot_id=None,bay=2):
    actual_bot=bot_id or env["bot"]
    path=f"/v1/devices/{actual_bot}/pickup-otp"
    return signed_request(env,path,{"order_id":str(env["order"]),"compartment":bay,"code":code})


def paid_delivery(env):
    with env["db"].connection() as conn:
        conn.execute("UPDATE public.orders SET status='Paid',arrived_at=now(),paid_at=now() "
                     "WHERE id=%s",(env["order"],))
        conn.execute("UPDATE public.bots SET status='AT_HOSTEL' WHERE id=%s",(env["bot"],))
        conn.execute("UPDATE hostelxpress_private.compartment_state SET is_empty=false "
                     "WHERE bot_id=%s AND compartment_id=2",(env["bot"],))
        conn.execute("INSERT INTO public.transactions(order_id,razorpay_qr_id,"
                     "razorpay_payment_id,status,captured_at,is_demo) "
                     "VALUES(%s,%s,%s,'Captured',now(),false)",
                     (env["order"],"qr_fixture_"+str(uuid4()),"pay_fixture_"+str(uuid4())))


def test_old_outer_rider_otp_routes_are_removed(delivery):
    env=delivery
    assert env["client"].post(f"/v1/operator/orders/{env['order']}/rider-otp").status_code==404
    assert env["client"].post(f"/v1/devices/{env['bot']}/rider-otp").status_code==404


def test_courier_otp1_relay_is_student_owned_display_once_and_no_unlock(delivery):
    env=delivery
    path=f"/v1/orders/{env['order']}/courier-code"
    unauthorized=env["client"].post(path,json={"code":"719205"})
    # The authenticated owner may send an external courier OTP only for display.
    assert unauthorized.status_code==200,unauthorized.text
    assert unauthorized.json()["otp_type"]=="courier_display_otp1"
    with env["db"].connection() as conn:
        row=conn.execute("SELECT * FROM hostelxpress_private.courier_code_messages "
                         "WHERE order_id=%s",(env["order"],)).fetchone()
        assert "719205" not in str(row)  # ciphertext only
        assert conn.execute("SELECT count(*) AS n FROM hostelxpress_private.command_outbox").fetchone()["n"]==0
    payload={"order_id":str(env["order"]),"compartment":2}
    display_path=f"/v1/devices/{env['bot']}/courier-code/display"
    shown=signed_request(env,display_path,payload)
    assert shown.status_code==200,shown.text
    assert shown.json()["code"]=="719205"
    assert shown.json()["status"]=="display_once_only"
    assert signed_request(env,display_path,payload).status_code==404
    with env["db"].connection() as conn:
        row=conn.execute("SELECT code_ciphertext,read_at FROM hostelxpress_private.courier_code_messages "
                         "WHERE order_id=%s",(env["order"],)).fetchone()
        assert row["code_ciphertext"] is None and row["read_at"] is not None
        assert conn.execute("SELECT count(*) AS n FROM hostelxpress_private.command_outbox").fetchone()["n"]==0


def test_gate_staff_outer_loading_separate_from_both_otps(delivery):
    env=delivery
    path=f"/v1/operator/orders/{env['order']}/loading-open"
    assert env["client"].post(path).status_code==401
    approved=env["client"].post(path,headers={"X-Gate-Operator-Key":GATE_KEY})
    assert approved.status_code==200,approved.text
    assert approved.json()["status"]=="queued_not_executed"
    with env["db"].connection() as conn:
        row=conn.execute("SELECT command,status FROM hostelxpress_private.command_outbox "
                         "WHERE order_id=%s",(env["order"],)).fetchone()
        assert row["command"]=="unlock_outer" and row["status"]=="pending"
        assert conn.execute("SELECT count(*) AS n FROM hostelxpress_private.pickup_otp_challenges"
                            ).fetchone()["n"]==0


def test_pickup_otp2_cannot_issue_before_verified_payment(delivery):
    env=delivery
    path=f"/v1/orders/{env['order']}/pickup-otp"
    assert env["client"].post(path).status_code==409
    assert env["client"].get(path).status_code==409
    with env["db"].connection() as conn:
        assert conn.execute("SELECT count(*) AS n FROM hostelxpress_private.pickup_otp_challenges").fetchone()["n"]==0


def test_paid_owner_gets_recoverable_otp2_and_rover_queues_only_inner(delivery):
    env=delivery
    paid_delivery(env)
    path=f"/v1/orders/{env['order']}/pickup-otp"
    assert env["client"].get(path).status_code==404
    issued=env["client"].post(path)
    assert issued.status_code==200,issued.text
    code=issued.json()["code"]
    assert len(code)==6 and code.isascii() and code.isdigit()
    assert issued.json()["otp_type"]=="student_pickup_otp2"
    assert env["client"].get(path).json()["code"]==code
    assert env["client"].post(path).json()["code"]==code
    with env["db"].connection() as conn:
        assert conn.execute("SELECT count(*) AS n FROM hostelxpress_private.command_outbox").fetchone()["n"]==0
        row=conn.execute("SELECT * FROM hostelxpress_private.pickup_otp_challenges WHERE order_id=%s",
                         (env["order"],)).fetchone()
        assert code not in str(row)
    correct=pickup_request(env,code)
    assert correct.status_code==200,correct.text
    assert correct.json()["status"]=="queued_not_executed"
    assert pickup_request(env,code).status_code==403
    with env["db"].connection() as conn:
        cmd=conn.execute("SELECT command,status,compartment FROM hostelxpress_private.command_outbox "
                         "WHERE order_id=%s",(env["order"],)).fetchone()
        assert cmd["command"]=="unlock_inner" and cmd["status"]=="pending" and cmd["compartment"]==2
        row=conn.execute("SELECT consumed_at,code_ciphertext FROM hostelxpress_private.pickup_otp_challenges "
                         "WHERE order_id=%s",(env["order"],)).fetchone()
        assert row["consumed_at"] is not None and row["code_ciphertext"] is None
        assert conn.execute("SELECT status FROM public.orders WHERE id=%s",
                            (env["order"],)).fetchone()["status"]=="Paid"


def test_pickup_wrong_attempts_lock_code_and_wrong_compartment_cannot_unlock(delivery):
    env=delivery
    paid_delivery(env)
    issued=env["client"].post(f"/v1/orders/{env['order']}/pickup-otp").json()
    code=issued["code"]
    assert pickup_request(env,code,bay=1).status_code==403
    wrong="999999" if code!="999999" else "888888"
    for n in range(1,4):
        assert pickup_request(env,wrong).status_code==403
        with env["db"].connection() as conn:
            assert conn.execute("SELECT attempts FROM hostelxpress_private.pickup_otp_challenges "
                                "WHERE order_id=%s",(env["order"],)).fetchone()["attempts"]==n
    assert pickup_request(env,code).status_code==403
    with env["db"].connection() as conn:
        assert conn.execute("SELECT count(*) AS n FROM hostelxpress_private.command_outbox").fetchone()["n"]==0


def test_wrong_student_cannot_receive_or_send_codes(delivery):
    env=delivery
    env["client"].app.dependency_overrides[current_user]=lambda:Principal(uuid4(),False)
    assert env["client"].post(f"/v1/orders/{env['order']}/courier-code",json={"code":"1234"}).status_code==404
    paid_delivery(env)
    assert env["client"].post(f"/v1/orders/{env['order']}/pickup-otp").status_code==404


def test_pickup_otp2_cannot_unlock_when_payment_is_refunded_or_rover_offline(delivery):
    env=delivery
    paid_delivery(env)
    code=env["client"].post(f"/v1/orders/{env['order']}/pickup-otp").json()["code"]
    with env["db"].connection() as conn:
        conn.execute("UPDATE public.transactions SET status='Refunded' WHERE order_id=%s",(env["order"],))
    assert pickup_request(env,code).status_code==409
    with env["db"].connection() as conn:
        conn.execute("UPDATE public.transactions SET status='Captured' WHERE order_id=%s",(env["order"],))
        conn.execute("UPDATE public.bots SET last_seen_at=now()-interval '2 minutes' WHERE id=%s",(env["bot"],))
    assert pickup_request(env,code).status_code==409
    with env["db"].connection() as conn:
        assert conn.execute("SELECT count(*) AS n FROM hostelxpress_private.command_outbox").fetchone()["n"]==0
