"""Independent authorization/replay tests against a disposable Linux database.

Cloud provider responses in webhook tests are controlled fixtures, not real
Razorpay calls. Public HTTP routes are exercised wherever possible.
"""
from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
from uuid import uuid4

from fastapi.testclient import TestClient
import jwt

from app import service
from app.config import Settings
from app.main import create_app

WEBHOOK_SECRET = "security-qa-webhook-secret-never-a-real-credential"
DEVICE_SECRET = b"security-qa-device-secret-never-a-real-credential"


@contextmanager
def production_client(client):
    settings = Settings(app_env="production", database_url=client.app.state.settings.database_url,
                        supabase_url="https://security-qa.supabase.invalid", worker_enabled=False,
                        razorpay_webhook_secret=WEBHOOK_SECRET,
                        trusted_hosts="testserver,localhost,127.0.0.1")
    with TestClient(create_app(settings)) as live:
        yield live


def book_request(client, headers, key=None, **fields):
    return client.post("/v1/orders", headers={**headers, "Idempotency-Key": key or str(uuid4())},
                       json={"destination_hostel_block": "A", "parcel_label": "Dinner", **fields})


def advance(client, headers, order_id, action):
    response = client.post(f"/v1/demo/orders/{order_id}/advance", headers=headers, json={"action": action})
    assert response.status_code == 200, response.text
    return response.json()


def arrived_payment(client, booking, db):
    headers, order = booking()
    for action in ("load", "dispatch", "arrive"):
        advance(client, headers, order["id"], action)
    payment = client.post(f"/v1/orders/{order['id']}/payment", headers=headers)
    assert payment.status_code == 200, payment.text
    with db.connection() as conn:
        conn.execute("UPDATE public.orders SET is_demo=false WHERE id=%s", (order["id"],))
        conn.execute("UPDATE public.bots SET is_demo=false WHERE id=%s", (order["bot_id"],))
        conn.execute("UPDATE public.transactions SET is_demo=false WHERE order_id=%s", (order["id"],))
    return order, payment.json()


class ProviderFixture:
    def __init__(self, qr_id, *, amount=1000, currency="INR", captured=True):
        self.qr_id, self.amount, self.currency, self.captured = qr_id, amount, currency, captured
        self.calls = 0

    def payment_and_qrs(self, payment_id):
        self.calls += 1
        return {"id": payment_id, "status": "captured", "captured": self.captured,
                "amount": self.amount, "currency": self.currency}, [{"id": self.qr_id}]


def webhook(live, event_id, *, payment_id="pay_independent_security", event_type="payment.captured", signature=None):
    raw = json.dumps({"event": event_type, "payload": {"payment": {"entity": {"id": payment_id}}}},
                     separators=(",", ":")).encode()
    signature = signature if signature is not None else hmac.new(WEBHOOK_SECRET.encode(), raw, hashlib.sha256).hexdigest()
    return live.post("/webhooks/razorpay", content=raw,
                     headers={"Content-Type": "application/json", "X-Razorpay-Signature": signature,
                              "X-Razorpay-Event-Id": event_id})


def live_device(db, order):
    with db.connection() as conn:
        conn.execute("UPDATE public.bots SET is_demo=false WHERE id=%s", (order["bot_id"],))
        conn.execute("UPDATE public.orders SET is_demo=false WHERE id=%s", (order["id"],))
        conn.execute("INSERT INTO hostelxpress_private.device_credentials(bot_id,secret) VALUES(%s,%s)",
                     (order["bot_id"], DEVICE_SECRET))


def device_payload(bot_id, **updates):
    stamp = service.now().isoformat().replace("+00:00", "Z")
    payload = {"schema_version": 1, "message_type": "telemetry", "message_id": str(uuid4()),
               "bot_id": bot_id, "sent_at": stamp, "observed_at": stamp,
               "boot_id": str(uuid4()), "sequence": 0, "current_lat": None, "current_lng": None,
               "battery_level": 80, "clock_synchronized": True, "compartments": []}
    payload.update(updates)
    return payload


def signed_device(live, bot_id, payload, *, signature=None):
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    stamp = str(int(service.now().timestamp()))
    path = f"/v1/devices/{bot_id}/messages"
    expected = hmac.new(DEVICE_SECRET, f"{stamp}.POST.{path}.".encode() + raw, hashlib.sha256).hexdigest()
    return live.post(path, content=raw, headers={"Content-Type": "application/json",
                    "X-Device-Timestamp": stamp, "X-Device-Signature": signature or expected})


