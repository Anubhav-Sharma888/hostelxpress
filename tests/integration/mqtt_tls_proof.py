#!/usr/bin/env python3
"""Actual local TLS MQTT/HTTP/DB proof. Synthetic payment; fake actuator only."""
from __future__ import annotations
import json
import os
from pathlib import Path
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
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
PG = Path("/usr/lib/postgresql/17/bin")
MQTT_PORT, HTTP_PORT, PG_PORT = 18883, 8002, 55439
BASE = "hostelxpress/v1/bots"

def wait_for(predicate, description, timeout=12):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = predicate()
        if value:
            return value
        time.sleep(0.05)
    raise AssertionError("Timed out: " + description)

def run(command, *, input=None):
    completed = subprocess.run(command, input=input, text=True, capture_output=True, timeout=30)
    if completed.returncode:
        # Do not print argv: even disposable credentials must not be disclosed.
        raise RuntimeError(Path(command[0]).name + " failed: " + completed.stderr[-1200:])
    return completed.stdout

def proof():
    if sys.platform != "linux" or os.geteuid() == 0:
        raise RuntimeError("Run as a normal Ubuntu Linux user")
    for binary in ("mosquitto", "mosquitto_passwd", "openssl"):
        if not shutil.which(binary):
            raise RuntimeError("Missing prerequisite: " + binary)
    if not (PG / "initdb").exists():
        raise RuntimeError("PostgreSQL 17 is required")
    for port in (MQTT_PORT, HTTP_PORT):
        with socket.socket() as probe:
            # A live listener still blocks this bind; only TIME_WAIT residue must not.
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            probe.bind(("127.0.0.1", port))
    os.umask(0o077)
    tools = ROOT / ".tools"
    tools.mkdir(exist_ok=True)
    private = Path(tempfile.mkdtemp(prefix="mqtt-proof-", dir=tools))
    pg_started, broker, server, server_thread, link = False, None, None, None, None
    clients, previous_env = [], {}
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
        import paho.mqtt.client as mqtt
        import uvicorn
        from hostelxpress_link import BrokerConfig, HostelxpressLink

        admin_url = make_conninfo(host=str(socket_dir), port=PG_PORT, dbname="postgres", user="postgres")
        with psycopg.connect(admin_url, autocommit=True) as conn:
            conn.execute("CREATE DATABASE hostelxpress_mqtt_proof_test")
        db_url = make_conninfo(host=str(socket_dir), port=PG_PORT, dbname="hostelxpress_mqtt_proof_test", user="postgres")
        with psycopg.connect(db_url, autocommit=True) as conn:
            conn.execute((ROOT / "supabase/tests/bootstrap_local_auth.sql").read_text())
            conn.execute((ROOT / "supabase/init.sql").read_text())
            for migration in sorted((ROOT / "supabase/migrations").glob("[0-9]*.sql")):
                conn.execute(migration.read_text())
        def query(sql, params=()):
            with psycopg.connect(db_url, row_factory=dict_row) as conn:
                return conn.execute(sql, params).fetchone()

        bot_id, order_id, user_id = uuid4(), uuid4(), uuid4()
        device_secret = secrets.token_urlsafe(48)
        bot_user, bot_password = "fixture_bot_" + bot_id.hex, secrets.token_urlsafe(32)
        pub_user, pub_password = "fixture_publisher", secrets.token_urlsafe(32)
        ingest_user, ingest_password = "fixture_ingest", secrets.token_urlsafe(32)
        passwords = private / "broker.passwords"
        for index, (username, password) in enumerate(((bot_user, bot_password), (pub_user, pub_password), (ingest_user, ingest_password))):
            command = ["mosquitto_passwd"] + (["-c"] if index == 0 else []) + [str(passwords), username]
            run(command, input=password + "\n" + password + "\n")
        passwords.chmod(0o600)
        acl = ["user " + bot_user]
        suffixes = ("telemetry", "state", "events", "acks", "availability")
        acl += ["topic write " + BASE + "/" + str(bot_id) + "/" + suffix for suffix in suffixes]
        acl += ["topic read " + BASE + "/" + str(bot_id) + "/commands", "",
                "user " + pub_user, "topic write " + BASE + "/" + str(bot_id) + "/commands", "",
                "user " + ingest_user]
        acl += ["topic read " + BASE + "/+/" + suffix for suffix in suffixes]
        (private / "broker.acl").write_text("\n".join(acl) + "\n")
        run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", str(private / "ca.key"),
             "-out", str(private / "ca.crt"), "-days", "1", "-subj", "/CN=Hostelxpress Local Proof CA",
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

        # Synthetic captured payment and local safety fixtures, never a gateway call.
        with psycopg.connect(db_url) as conn:
            conn.execute("INSERT INTO auth.users(id,raw_user_meta_data) VALUES(%s,%s)", (user_id, Jsonb({"name":"MQTT transport fixture"})))
            conn.execute("INSERT INTO public.bots(id,status,is_demo,last_seen_at) VALUES(%s,'AT_HOSTEL',false,now())", (bot_id,))
            conn.execute("INSERT INTO hostelxpress_private.device_credentials(bot_id,secret) VALUES(%s,%s)", (bot_id,device_secret.encode()))
            conn.execute("INSERT INTO hostelxpress_private.device_state(bot_id,clock_synchronized) VALUES(%s,true)", (bot_id,))
            for number in (1,2,3):
                conn.execute("INSERT INTO hostelxpress_private.compartment_state(bot_id,compartment_id,outer_closed,inner_closed,is_empty,observed_at) VALUES(%s,%s,true,true,%s,now())", (bot_id,number,number!=1))
            # paid_at and the captured transaction stay absent for now: the worker's
            # reconciliation would otherwise create and publish the unlock command
            # before the proof's observer and device are ready to record it.
            conn.execute("INSERT INTO public.orders(id,user_id,bot_id,compartment_id,status,destination_hostel_block,parcel_label,loaded_at,arrived_at,is_demo) VALUES(%s,%s,%s,1,'Paid','FIXTURE','Transport proof',now(),now(),false)", (order_id,user_id,bot_id))
        for key,value in {"APP_ENV":"production","DATABASE_URL":db_url,"SUPABASE_URL":"https://transport-proof.invalid","WORKER_ENABLED":"true"}.items():
            previous_env[key]=os.environ.get(key)
            os.environ[key]=value
        from app.config import Settings
        from app.main import create_app
        settings=Settings(app_env="production",database_url=db_url,supabase_url="https://transport-proof.invalid",worker_enabled=True,mqtt_host="localhost",mqtt_port=MQTT_PORT,mqtt_ca_file=str(private/"ca.crt"),mqtt_username=pub_user,mqtt_password=pub_password,mqtt_ingest_username=ingest_user,mqtt_ingest_password=ingest_password,mqtt_ingest_client_id="fixture-ingest-"+uuid4().hex,trusted_hosts="127.0.0.1,localhost")
        app=create_app(settings)
        server=uvicorn.Server(uvicorn.Config(app,host="127.0.0.1",port=HTTP_PORT,access_log=False,log_config=None,log_level="warning"))
        server_thread=threading.Thread(target=server.run,daemon=True,name="mqtt-proof-api")
        server_thread.start()
        wait_for(lambda:server.started,"real FastAPI listener")
        bridge=app.state.mqtt_bridge
        wait_for(lambda:bridge.connected.is_set() and bridge.ingest.is_connected(),"backend publisher and ingest TLS sessions")

        def client(username,password,client_id):
            instance=mqtt.Client(mqtt.CallbackAPIVersion.VERSION2,client_id=client_id,protocol=mqtt.MQTTv5)
            instance.username_pw_set(username,password)
            instance.tls_set(ca_certs=str(private/"ca.crt"),tls_version=ssl.PROTOCOL_TLS_CLIENT)
            instance.tls_insecure_set(False)
            clients.append(instance)
            return instance
        received=[]
        observer_ready,observer_subscribed=threading.Event(),threading.Event()
        observer=client(bot_user,bot_password,"proof-observer-"+uuid4().hex)
        def observer_connected(instance,_u,_f,reason,_p):
            if not reason.is_failure:
                instance.subscribe(BASE+"/"+str(bot_id)+"/commands",qos=1)
                observer_ready.set()
        observer.on_connect=observer_connected
        observer.on_subscribe=lambda *_:observer_subscribed.set()
        observer.on_message=lambda _c,_u,message:received.append(bytes(message.payload))
        observer.connect("localhost",MQTT_PORT)
        observer.loop_start()
        wait_for(lambda:observer_ready.is_set() and observer_subscribed.is_set(),"authorized command observer")
        actuator_count,sensors_safe=[0],[True]
        def guard(command):
            return command.bot_id==str(bot_id) and command.order_id==str(order_id) and command.compartment==1 and command.command=="unlock_inner" and sensors_safe[0]
        def fake_actuator(_command):
            actuator_count[0]+=1
            sensors_safe[0]=False
            return True
        ledger=private/"device.sqlite3"
        def device():
            return HostelxpressLink(str(bot_id),ledger,broker=BrokerConfig(host="localhost",port=MQTT_PORT,username=bot_user,password=bot_password,ca_file=str(private/"ca.crt")),api_url="http://127.0.0.1:"+str(HTTP_PORT),device_secret=device_secret,allow_loopback_http=True,guard=guard,on_unlock=fake_actuator,clock_synchronized=lambda:True)
        link=device()
        link.connect()
        wait_for(lambda:link.connected,"provisioned device TLS connection")
        telemetry_id=link.report_telemetry(current_lat=None,current_lng=None,battery_level=91,compartments=[{"compartment":number,"outer_closed":True,"inner_closed":True,"is_empty":number!=1} for number in (1,2,3)],clock_synchronized=True)
        wait_for(lambda:query("SELECT message_id FROM hostelxpress_private.device_events WHERE bot_id=%s AND message_id=%s",(bot_id,telemetry_id)),"actual MQTT telemetry persisted")
        assert query("SELECT battery_level FROM public.bots WHERE id=%s",(bot_id,))["battery_level"]==91
        # Synthetic captured payment; no gateway request. Reconciliation now owns
        # the unlock command, so the proof follows the production path.
        with psycopg.connect(db_url) as conn:
            conn.execute("INSERT INTO public.transactions(order_id,razorpay_qr_id,razorpay_payment_id,status,captured_at,is_demo) VALUES(%s,%s,%s,'Captured',now(),false)", (order_id,"qr_fixture_"+uuid4().hex,"pay_fixture_"+uuid4().hex))
            conn.execute("UPDATE public.orders SET paid_at=now() WHERE id=%s",(order_id,))
        command_id=wait_for(lambda:query("SELECT id FROM hostelxpress_private.command_outbox WHERE order_id=%s AND command='unlock_inner'",(order_id,)),"worker-created durable unlock command")["id"]
        wait_for(lambda:query("SELECT status FROM hostelxpress_private.command_outbox WHERE id=%s",(command_id,))["status"]=="executed","worker command and signed HTTP executed acknowledgement")
        wait_for(lambda:received,"original command bytes over TLS")
        wait_for(lambda:link.pending_events==0,"matching durable HTTP receipts")
        assert actuator_count[0]==1
        original=received[0]
        payload=json.loads(original)
        assert payload["message_id"]==str(command_id) and payload["sent_at"]==payload["issued_at"]
        def ack_count():
            return query("SELECT count(*) AS n FROM hostelxpress_private.device_events WHERE bot_id=%s AND event_type='ack'",(bot_id,))["n"]
        for restart in (False,True):
            if restart:
                link.close()
                link=None
                link=device()
                link.connect()
                wait_for(lambda:link.connected,"connector restart using same durable ledger")
            before=ack_count()
            publication=bridge.publisher.publish(BASE+"/"+str(bot_id)+"/commands",original,qos=1,retain=False)
            publication.wait_for_publish(timeout=3)
            wait_for(lambda:ack_count()>before and link.pending_events==0,"exact duplicate acknowledgement")
            assert actuator_count[0]==1,"Duplicate transport delivery repeated fake actuator"
        assert not link.pending_reconciliations

        denied=[]
        connected=threading.Event()
        probe=client(bot_user,bot_password,"proof-acl-"+uuid4().hex)
        probe.on_connect=lambda _c,_u,_f,reason,_p:connected.set() if not reason.is_failure else None
        probe.on_publish=lambda _c,_u,_m,reason,_p:denied.append(reason.is_failure)
        probe.connect("localhost",MQTT_PORT)
        probe.loop_start()
        wait_for(connected.is_set,"bot ACL probe authentication")
        for topic in (BASE+"/"+str(bot_id)+"/commands",BASE+"/"+str(uuid4())+"/commands"):
            probe.publish(topic,b'{"fixture":"must-be-denied"}',qos=1,retain=False)
        wait_for(lambda:len(denied)==2,"MQTT v5 command ACL rejection receipts")
        assert all(denied),"A bot identity could publish server commands"
        wrong_password=threading.Event()
        wrong=client(bot_user,secrets.token_urlsafe(32),"proof-invalid-"+uuid4().hex)
        wrong.on_connect=lambda _c,_u,_f,reason,_p:wrong_password.set() if reason.is_failure else None
        wrong.connect("localhost",MQTT_PORT)
        wrong.loop_start()
        wait_for(wrong_password.is_set,"incorrect MQTT password rejected")
        request=Request("http://127.0.0.1:"+str(HTTP_PORT)+"/v1/devices/"+str(bot_id)+"/messages",data=b"{}",headers={"Content-Type":"application/json","X-Device-Timestamp":str(int(time.time())),"X-Device-Signature":"0"*64},method="POST")
        try:
            urlopen(request,timeout=3)
            raise AssertionError("Invalid HTTP device signature was accepted")
        except HTTPError as error:
            assert error.code==401
        tls=bridge.publisher.socket().version()
        assert tls in {"TLSv1.2","TLSv1.3"}
        assert query("SELECT status FROM public.bots WHERE id=%s",(bot_id,))["status"]=="UNLOCKED"
        version=subprocess.run(["mosquitto","-h"],text=True,capture_output=True,timeout=30)  # -h exits nonzero
        broker_banner=(version.stdout or version.stderr).splitlines()[0]
        return {"proof":"local Mosquitto compatibility, not HiveMQ or physical hardware certification","broker":broker_banner,"tls":tls,"mqtt_telemetry_persisted":1,"command_status":"executed","fake_actuator_calls":actuator_count[0],"exact_byte_duplicate_replays":2,"device_restarts_with_same_ledger":1,"signed_http_ack_records":ack_count(),"pending_device_events":link.pending_events,"bot_command_publish_denials":len(denied),"wrong_password_rejected":True,"invalid_device_hmac_rejected":True,"payment":"synthetic fixture; no gateway request"}
    finally:
        cleanup_errors=[]
        def cleanup(label,action):
            try:
                action()
            except Exception:
                cleanup_errors.append(label)
        if link:
            cleanup("device",link.close)
        for instance in clients:
            cleanup("MQTT client disconnect",instance.disconnect)
            cleanup("MQTT client thread",instance.loop_stop)
        if server:
            server.should_exit=True
        if server_thread:
            server_thread.join(timeout=8)
            if server_thread.is_alive():
                server.force_exit=True
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
            cleanup("private PostgreSQL",lambda:run([str(PG/"pg_ctl"),"-D",str(private/"postgres"),"-m","fast","-w","stop"]))
        for key,value in previous_env.items():
            if value is None:
                os.environ.pop(key,None)
            else:
                os.environ[key]=value
        if private.parent.resolve()!=tools.resolve() or not private.name.startswith("mqtt-proof-"):
            raise RuntimeError("Refusing cleanup outside proof directory")
        if not cleanup_errors:
            shutil.rmtree(private)
        else:
            raise RuntimeError("Proof cleanup needs attention: "+", ".join(cleanup_errors))

if __name__=="__main__":
    if os.environ.get("HOSTELXPRESS_MQTT_PROOF")!="1":
        print("SKIP: set HOSTELXPRESS_MQTT_PROOF=1 for the isolated TLS transport proof.")
        raise SystemExit(0)
    print(json.dumps(proof(),indent=2))
