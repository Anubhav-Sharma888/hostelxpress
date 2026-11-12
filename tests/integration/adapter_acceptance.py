#!/usr/bin/env python3
"""Adapter acceptance harness: the real connector against a disposable backend.

Runs the production FastAPI service (worker + MQTT bridge enabled) and the real
`hostelxpress_link` connector against a private loopback TLS Mosquitto and a
disposable PostgreSQL 17 database, covering the fault cases neither the backend
unit suite nor the connector unit suite can show end to end:

- uncertain asynchronous unlock: the intent is durable before actuation, a
  crash without confirmation is never replayed after restart, the restarted
  connector re-acks the recorded decision without re-actuating, and the
  designed refusal blocks a silent late confirmation while the backend marks
  the command rejected for operator reconciliation;
- expired-TTL and retained commands are refused without actuation;
- duplicate durable-event delivery keeps exactly one stored row and returns a
  duplicate receipt;
- a stale (out-of-order) observation is durably stored as
  reconciliation_required and surfaced on the connector's reconciliation list;
- captured payment without arrival/telemetry produces no unlock command;
- a clean synchronous execution plus correlated inner-lid closure with an
  empty reading completes the order.

Everything is local and synthetic: no cloud broker, no payment gateway, no
physical hardware. Opt in with HOSTELXPRESS_ADAPTER_ACCEPTANCE=1.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import shlex
import shutil
import socket
import ssl
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
PG = Path("/usr/lib/postgresql/17/bin")
BASE = "hostelxpress/v1/bots"
MQTT_PORT, HTTP_PORT, PG_PORT = 18884, 8014, 55436


def run(command, *, input=None):
    completed = subprocess.run(command, input=input, text=True, capture_output=True)
    if completed.returncode != 0:
        raise RuntimeError(f"{command[0]} failed: {completed.stderr[-800:]}")
    return completed.stdout


def wait_for(predicate, description, timeout=15):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = predicate()
        if value:
            return value
        time.sleep(0.1)
    raise AssertionError(f"Timed out waiting for: {description}")


def acceptance():
    if sys.platform != "linux" or os.geteuid() == 0:
        raise RuntimeError("Run as a normal Ubuntu Linux user")
    for binary in ("mosquitto", "mosquitto_passwd", "openssl"):
        if not shutil.which(binary):
            raise RuntimeError("Missing prerequisite: " + binary)
    if not (PG / "initdb").exists():
        raise RuntimeError("PostgreSQL 17 is required")
    for port in (MQTT_PORT, HTTP_PORT):
        with socket.socket() as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            probe.bind(("127.0.0.1", port))
    os.umask(0o077)
    tools = ROOT / ".tools"
    tools.mkdir(exist_ok=True)
    private = Path(tempfile.mkdtemp(prefix="adapter-acceptance-", dir=tools))
    pg_started, broker, server, server_thread, links = False, None, None, None, []
    observer = None
    previous_env = {}
    try:
        socket_dir, data = private / "socket", private / "postgres"
        socket_dir.mkdir(mode=0o700)
        run([str(PG / "initdb"), "-D", str(data), "-U", "postgres", "--auth-local=trust",
             "--auth-host=reject", "--encoding=UTF8", "--no-locale"])
        run([str(PG / "pg_ctl"), "-D", str(data), "-l", str(private / "postgres.log"),
             "-o", "-k " + shlex.quote(str(socket_dir)) + " -p " + str(PG_PORT) + " -c listen_addresses=''",
             "-w", "start"])
        pg_started = True
        sys.path[:0] = [str(ROOT / "services/api"), str(ROOT / "integrations/device_connector/src")]
        import psycopg
        from psycopg.conninfo import make_conninfo
        from psycopg.rows import dict_row
        from psycopg.types.json import Jsonb

        admin_url = make_conninfo(host=str(socket_dir), port=PG_PORT, dbname="postgres", user="postgres")
        with psycopg.connect(admin_url, autocommit=True) as conn:
            conn.execute("CREATE DATABASE hostelxpress_adapter_acceptance_test")
        db_url = make_conninfo(host=str(socket_dir), port=PG_PORT, dbname="hostelxpress_adapter_acceptance_test", user="postgres")
        with psycopg.connect(db_url, autocommit=True) as conn:
            conn.execute((ROOT / "supabase/tests/bootstrap_local_auth.sql").read_text())
            conn.execute((ROOT / "supabase/init.sql").read_text())
            for migration in sorted((ROOT / "supabase/migrations").glob("[0-9]*.sql")):
                conn.execute(migration.read_text())

        def query(sql, params=()):
            with psycopg.connect(db_url, row_factory=dict_row) as conn:
                return conn.execute(sql, params).fetchall()

        def one(sql, params=()):
            return query(sql, params)[0]

        def first(sql, params=()):
            rows = query(sql, params)
            return rows[0] if rows else None

        bot_id, order1_id, order3_id, order2_id, bot2_id, user_id = (uuid.uuid4() for _ in range(6))
        device_secret = secrets.token_urlsafe(48)
        bot_user, bot_password = "fixture_bot_" + bot_id.hex, secrets.token_urlsafe(32)
        pub_user, pub_password = "fixture_publisher", secrets.token_urlsafe(32)
        ingest_user, ingest_password = "fixture_ingest", secrets.token_urlsafe(32)
        passwords = private / "broker.passwords"
        for index, (username, password) in enumerate(((bot_user, bot_password), (pub_user, pub_password), (ingest_user, ingest_password))):
            run(["mosquitto_passwd"] + (["-c"] if index == 0 else []) + [str(passwords), username], input=password + "\n" + password + "\n")
        passwords.chmod(0o600)
        acl = ["user " + bot_user]
        for suffix in ("telemetry", "state", "events", "acks", "availability"):
            acl += ["topic write " + BASE + "/" + str(bot_id) + "/" + suffix]
        acl += ["topic read " + BASE + "/" + str(bot_id) + "/commands", "",
                "user " + pub_user, "topic write " + BASE + "/" + str(bot_id) + "/commands", "",
                "user " + ingest_user]
        for suffix in ("telemetry", "state", "events", "acks", "availability"):
            acl += ["topic read " + BASE + "/+/" + suffix]
        (private / "broker.acl").write_text("\n".join(acl) + "\n")
        run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", str(private / "ca.key"),
             "-out", str(private / "ca.crt"), "-days", "1", "-subj", "/CN=Hostelxpress Local Acceptance CA",
             "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign,cRLSign"])
        run(["openssl", "req", "-new", "-newkey", "rsa:2048", "-nodes", "-keyout", str(private / "server.key"),
             "-out", str(private / "server.csr"), "-subj", "/CN=localhost"])
        (private / "server.extensions").write_text("subjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=critical,CA:FALSE\nextendedKeyUsage=serverAuth\nkeyUsage=digitalSignature,keyEncipherment\n")
        run(["openssl", "x509", "-req", "-in", str(private / "server.csr"), "-CA", str(private / "ca.crt"),
             "-CAkey", str(private / "ca.key"), "-CAcreateserial", "-out", str(private / "server.crt"),
             "-days", "1", "-extfile", str(private / "server.extensions")])
        config = private / "mosquitto.conf"
        config.write_text("per_listener_settings true\nlistener " + str(MQTT_PORT) + " 127.0.0.1\nallow_anonymous false\npassword_file " + str(passwords) + "\nacl_file " + str(private / "broker.acl") + "\ncafile " + str(private / "ca.crt") + "\ncertfile " + str(private / "server.crt") + "\nkeyfile " + str(private / "server.key") + "\ntls_version tlsv1.2\npersistence false\nlog_type error\n")
        with open(private / "broker.log", "w", encoding="utf-8") as log:
            broker = subprocess.Popen(["mosquitto", "-c", str(config)], stdout=log, stderr=subprocess.STDOUT)

        def broker_ready():
            if broker.poll() is not None:
                raise RuntimeError("Private broker failed: " + (private / "broker.log").read_text()[-1200:])
            try:
                with socket.create_connection(("127.0.0.1", MQTT_PORT), timeout=0.1):
                    return True
            except OSError:
                return False
        wait_for(broker_ready, "private TLS broker listener")

        # Bot 1 serves three orders: order1 arrives paid (uncertain-execution
        # scenario), order3 is loaded then arrives and pays (clean execution),
        # order2 on bot2 stays reserved with a captured payment but no arrival.
        with psycopg.connect(db_url) as conn:
            conn.execute("INSERT INTO auth.users(id,raw_user_meta_data) VALUES(%s,%s)", (user_id, Jsonb({"name": "Acceptance fixture"})))
            conn.execute("INSERT INTO public.bots(id,status,is_demo,last_seen_at) VALUES(%s,'AT_HOSTEL',false,now())", (bot_id,))
            conn.execute("INSERT INTO hostelxpress_private.device_credentials(bot_id,secret) VALUES(%s,%s)", (bot_id, device_secret.encode()))
            conn.execute("INSERT INTO hostelxpress_private.device_state(bot_id,clock_synchronized) VALUES(%s,true)", (bot_id,))
            for number in (1, 2, 3):
                conn.execute("INSERT INTO hostelxpress_private.compartment_state(bot_id,compartment_id,outer_closed,inner_closed,is_empty,observed_at) VALUES(%s,%s,true,true,%s,now())", (bot_id, number, number == 3))
            conn.execute("INSERT INTO public.orders(id,user_id,bot_id,compartment_id,status,destination_hostel_block,parcel_label,loaded_at,arrived_at,is_demo) VALUES(%s,%s,%s,1,'Paid','FIXTURE','Uncertain case',now(),now(),false)", (order1_id, user_id, bot_id))
            conn.execute("INSERT INTO public.transactions(order_id,razorpay_qr_id,razorpay_payment_id,status,captured_at,is_demo) VALUES(%s,%s,%s,'Captured',now(),false)", (order1_id, "qr_fixture_" + uuid.uuid4().hex, "pay_fixture_" + uuid.uuid4().hex))
            conn.execute("UPDATE public.orders SET paid_at=now() WHERE id=%s", (order1_id,))
            conn.execute("INSERT INTO public.orders(id,user_id,bot_id,compartment_id,status,destination_hostel_block,parcel_label,loaded_at,is_demo) VALUES(%s,%s,%s,2,'Transit','FIXTURE','Clean case',now(),false)", (order3_id, user_id, bot_id))
            conn.execute("INSERT INTO public.bots(id,status,is_demo,last_seen_at) VALUES(%s,'AT_HOSTEL',false,now())", (bot2_id,))
            conn.execute("INSERT INTO hostelxpress_private.device_credentials(bot_id,secret) VALUES(%s,%s)", (bot2_id, device_secret.encode()))
            conn.execute("INSERT INTO hostelxpress_private.device_state(bot_id,clock_synchronized) VALUES(%s,true)", (bot2_id,))
            for number in (1, 2, 3):
                conn.execute("INSERT INTO hostelxpress_private.compartment_state(bot_id,compartment_id,outer_closed,inner_closed,is_empty,observed_at) VALUES(%s,%s,true,true,true,now())", (bot2_id, number))
            conn.execute("INSERT INTO public.orders(id,user_id,bot_id,compartment_id,status,destination_hostel_block,parcel_label,is_demo) VALUES(%s,%s,%s,1,'Pending','FIXTURE','Never arrived',false)", (order2_id, user_id, bot2_id))
            conn.execute("INSERT INTO public.transactions(order_id,razorpay_qr_id,razorpay_payment_id,status,captured_at,is_demo) VALUES(%s,%s,%s,'Captured',now(),false)", (order2_id, "qr_fixture_" + uuid.uuid4().hex, "pay_fixture_" + uuid.uuid4().hex))
            conn.execute("UPDATE public.orders SET paid_at=now() WHERE id=%s", (order2_id,))

        for key, value in {"APP_ENV": "production", "DATABASE_URL": db_url, "SUPABASE_URL": "https://acceptance.invalid", "WORKER_ENABLED": "true"}.items():
            previous_env[key] = os.environ.get(key)
            os.environ[key] = value
        import uvicorn
        from app.config import Settings
        from app.main import create_app
        import paho.mqtt.client as mqtt
        import hostelxpress_link.link as link_module
        from hostelxpress_link import BrokerConfig, HostelxpressLink

        settings = Settings(app_env="production", database_url=db_url, supabase_url="https://acceptance.invalid",
                            worker_enabled=True, mqtt_host="localhost", mqtt_port=MQTT_PORT,
                            mqtt_ca_file=str(private / "ca.crt"), mqtt_username=pub_user, mqtt_password=pub_password,
                            mqtt_ingest_username=ingest_user, mqtt_ingest_password=ingest_password,
                            mqtt_ingest_client_id="acceptance-ingest-" + uuid.uuid4().hex, trusted_hosts="127.0.0.1,localhost")
        app = create_app(settings)
        server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=HTTP_PORT, access_log=False, log_config=None, log_level="warning"))
        server_thread = threading.Thread(target=server.run, daemon=True, name="adapter-acceptance-api")
        server_thread.start()
        wait_for(lambda: server.started, "real FastAPI listener")
        bridge = app.state.mqtt_bridge
        wait_for(lambda: bridge.connected.is_set() and bridge.ingest.is_connected(), "backend publisher and ingest TLS sessions")

        actuator_count = [0]
        # Order1 exercises the uncertain-asynchronous path; order3 executes cleanly.
        def guard(command):
            if command.bot_id != str(bot_id) or command.command != "unlock_inner":
                return False
            if command.order_id == str(order1_id) and command.compartment == 1:
                return True
            if command.order_id == str(order3_id) and command.compartment == 2:
                return True
            return False

        def on_unlock(command):
            actuator_count[0] += 1
            if command.order_id == str(order1_id):
                return None  # asynchronous: confirmation never arrives before the crash
            return True  # order3: the controller confirms synchronously

        ledger = private / "device.sqlite3"

        def device(now=None, ledger_path=None):
            link = HostelxpressLink(str(bot_id), ledger_path or ledger,
                                    broker=BrokerConfig(host="localhost", port=MQTT_PORT, username=bot_user, password=bot_password, ca_file=str(private / "ca.crt")),
                                    api_url="http://127.0.0.1:" + str(HTTP_PORT), device_secret=device_secret,
                                    allow_loopback_http=True, guard=guard, on_unlock=on_unlock,
                                    clock_synchronized=lambda: True, now=now)
            links.append(link)
            return link

        link = device()
        link.connect()
        wait_for(lambda: link.connected, "provisioned device TLS connection")
        # Command observer subscribes before telemetry so the worker's first
        # publication cannot be missed (commands are non-retained).
        command_observations = []
        observer = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="acceptance-observer-" + uuid.uuid4().hex, protocol=mqtt.MQTTv5)
        observer.username_pw_set(bot_user, bot_password)
        observer.tls_set(ca_certs=str(private / "ca.crt"), tls_version=ssl.PROTOCOL_TLS_CLIENT)
        observer.tls_insecure_set(False)
        observer_ready = threading.Event()
        def observer_connected(_client, _u, _f, reason, _p):
            if not reason.is_failure:
                observer.subscribe(BASE + "/" + str(bot_id) + "/commands", qos=1)
                observer_ready.set()
        observer.on_connect = observer_connected
        observer.on_message = lambda _client, _u, message: command_observations.append(bytes(message.payload))
        observer.connect("localhost", MQTT_PORT)
        observer.loop_start()
        wait_for(lambda: observer_ready.is_set(), "authorized command observer")
        link.report_telemetry(current_lat=None, current_lng=None, battery_level=88,
                              compartments=[{"compartment": n, "outer_closed": True, "inner_closed": True, "is_empty": n == 3} for n in (1, 2, 3)],
                              clock_synchronized=True)
        wait_for(lambda: one("SELECT battery_level FROM public.bots WHERE id=%s", (bot_id,))["battery_level"] == 88, "telemetry over TLS persisted")

        # Duplicate durable-event delivery first (the bot is still AT_HOSTEL, so
        # order3's Transit->Arrived transition is valid): one stored row, a
        # duplicate receipt on the identical retry after a lost response.
        receipts = []

        def signing_sender(payload):
            raw = link_module._json(payload)
            stamp = str(int(time.time()))
            path = "/v1/devices/" + str(bot_id) + "/messages"
            signature = hmac.new(device_secret.encode(), stamp.encode() + b".POST." + path.encode() + b"." + raw, hashlib.sha256).hexdigest()
            request = Request("http://127.0.0.1:" + str(HTTP_PORT) + path, data=raw, method="POST",
                              headers={"Content-Type": "application/json", "X-Device-Timestamp": stamp, "X-Device-Signature": signature})
            with urlopen(request, timeout=5) as response:
                receipt = json.loads(response.read(65537))
            receipts.append(receipt)
            if len(receipts) == 1:
                raise ConnectionError("simulated lost response after durable storage")
            return receipt
        link._http = signing_sender
        arrived_id = link.report_arrived(str(order3_id), 2)
        try:
            link.flush_events()
        except ConnectionError:
            pass
        wait_for(lambda: any(r.get("message_id") == arrived_id for r in receipts), "first flush stored the arrival event")
        first_arrived = next(r for r in receipts if r.get("message_id") == arrived_id)
        assert first_arrived["stored"] is True and first_arrived["duplicate"] is False
        link.flush_events()
        wait_for(lambda: len([r for r in receipts if r.get("message_id") == arrived_id]) >= 2, "retry after the lost response")
        arrived_receipts = [r for r in receipts if r.get("message_id") == arrived_id]
        assert arrived_receipts[1]["duplicate"] is True, arrived_receipts[1]
        assert one("SELECT count(*) AS n FROM hostelxpress_private.device_events WHERE bot_id=%s AND (payload->>'message_id')=%s", (bot_id, arrived_id))["n"] == 1, "duplicate delivery stored a second row"
        link._http = HostelxpressLink._http.__get__(link)

        # Uncertain execution on order1: asynchronous unlock, crash, restart.
        command1_id = str(wait_for(lambda: (first("SELECT id FROM hostelxpress_private.command_outbox WHERE order_id=%s AND command='unlock_inner'", (order1_id,)) or {}).get("id"), "worker-created durable unlock command for order1"))
        def matching_command_bytes():
            for raw in command_observations:
                try:
                    if json.loads(raw).get("message_id") == command1_id:
                        return raw
                except Exception:
                    continue
            return None
        command1_bytes = wait_for(matching_command_bytes, "command bytes for the outbox command over TLS")
        wait_for(lambda: actuator_count[0] == 1, "asynchronous unlock invoked exactly once")
        wait_for(lambda: one("SELECT status FROM hostelxpress_private.command_outbox WHERE id=%s", (command1_id,))["status"] == "published", "command published but not executed without device confirmation")
        first_link = link
        first_link._closed_by_harness = True
        first_link.close()
        link = device()
        link.connect()
        wait_for(lambda: link.connected, "connector restart on the same durable ledger")
        assert actuator_count[0] == 1, "restart replayed an uncertain actuation"
        publication = bridge.publisher.publish(BASE + "/" + str(bot_id) + "/commands", command1_bytes, qos=1, retain=False)
        publication.wait_for_publish(timeout=5)
        wait_for(lambda: link.pending_events == 0, "redelivered command acknowledged from the recorded decision")
        assert actuator_count[0] == 1, "redelivery re-actuated an uncertain command"
        wait_for(lambda: one("SELECT status FROM hostelxpress_private.command_outbox WHERE id=%s", (command1_id,))["status"] == "rejected", "backend marks the uncertain command rejected for operator reconciliation")
        try:
            link.confirm_command_execution(command1_id)
            raise AssertionError("a post-restart uncertain command accepted a silent late confirmation")
        except ValueError:
            pass

        # Captured payment without arrival/telemetry never produces an unlock.
        time.sleep(3)
        assert not query("SELECT id FROM hostelxpress_private.command_outbox WHERE order_id=%s", (order2_id,)), "unlock created without arrival and telemetry"
        assert one("SELECT status FROM public.orders WHERE id=%s", (order2_id,))["status"] == "Pending"

        # Clean execution on order3: pay it, then the worker's unlock executes
        # synchronously and the correlated closure with an empty reading completes.
        with psycopg.connect(db_url) as conn:
            conn.execute("INSERT INTO public.transactions(order_id,razorpay_qr_id,razorpay_payment_id,status,captured_at,is_demo) VALUES(%s,%s,%s,'Captured',now(),false)", (order3_id, "qr_fixture_" + uuid.uuid4().hex, "pay_fixture_" + uuid.uuid4().hex))
            conn.execute("UPDATE public.orders SET status='Paid',paid_at=now() WHERE id=%s", (order3_id,))
        link.report_telemetry(current_lat=None, current_lng=None, battery_level=87,
                              compartments=[{"compartment": n, "outer_closed": True, "inner_closed": True, "is_empty": n == 3} for n in (1, 2, 3)],
                              clock_synchronized=True)
        command3_id = str(wait_for(lambda: (first("SELECT id FROM hostelxpress_private.command_outbox WHERE order_id=%s AND command='unlock_inner' AND status='executed'", (order3_id,)) or {}).get("id"), "clean unlock for order3 executed end to end"))
        assert actuator_count[0] == 2, "clean unlock did not actuate exactly once more"
        link.report_lid_event(str(order3_id), 2, lid="inner", closed=True, command_id=command3_id, is_empty=True)
        wait_for(lambda: one("SELECT status FROM public.orders WHERE id=%s", (order3_id,))["status"] == "Completed", "correlated closure and empty reading complete the order")
        assert not link.pending_reconciliations, "clean completion must not require reconciliation"
        assert actuator_count[0] == 2, "completion path re-actuated a compartment"
        wait_for(lambda: link.pending_events == 0, "all real durable events acknowledged")

        # Expired-TTL and retained copies of a server command never actuate, run
        # deliberately last: their rejection acks reference synthetic command ids
        # that no server ever issued, so the backend rightly refuses them and the
        # strictly ordered durable queue retains them for operator reconciliation.
        stale_now = datetime.now(timezone.utc)
        expired = {"schema_version": 1, "message_type": "command", "message_id": str(uuid.uuid4()),
                   "bot_id": str(bot_id), "order_id": str(order1_id), "compartment": 1,
                   "command": "unlock_inner",
                   "sent_at": (stale_now - timedelta(minutes=10)).isoformat().replace("+00:00", "Z"),
                   "issued_at": (stale_now - timedelta(minutes=10)).isoformat().replace("+00:00", "Z"),
                   "expires_at": (stale_now - timedelta(minutes=9)).isoformat().replace("+00:00", "Z")}
        decision = link.process_command(BASE + "/" + str(bot_id) + "/commands", json.dumps(expired).encode(), retained=False)
        assert decision.result == "rejected" and decision.command_id == expired["message_id"], decision
        retained_decision = link.process_command(BASE + "/" + str(bot_id) + "/commands", json.dumps(expired).encode(), retained=True)
        assert retained_decision.result == "rejected", retained_decision
        assert actuator_count[0] == 2, "expired or retained command reached the actuator"
        assert link.pending_events >= 2, "device-side rejections must be acked toward the server"

        # Stale observation on order1, deliberately last: the stale-clock link is
        # a second concurrent boot for the same bot, so the backend retires the
        # main link's boot when it appears. Nothing further uses MQTT after this.
        past_link = device(now=lambda: datetime.now(timezone.utc) - timedelta(seconds=120),
                           ledger_path=private / "device-stale.sqlite3")
        past_link.connect()
        wait_for(lambda: past_link.connected, "stale-clock device connection")
        past_link.report_lid_event(str(order1_id), 1, lid="inner", closed=True, command_id=command1_id, is_empty=True)
        wait_for(lambda: past_link.pending_reconciliations, "stale observation queued as reconciliation")
        assert past_link.pending_reconciliations[0]["receipt"]["reconciliation_required"] is True
        past_link.acknowledge_reconciliation(past_link.pending_reconciliations[0]["message_id"])
        assert not past_link.pending_reconciliations
        past_link._closed_by_harness = True
        past_link.close()

        return {"harness": "local Mosquitto + disposable PostgreSQL + real FastAPI; no HiveMQ, gateway or hardware",
                "uncertain_async_actuations": actuator_count[0] - 1,
                "restart_replay_blocked": True,
                "post_restart_confirm_refused": True,
                "uncertain_command_backend_status": "rejected",
                "expired_command": "rejected", "retained_command": "rejected",
                "payment_without_arrival_unlocks": 0,
                "duplicate_event_receipts": [r["duplicate"] for r in receipts],
                "stale_event_outcome": "reconciliation_required",
                "clean_order_completed": True}
    finally:
        cleanup_errors = []
        def cleanup(label, action):
            try:
                action()
            except Exception:
                cleanup_errors.append(label)
        for link in links:
            if getattr(link, "_closed_by_harness", False):
                continue
            cleanup("device", link.close)
        if observer:
            cleanup("observer disconnect", observer.disconnect)
            cleanup("observer loop", observer.loop_stop)
        if server:
            server.should_exit = True
        if server_thread:
            server_thread.join(timeout=8)
            if server_thread.is_alive():
                server.force_exit = True
                server_thread.join(timeout=3)
                if server_thread.is_alive():
                    cleanup_errors.append("HTTP server thread")
        if broker:
            broker.terminate()
            try:
                broker.wait(timeout=5)
            except subprocess.TimeoutExpired:
                broker.kill()
                broker.wait(timeout=3)
        if pg_started:
            cleanup("private PostgreSQL", lambda: run([str(PG / "pg_ctl"), "-D", str(private / "postgres"), "-m", "fast", "-w", "stop"]))
        for key, value in previous_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        if private.parent.resolve() != tools.resolve() or not private.name.startswith("adapter-acceptance-"):
            raise RuntimeError("Refusing cleanup outside harness directory")
        if cleanup_errors:
            raise RuntimeError("Harness cleanup needs attention: " + ", ".join(cleanup_errors))
        shutil.rmtree(private)


if __name__ == "__main__":
    if os.environ.get("HOSTELXPRESS_ADAPTER_ACCEPTANCE") != "1":
        print("SKIP: set HOSTELXPRESS_ADAPTER_ACCEPTANCE=1 for the local adapter acceptance harness.")
        raise SystemExit(0)
    print(json.dumps(acceptance(), indent=2))