def test_missing_malformed_and_forged_student_sessions_fail(client):
    for headers in ({}, {"Authorization": "Basic abc"}, {"Authorization": "Bearer not-a-token"}):
        assert client.get("/v1/me", headers=headers).status_code == 401
    now = datetime.now(timezone.utc)
    token = jwt.encode({"sub": str(uuid4()), "iss": "hostelxpress-local-demo", "aud": "hostelxpress-demo",
                        "iat": now, "exp": now + timedelta(hours=1), "mode": "demo"},
                       "an-attacker-does-not-know-the-server-key", algorithm="HS256")
    assert client.get("/v1/orders", headers={"Authorization": "Bearer " + token}).status_code == 401


def test_expired_and_wrong_audience_sessions_fail(client, login):
    _, user = login()
    now = datetime.now(timezone.utc)
    claims = {"sub": user["id"], "iss": "hostelxpress-local-demo", "aud": "hostelxpress-demo",
              "iat": now - timedelta(hours=2), "exp": now - timedelta(hours=1), "mode": "demo"}
    for overrides in ({}, {"exp": now + timedelta(hours=1), "aud": "a-different-application"}):
        token = jwt.encode({**claims, **overrides}, client.app.state.settings.demo_jwt_secret, algorithm="HS256")
        assert client.get("/v1/me", headers={"Authorization": "Bearer " + token}).status_code == 401


def test_cross_owner_routes_and_live_bot_visibility_are_denied(client, login, booking):
    owner, order = booking()
    other, _ = login("Bob", "B")
    order_id = order["id"]
    assert client.get("/v1/orders", headers=other).json()["items"] == []
    for path in (f"/v1/orders/{order_id}", f"/v1/orders/{order_id}/events", f"/v1/bots/{order['bot_id']}"):
        assert client.get(path, headers=other).status_code == 404
    assert client.post(f"/v1/orders/{order_id}/payment", headers=other).status_code == 404
    assert client.post(f"/v1/demo/orders/{order_id}/advance", headers=other, json={"action": "load"}).status_code == 404
    assert client.get(f"/v1/orders/{order_id}", headers=owner).json()["status"] == "Pending"


def test_idempotency_keys_do_not_cross_user_boundaries(client, login):
    alice, _ = login("Alice", "A")
    bob, _ = login("Bob", "B")
    key = str(uuid4())
    first, second = book_request(client, alice, key), book_request(client, bob, key)
    assert first.status_code == second.status_code == 201
    assert first.json()["id"] != second.json()["id"]
    assert client.get("/v1/orders", headers=bob).json()["items"][0]["id"] == second.json()["id"]


def test_profile_cannot_change_identity_or_existing_destination(client, login, booking):
    headers, order = booking()
    assert client.patch("/v1/me", headers=headers, json={"id": str(uuid4()), "role": "admin"}).status_code == 422
    assert client.patch("/v1/me", headers=headers, json={"auth_token": "must-not-be-stored"}).status_code == 422
    updated = client.patch("/v1/me", headers=headers, json={"hostel_block": "B"})
    assert updated.status_code == 200
    assert client.get(f"/v1/orders/{order['id']}", headers=headers).json()["destination_hostel_block"] == "A"


def test_client_financial_and_assignment_fields_are_not_accepted(client, login):
    headers, _ = login()
    for fields in ({"amount": 1}, {"currency": "USD"}, {"user_id": str(uuid4())},
                   {"bot_id": str(uuid4())}, {"status": "Paid"}, {"compartment_id": 1}):
        assert book_request(client, headers, **fields).status_code == 422
    assert client.post("/v1/orders", headers=headers,
                       json={"destination_hostel_block": "A", "parcel_label": "Dinner"}).status_code == 422


def test_demo_network_peer_cannot_be_spoofed_by_forwarded_headers(client):
    with TestClient(create_app(client.app.state.settings), client=("198.51.100.10", 12345)) as remote:
        response = remote.post("/auth/demo", headers={"X-Forwarded-For": "127.0.0.1", "Forwarded": "for=127.0.0.1"},
                               json={"name": "Remote", "hostel_block": "A"})
        assert response.status_code == 403


def test_demo_login_and_real_payment_webhooks_are_mode_isolated(client):
    assert client.post("/webhooks/razorpay", content=b"{}").status_code == 404
    with production_client(client) as live:
        assert live.post("/auth/demo", json={"name": "No bypass", "hostel_block": "A"}).status_code == 404


def test_webhook_signature_checked_before_provider_calls(client, booking, db):
    _, payment = arrived_payment(client, booking, db)
    with production_client(client) as live:
        provider = ProviderFixture(payment["qr_id"])
        live.app.state.provider = provider
        assert webhook(live, "evt_bad_signature", signature="0" * 64).status_code == 401
        assert provider.calls == 0


