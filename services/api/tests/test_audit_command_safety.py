"""Offline regressions for publication authorization and QR completion races."""
from pathlib import Path
from types import SimpleNamespace
import threading

import pytest

from app import payments, service, pickup_otp_store
from app.config import Settings
from app.main import create_app
from app.mqtt import MQTTBridge
from fastapi.testclient import TestClient
from test_rider_otp_integration import delivery, paid_delivery, OTP_SECRET


def bridge_for(db):
    calls=[]
    bridge=object.__new__(MQTTBridge)
    bridge.db=db
    bridge.connected=threading.Event()
    bridge.connected.set()
    def publish(*args,**kwargs):
        calls.append((args,kwargs))
        return SimpleNamespace(rc=0,wait_for_publish=lambda **kwargs:None,is_published=lambda:True)
    bridge.publisher=SimpleNamespace(publish=publish)
    return bridge,calls


def test_staff_outer_command_is_published(delivery):
    env=delivery
    with env["db"].connection() as conn:
        pickup_otp_store.authorize_outer_loading(conn,env["order"])
    bridge,calls=bridge_for(env["db"])
    bridge.publish_pending()
    assert len(calls)==1
    bridge.publish_pending()
    assert len(calls)==1
    with env["db"].connection() as conn:
        assert conn.execute("SELECT status FROM hostelxpress_private.command_outbox WHERE order_id=%s",
                            (env["order"],)).fetchone()["status"]=="published"



@pytest.mark.parametrize("change",["expired_command","expired_rider","order_changed","bot_changed","nonempty","stale","open_lid","released"])
def test_outer_publication_rechecks_loading_safety(delivery,change):
    env=delivery
    with env["db"].connection() as conn:
        pickup_otp_store.authorize_outer_loading(conn,env["order"])
        if change=="expired_command":
            conn.execute("UPDATE hostelxpress_private.command_outbox SET issued_at=now()-interval '20 seconds', "
                         "expires_at=now()-interval '10 seconds' WHERE order_id=%s",(env["order"],))
        elif change=="expired_rider":
            conn.execute("UPDATE public.orders SET created_at=now()-interval '6 minutes', rider_due_at=now()-interval '1 minute' WHERE id=%s",(env["order"],))
        elif change=="order_changed":
            conn.execute("UPDATE public.orders SET status='Loaded',loaded_at=now() WHERE id=%s",(env["order"],))
        elif change=="bot_changed":
            conn.execute("UPDATE public.bots SET status='AT_HOSTEL' WHERE id=%s",(env["bot"],))
        elif change=="released":
            conn.execute("UPDATE public.orders SET status='Failed',failed_at=now(),compartment_released_at=now() WHERE id=%s",(env["order"],))
        elif change=="nonempty":
            conn.execute("UPDATE hostelxpress_private.compartment_state SET is_empty=false WHERE bot_id=%s AND compartment_id=2",(env["bot"],))
        elif change=="open_lid":
            conn.execute("UPDATE hostelxpress_private.compartment_state SET inner_closed=false WHERE bot_id=%s AND compartment_id=2",(env["bot"],))
        else:
            conn.execute("UPDATE public.bots SET last_seen_at=now()-interval '30 seconds' WHERE id=%s",(env["bot"],))
    bridge,calls=bridge_for(env["db"])
    bridge.publish_pending()
    assert calls==[]


@pytest.mark.parametrize("challenge",["missing","unconsumed","consumed_after_command","wrong_bay"])
def test_legacy_inner_command_without_prior_redemption_is_rejected(delivery,challenge):
    env=delivery
    paid_delivery(env)
    with env["db"].connection() as conn:
        if challenge!="missing":
            pickup_otp_store.issue_pickup_code(conn,env["order"],env["user"],OTP_SECRET.encode())
        conn.execute("INSERT INTO hostelxpress_private.command_outbox(order_id,bot_id,compartment,command,is_demo) "
                     "VALUES(%s,%s,2,'unlock_inner',false)",(env["order"],env["bot"]))
        if challenge in {"consumed_after_command","wrong_bay"}:
            conn.execute("UPDATE hostelxpress_private.pickup_otp_challenges SET consumed_at=clock_timestamp(), "
                         "code_ciphertext=NULL WHERE order_id=%s",(env["order"],))
            if challenge=="wrong_bay":
                conn.execute("UPDATE hostelxpress_private.pickup_otp_challenges SET compartment=1, "
                             "consumed_at=issued_at WHERE order_id=%s",(env["order"],))
                conn.execute("UPDATE hostelxpress_private.command_outbox SET issued_at=clock_timestamp(), "
                             "expires_at=clock_timestamp()+interval '9 seconds' WHERE order_id=%s",(env["order"],))
    bridge,calls=bridge_for(env["db"])
    bridge.publish_pending()
    assert calls==[]
    with env["db"].connection() as conn:
        assert conn.execute("SELECT status FROM hostelxpress_private.command_outbox WHERE order_id=%s",
                            (env["order"],)).fetchone()["status"]=="rejected"