def test_wrong_currency_and_wrong_qr_cannot_capture_or_unlock(client, booking, db):
    order, payment = arrived_payment(client, booking, db)
    with production_client(client) as live:
        for index, provider in enumerate((ProviderFixture(payment["qr_id"], currency="USD"),
                                          ProviderFixture("qr_not_this_order"),
                                          ProviderFixture(payment["qr_id"], amount=1),
                                          ProviderFixture(payment["qr_id"], captured=False))):
            live.app.state.provider = provider
            assert webhook(live, f"evt_invalid_capture_{index}").status_code == 400
    with db.connection() as conn:
        assert conn.execute("SELECT status FROM public.orders WHERE id=%s", (order["id"],)).fetchone()["status"] == "Arrived"
        assert conn.execute("SELECT count(*) AS n FROM hostelxpress_private.command_outbox WHERE order_id=%s", (order["id"],)).fetchone()["n"] == 0


def test_replayed_capture_and_new_event_id_have_one_unlock_effect(client, booking, db):
    order, payment = arrived_payment(client, booking, db)
    with production_client(client) as live:
        live.app.state.provider = ProviderFixture(payment["qr_id"])
        assert webhook(live, "evt_capture_once").status_code == 200
        repeat = webhook(live, "evt_capture_once")
        assert repeat.status_code == 200 and repeat.json()["duplicate"] is True
        assert webhook(live, "evt_same_payment_new_event_id").status_code == 200
        assert webhook(live, "evt_old_failure", event_type="payment.failed").status_code == 200
    with db.connection() as conn:
        assert conn.execute("SELECT status FROM public.orders WHERE id=%s", (order["id"],)).fetchone()["status"] == "Paid"
        assert conn.execute("SELECT count(*) AS n FROM hostelxpress_private.command_outbox WHERE order_id=%s AND command='unlock_inner'", (order["id"],)).fetchone()["n"] == 1


def test_rider_timeout_does_not_release_from_stale_sensor_state(client, booking, db):
    _, order = booking()
    with db.connection() as conn:
        conn.execute("UPDATE public.orders SET created_at=now()-interval '6 minutes',rider_due_at=now()-interval '1 minute' WHERE id=%s", (order["id"],))
        conn.execute("UPDATE hostelxpress_private.compartment_state SET observed_at=now()-interval '2 minutes' WHERE bot_id=%s", (order["bot_id"],))
    service.tick(db)
    with db.connection() as conn:
        row = conn.execute("SELECT status,compartment_released_at FROM public.orders WHERE id=%s", (order["id"],)).fetchone()
        assert row["status"] == "Failed"
        assert row["compartment_released_at"] is None


def test_device_identity_and_message_body_are_bound_to_authentication(client, booking, db):
    _, order = booking()
    live_device(db, order)
    with production_client(client) as live:
        payload = device_payload(order["bot_id"])
        assert signed_device(live, order["bot_id"], payload, signature="0"*64).status_code == 401
        assert signed_device(live, order["bot_id"], {**payload, "bot_id": str(uuid4())}).status_code == 403
        assert signed_device(live, order["bot_id"], payload).status_code == 200
        assert signed_device(live, order["bot_id"], {**payload, "battery_level": 79}).status_code == 409


def test_known_device_receipt_can_be_retried_after_payload_freshness_window(client, booking, db, monkeypatch):
    _, order = booking()
    live_device(db, order)
    with production_client(client) as live:
        payload = device_payload(order["bot_id"])
        first = signed_device(live, order["bot_id"], payload)
        assert first.status_code == 200, first.text
        later = service.now() + timedelta(seconds=45)
        monkeypatch.setattr(service, "now", lambda: later)
        retry = signed_device(live, order["bot_id"], payload)
        assert retry.status_code == 200, retry.text
        assert retry.json()["stored"] is True and retry.json()["duplicate"] is True


def test_partial_lid_event_does_not_refresh_unobserved_sensors(client, booking, db):
    _, order = booking()
    live_device(db, order)
    with db.connection() as conn:
        conn.execute("UPDATE hostelxpress_private.compartment_state SET observed_at=now()-interval '2 minutes' WHERE bot_id=%s", (order["bot_id"],))
    stamp = service.now().isoformat().replace("+00:00", "Z")
    payload = {"schema_version": 1, "message_type": "event", "message_id": str(uuid4()),
               "bot_id": order["bot_id"], "sent_at": stamp, "observed_at": stamp,
               "event_type": "outer_lid_closed", "order_id": order["id"],
               "compartment": order["compartment_id"], "outer_closed": True}
    with production_client(client) as live:
        result = signed_device(live, order["bot_id"], payload)
        assert result.status_code == 200, result.text
    with db.connection() as conn:
        state = conn.execute("SELECT observed_at FROM hostelxpress_private.compartment_state WHERE bot_id=%s AND compartment_id=%s", (order["bot_id"], order["compartment_id"])).fetchone()
        assert state["observed_at"] is None or (service.now()-state["observed_at"]).total_seconds() > 15