def test_redeemed_inner_command_publishes(delivery):
    env=delivery
    paid_delivery(env)
    with env["db"].connection() as conn:
        issued=pickup_otp_store.issue_pickup_code(conn,env["order"],env["user"],OTP_SECRET.encode())
    with env["db"].connection() as conn:
        assert pickup_otp_store.redeem_pickup_code(
            conn,env["order"],env["bot"],2,issued["code"],OTP_SECRET.encode())["accepted"]
    bridge,calls=bridge_for(env["db"])
    bridge.publish_pending()
    assert len(calls)==1
    bridge.publish_pending()
    assert len(calls)==1


@pytest.mark.parametrize("end_status",["Failed","Paid"])
def test_provider_creation_race_retains_metadata_without_payable_qr(delivery,end_status):
    env=delivery
    with env["db"].connection() as conn:
        conn.execute("UPDATE public.orders SET status='Arrived',arrived_at=now() WHERE id=%s",(env["order"],))
    def create_qr(order_id,request_id,expires_at):
        with env["db"].connection() as conn:
            conn.execute("UPDATE public.orders SET status=%s WHERE id=%s",(end_status,order_id))
        return {"id":"qr_audit_race","image_url":"https://example.invalid/qr.png","status":"active",
                "payment_amount":1000,"fixed_amount":True,"usage":"single_use","type":"upi_qr",
                "close_by":int(expires_at.timestamp())}
    view=payments.create_payment(env["db"],SimpleNamespace(create_qr=create_qr),
                                 env["order"],env["user"],False)
    assert view["status"]=="reconciling"
    assert view["qr_image_url"] is None
    with env["db"].connection() as conn:
        row=conn.execute("SELECT razorpay_qr_id,provider_state FROM public.transactions WHERE order_id=%s",
                         (env["order"],)).fetchone()
        assert row["razorpay_qr_id"]=="qr_audit_race" and row["provider_state"]=="ready"


def test_live_readiness_requires_safe_upgrade_before_bridge_start(database_url,monkeypatch):
    from app import mqtt
    started=[]
    monkeypatch.setattr(mqtt.MQTTBridge,"start",lambda self:started.append(True))
    settings=Settings(app_env="production",database_url=database_url,
        supabase_url="https://example.invalid",worker_enabled=False,mqtt_host="example.invalid",
        trusted_hosts="testserver",mqtt_username="fixture-pub",mqtt_password="fixture-pub-password",
        mqtt_ingest_username="fixture-ingest",mqtt_ingest_password="fixture-ingest-password")
    # Missing migration marker must be detected even when OTP endpoints are disabled.
    import psycopg
    with psycopg.connect(database_url,autocommit=True) as conn:
        conn.execute("DELETE FROM hostelxpress_private.schema_migrations WHERE version='0005_command_authorization'")
    try:
        with pytest.raises(RuntimeError,match="migration|migrations|upgrade"):
            with TestClient(create_app(settings)):
                pass
        assert started==[]
    finally:
        with psycopg.connect(database_url,autocommit=True) as conn:
            conn.execute("INSERT INTO hostelxpress_private.schema_migrations(version) VALUES ('0005_command_authorization') ON CONFLICT DO NOTHING")


def test_upgrade_quarantines_pending_inner_and_preserves_receipts(delivery):
    env=delivery
    migration=Path(__file__).resolve().parents[3]/"supabase/migrations/0005_command_authorization.sql"
    with env["db"].connection() as conn:
        for status in ("pending","published","executed"):
            # Different orders avoid the per-order command uniqueness constraint.
            order=conn.execute("INSERT INTO public.orders(user_id,status,destination_hostel_block,is_demo) "
                "VALUES(%s,'Pending','B',false) RETURNING id",(env["user"],)).fetchone()["id"]
            conn.execute("INSERT INTO hostelxpress_private.command_outbox(order_id,bot_id,compartment,command,is_demo,status,attempts) "
                "VALUES(%s,%s,2,'unlock_inner',false,%s,1)",(order,env["bot"],status))
        conn.execute("DELETE FROM hostelxpress_private.schema_migrations WHERE version='0005_command_authorization'")
        conn.execute(migration.read_text().replace("begin;","").replace("commit;",""))
        rows=conn.execute("SELECT status,attempts FROM hostelxpress_private.command_outbox ORDER BY status").fetchall()
        assert {r["status"] for r in rows}=={"executed","published","rejected"}
        assert all(r["attempts"]==1 for r in rows)