def test_new_stale_critical_event_is_stored_for_reconciliation_without_state_effect(client, booking, db):
    _, order = booking()
    live_device(db, order)
    old = (service.now()-timedelta(minutes=2)).isoformat().replace("+00:00", "Z")
    payload = {"schema_version": 1, "message_type": "event", "message_id": str(uuid4()),
               "bot_id": order["bot_id"], "sent_at": old, "observed_at": old,
               "event_type": "arrived", "order_id": order["id"], "compartment": order["compartment_id"]}
    with production_client(client) as live:
        response = signed_device(live, order["bot_id"], payload)
        assert response.status_code == 200, response.text
        assert response.json()["stored"] is True and response.json()["reconciliation_required"] is True
        repeat = signed_device(live, order["bot_id"], payload)
        assert repeat.status_code == 200 and repeat.json()["duplicate"] is True
        assert repeat.json()["reconciliation_required"] is True
    with db.connection() as conn:
        assert conn.execute("SELECT status FROM public.orders WHERE id=%s", (order["id"],)).fetchone()["status"] == "Pending"
        row = conn.execute("SELECT outcome,payload FROM hostelxpress_private.device_events WHERE bot_id=%s AND message_id=%s", (order["bot_id"], payload["message_id"])).fetchone()
        assert row["outcome"] == "reconciliation_required" and row["payload"]["event_type"] == "arrived"


def test_late_executed_ack_for_expired_command_is_evidence_not_new_execution(client, booking, db):
    order, payment = arrived_payment(client, booking, db)
    with production_client(client) as live:
        live.app.state.provider = ProviderFixture(payment["qr_id"])
        assert webhook(live, "evt_late_execution_fixture").status_code == 200
        with db.connection() as conn:
            conn.execute("INSERT INTO hostelxpress_private.device_credentials(bot_id,secret) VALUES(%s,%s)", (order["bot_id"], DEVICE_SECRET))
            command = conn.execute("UPDATE hostelxpress_private.command_outbox SET issued_at=now()-interval '20 seconds',expires_at=now()-interval '10 seconds',status='expired',attempts=1 WHERE order_id=%s RETURNING id", (order["id"],)).fetchone()
        stamp = service.now().isoformat().replace("+00:00", "Z")
        payload = {"schema_version": 1, "message_type": "ack", "message_id": str(uuid4()),
                   "bot_id": order["bot_id"], "sent_at": stamp, "command_id": str(command["id"]),
                   "order_id": order["id"], "compartment": order["compartment_id"], "result": "executed"}
        response = signed_device(live, order["bot_id"], payload)
        assert response.status_code == 200, response.text
        assert response.json()["stored"] is True and response.json()["reconciliation_required"] is True
    with db.connection() as conn:
        assert conn.execute("SELECT status FROM hostelxpress_private.command_outbox WHERE id=%s", (command["id"],)).fetchone()["status"] == "expired"
        assert conn.execute("SELECT status FROM public.bots WHERE id=%s", (order["bot_id"],)).fetchone()["status"] == "AT_HOSTEL"
        assert conn.execute("SELECT status FROM public.orders WHERE id=%s", (order["id"],)).fetchone()["status"] == "Paid"


def test_new_boot_without_explicit_clock_health_cannot_inherit_safe_clock(client, booking, db):
    _, order = booking()
    live_device(db, order)
    with production_client(client) as live:
        known = device_payload(order["bot_id"])
        assert signed_device(live, order["bot_id"], known).status_code == 200
        unknown = device_payload(order["bot_id"])
        del unknown["clock_synchronized"]
        assert signed_device(live, order["bot_id"], unknown).status_code == 200
    with db.connection() as conn:
        state = conn.execute("SELECT clock_synchronized FROM hostelxpress_private.device_state WHERE bot_id=%s", (order["bot_id"],)).fetchone()
        assert state["clock_synchronized"] is False


def test_delayed_full_snapshot_cannot_become_fresh_unlock_interlocks(client, booking, db):
    _, order = booking()
    live_device(db, order)
    with db.connection() as conn:
        conn.execute("UPDATE hostelxpress_private.compartment_state SET observed_at=now()-interval '1 minute' WHERE bot_id=%s", (order["bot_id"],))
    old = (service.now()-timedelta(seconds=20)).isoformat().replace("+00:00", "Z")
    payload = device_payload(order["bot_id"], observed_at=old,
        compartments=[{"compartment": i, "outer_closed": True, "inner_closed": True, "is_empty": True} for i in (1,2,3)])
    with production_client(client) as live:
        result = signed_device(live, order["bot_id"], payload)
        assert result.status_code in {200,409}, result.text
    with db.connection() as conn:
        bot = conn.execute("SELECT * FROM public.bots WHERE id=%s", (order["bot_id"],)).fetchone()
        assert service.safe_bot(conn, bot) is False
