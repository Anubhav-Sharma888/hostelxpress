from __future__ import annotations

import fcntl
import hashlib
import hmac
import json
import os
import queue
import sqlite3
import ssl
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from importlib.resources import files
from pathlib import Path
from typing import Callable, Literal
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener
from uuid import UUID, uuid4

import paho.mqtt.client as mqtt
from jsonschema import Draft202012Validator, FormatChecker
from paho.mqtt.packettypes import PacketTypes
from paho.mqtt.properties import Properties
from paho.mqtt.subscribeoptions import SubscribeOptions


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        return None  # Never forward a signed device request to another endpoint.


def _json(payload: dict) -> bytes:
    return json.dumps(payload, separators=(",", ":"), sort_keys=True, allow_nan=False).encode()


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON field")
        result[key] = value
    return result


def _uuid(value: str) -> str:
    canonical = str(UUID(str(value)))
    if canonical != value:
        raise ValueError("IDs must use canonical lowercase UUIDs")
    return canonical


def _time(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("UTC timestamp required")
    return parsed.astimezone(timezone.utc)


@dataclass(frozen=True)
class BrokerConfig:
    host: str
    username: str
    password: str = field(repr=False)
    port: int = 8883
    ca_file: str | None = None


@dataclass(frozen=True)
class Command:
    command_id: str
    bot_id: str
    order_id: str
    compartment: int
    command: Literal["unlock_outer", "unlock_inner"]
    issued_at: datetime
    expires_at: datetime


@dataclass(frozen=True)
class Decision:
    command_id: str | None
    result: Literal["accepted", "executed", "rejected"]
    reason: str | None = None


class HostelxpressLink:
    """Transport only. Callers supply actual local assignment/sensor/clock guards.

    MQTT carries commands and replaceable telemetry. Critical events and acks
    persist in SQLite until a signed HTTP application receipt confirms storage.
    No method implements navigation, OTP validation, servo control, or payment.
    """

    def __init__(self, bot_id: str, ledger_path: str | Path, *,
                 broker: BrokerConfig | None = None,
                 api_url: str | None = None, device_secret: str | None = None,
                 guard: Callable[[Command], bool] | None = None,
                 on_unlock: Callable[[Command], bool | None] | None = None,
                 clock_synchronized: Callable[[], bool] | None = None,
                 allow_loopback_http: bool = False,
                 now: Callable[[], datetime] | None = None,
                 http_sender: Callable[[dict], dict] | None = None,
                 on_reconciliation: Callable[[dict], None] | None = None):
        self.bot_id = _uuid(bot_id)
        self.base_topic = f"hostelxpress/v1/bots/{self.bot_id}"
        self.broker, self.api_url, self.device_secret = broker, api_url, device_secret
        self.guard, self.on_unlock = guard, on_unlock
        self.clock_synchronized = clock_synchronized
        self._now = now or (lambda: datetime.now(timezone.utc))
        self._http_sender = http_sender
        self.on_reconciliation = on_reconciliation
        self._lock = threading.RLock()
        self._client: mqtt.Client | None = None
        self._connected = False
        self._stop = threading.Event()
        self._commands: queue.Queue = queue.Queue(maxsize=32)
        self._worker: threading.Thread | None = None
        self.boot_id, self._sequence = str(uuid4()), 0
        if api_url:
            parsed = urlparse(api_url)
            if parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in {"", "/"}:
                raise ValueError("API URL must be an origin without credentials, query or path")
            local = parsed.hostname in {"localhost", "127.0.0.1", "::1"}
            if parsed.scheme != "https" and not (allow_loopback_http and local and parsed.scheme == "http"):
                raise ValueError("HTTPS required; HTTP is allowed only for explicit loopback development")
            if not parsed.hostname or not device_secret or len(device_secret) < 32:
                raise ValueError("API origin and a provisioned device secret of at least 32 characters are required")
            self.api_url = api_url.rstrip("/")
        path = Path(ledger_path).expanduser().resolve()
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        self._lockfile = open(str(path) + ".lock", "a", encoding="utf-8")
        os.chmod(str(path) + ".lock", 0o600)
        try:
            fcntl.flock(self._lockfile, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            self._lockfile.close()
            raise RuntimeError("Another link process owns this device ledger") from None
        self._db = sqlite3.connect(path, check_same_thread=False)
        os.chmod(path, 0o600)
        self._db.execute("pragma journal_mode=DELETE")
        self._db.execute("pragma synchronous=FULL")
        self._db.executescript("""
          create table if not exists commands (
            id text primary key, digest text not null, payload text not null,
            result text not null, reason text
          );
          create table if not exists critical_queue (
            id text primary key, payload text not null
          );
          create table if not exists reconciliations (
            id text primary key, payload text not null, receipt text not null,
            acknowledged integer not null default 0
          );
        """)
        # A crash after intent persistence may have happened before or after a
        # physical effect. Never replay such an uncertain command automatically.
        self._db.execute("update commands set result='rejected', reason='execution_uncertain' where result='accepted'")
        self._db.commit()
        schema = json.loads(files("hostelxpress_link").joinpath("wire.schema.json").read_text())
        self._validator = Draft202012Validator(schema, format_checker=FormatChecker())

    @classmethod
    def from_env(cls, **callbacks):
        bot_id = os.environ["HOSTELXPRESS_BOT_ID"]
        broker = BrokerConfig(host=os.environ["HOSTELXPRESS_MQTT_HOST"],
                              username=os.environ["HOSTELXPRESS_MQTT_USERNAME"],
                              password=os.environ["HOSTELXPRESS_MQTT_PASSWORD"],
                              port=int(os.environ.get("HOSTELXPRESS_MQTT_PORT", "8883")),
                              ca_file=os.environ.get("HOSTELXPRESS_MQTT_CA_FILE") or None)
        ledger = os.environ.get("HOSTELXPRESS_LEDGER", str(Path.home() / ".local/state/hostelxpress" / (bot_id + ".sqlite3")))
        return cls(bot_id, ledger, broker=broker,
                   api_url=os.environ["HOSTELXPRESS_API_URL"],
                   device_secret=os.environ["HOSTELXPRESS_DEVICE_SECRET"],
                   allow_loopback_http=os.environ.get("HOSTELXPRESS_ALLOW_LOOPBACK_HTTP") == "1", **callbacks)

    def _base(self, kind: str) -> dict:
        return {"schema_version": 1, "message_type": kind, "message_id": str(uuid4()),
                "bot_id": self.bot_id, "sent_at": self._now().astimezone(timezone.utc).isoformat().replace("+00:00", "Z")}

    def _validate(self, payload: dict) -> None:
        self._validator.validate(payload)
        if len(_json(payload)) > 16384:
            raise ValueError("Payload exceeds 16 KiB")

    def _http(self, payload: dict) -> dict:
        if self._http_sender:
            return self._http_sender(payload)
        if not self.api_url or not self.device_secret:
            raise ConnectionError("Critical events remain queued until device HTTP ingestion is configured")
        path = f"/v1/devices/{self.bot_id}/messages"
        raw, timestamp = _json(payload), str(int(time.time()))
        signature = hmac.new(self.device_secret.encode(), f"{timestamp}.POST.{path}.".encode() + raw, hashlib.sha256).hexdigest()
        request = Request(self.api_url + path, data=raw, method="POST", headers={
            "Content-Type": "application/json", "X-Device-Timestamp": timestamp,
            "X-Device-Signature": signature,
        })
        with build_opener(_NoRedirect()).open(request, timeout=5) as response:
            return json.loads(response.read(65537))

    def _queue(self, payload: dict) -> None:
        self._validate(payload)
        with self._lock:
            self._db.execute("insert or ignore into critical_queue(id,payload) values (?,?)",
                             (payload["message_id"], _json(payload).decode()))
            self._db.commit()

    def flush_events(self) -> int:
        """Remove queued data only after a matching durable application receipt."""
        delivered = 0
        with self._lock:
            rows = self._db.execute("select id,payload from critical_queue order by rowid").fetchall()
            for message_id, raw in rows:
                receipt = self._http(json.loads(raw))
                if receipt.get("stored") is not True or receipt.get("message_id") != message_id:
                    raise ConnectionError("Missing matching durable device receipt; event remains queued")
                if receipt.get("reconciliation_required") is True:
                    self._db.execute("insert or ignore into reconciliations(id,payload,receipt) values (?,?,?)",
                                     (message_id, raw, _json(receipt).decode()))
                self._db.execute("delete from critical_queue where id=?", (message_id,))
                self._db.commit()
                delivered += 1
                if receipt.get("reconciliation_required") is True and self.on_reconciliation:
                    self.on_reconciliation({"message_id": message_id, "payload": json.loads(raw), "receipt": receipt})
        return delivered

    @property
    def pending_events(self) -> int:
        with self._lock:
            return self._db.execute("select count(*) from critical_queue").fetchone()[0]

    @property
    def pending_reconciliations(self) -> list[dict]:
        """Durably visible operator work; a stored observation is not applied state."""
        with self._lock:
            rows = self._db.execute("select id,payload,receipt from reconciliations where acknowledged=0 order by rowid").fetchall()
            return [{"message_id": row[0], "payload": json.loads(row[1]), "receipt": json.loads(row[2])} for row in rows]

    def acknowledge_reconciliation(self, message_id: str) -> None:
        """Bookkeeping only; never changes an order, command, or physical guard."""
        with self._lock:
            self._db.execute("update reconciliations set acknowledged=1 where id=?", (_uuid(message_id),))
            self._db.commit()

    def _event(self, event_type: str, order_id: str, compartment: int, **fields) -> str:
        payload = {**self._base("event"), "event_type": event_type,
                   "observed_at": self._base("event")["sent_at"],
                   "order_id": _uuid(order_id), "compartment": compartment, **fields}
        self._queue(payload)
        return payload["message_id"]

    def report_loaded(self, order_id: str, compartment: int, *, outer_closed: bool,
                      inner_closed: bool, is_empty: bool) -> str:
        if any(type(value) is not bool for value in (outer_closed, inner_closed, is_empty)):
            raise ValueError("Explicit physical sensor observations are required")
        if not outer_closed or not inner_closed or is_empty:
            raise ValueError("Loaded report requires closed lids and a confirmed parcel")
        return self._event("parcel_loaded", order_id, compartment,
                           outer_closed=outer_closed, inner_closed=inner_closed, is_empty=is_empty)

    def report_arrived(self, order_id: str, compartment: int) -> str:
        return self._event("arrived", order_id, compartment)

    def report_lid_event(self, order_id: str, compartment: int, *, lid: Literal["outer", "inner"],
                         closed: bool, command_id: str | None = None,
                         is_empty: bool | None = None) -> str:
        if lid not in {"outer", "inner"} or type(closed) is not bool:
            raise ValueError("Explicit outer/inner lid and boolean sensor observation required")
        fields = {f"{lid}_closed": closed}
        if is_empty is not None:
            if type(is_empty) is not bool:
                raise ValueError("is_empty must be a physical boolean observation")
            fields["is_empty"] = is_empty
        if command_id is not None:
            fields["command_id"] = _uuid(command_id)
        return self._event(f"{lid}_lid_{'closed' if closed else 'opened'}", order_id, compartment, **fields)

    def report_telemetry(self, *, current_lat: float | None, current_lng: float | None,
                         battery_level: float, compartments: list[dict], clock_synchronized: bool) -> str:
        with self._lock:
            payload = {**self._base("telemetry"), "boot_id": self.boot_id, "sequence": self._sequence,
                       "observed_at": self._base("telemetry")["sent_at"],
                       "current_lat": current_lat, "current_lng": current_lng, "battery_level": battery_level,
                       "compartments": compartments, "clock_synchronized": clock_synchronized}
            self._validate(payload)
            self._sequence += 1
        if self._client and self._connected:
            info = self._client.publish(self.base_topic + "/telemetry", _json(payload), qos=0, retain=False)
            if info.rc != mqtt.MQTT_ERR_SUCCESS:
                raise ConnectionError("Telemetry publication was not accepted")
        else:
            receipt = self._http(payload)
            if receipt.get("stored") is not True or receipt.get("message_id") != payload["message_id"]:
                raise ConnectionError("Telemetry ingestion not confirmed")
        return payload["message_id"]

    def _ack(self, payload: dict, result: str, reason: str | None = None) -> None:
        ack = {**self._base("ack"), "command_id": payload["message_id"],
               "order_id": payload["order_id"], "compartment": payload["compartment"], "result": result}
        if reason:
            ack["reason"] = reason
        self._queue(ack)

    def process_command(self, topic: str, raw: bytes, *, retained: bool = False) -> Decision:
        """Safe command entry point; callback execution requires every local check."""
        if len(raw) > 16384 or topic != self.base_topic + "/commands":
            return Decision(None, "rejected", "wrong_assignment")
        try:
            payload = json.loads(raw, object_pairs_hook=_unique_object)
            self._validate(payload)
            if payload["message_type"] != "command" or payload["bot_id"] != self.bot_id:
                raise ValueError("Wrong command identity")
            command = Command(payload["message_id"], payload["bot_id"], payload["order_id"],
                              payload["compartment"], payload["command"],
                              _time(payload["issued_at"]), _time(payload["expires_at"]))
        except Exception:
            return Decision(None, "rejected", "invalid_state")
        reason = None
        now = self._now().astimezone(timezone.utc)
        ttl = (command.expires_at - command.issued_at).total_seconds()
        if retained:
            reason = "retained"
        elif not 0 < ttl <= 10 or now >= command.expires_at:
            reason = "expired"
        elif (command.issued_at - now).total_seconds() > 2:
            reason = "future_timestamp"
        else:
            try:
                if self.clock_synchronized is None or self.clock_synchronized() is not True:
                    reason = "clock_unsynchronized"
                elif self.guard is None or self.on_unlock is None or self.guard(command) is not True:
                    reason = "invalid_state"
            except Exception:
                reason = "invalid_state"
        digest = hashlib.sha256(_json(payload)).hexdigest()
        with self._lock:
            previous = self._db.execute("select digest,payload,result,reason from commands where id=?", (command.command_id,)).fetchone()
            if previous:
                if previous[0] != digest:
                    return Decision(command.command_id, "rejected", "wrong_assignment")
                original = json.loads(previous[1])
                self._ack(original, previous[2], previous[3])
                return Decision(command.command_id, previous[2], previous[3])
            result = "rejected" if reason else "accepted"
            self._db.execute("insert into commands(id,digest,payload,result,reason) values (?,?,?,?,?)",
                             (command.command_id, digest, _json(payload).decode(), result, reason))
            self._db.commit()  # Intent is durable BEFORE the callback can affect hardware.
            self._ack(payload, result, reason)
            if reason:
                return Decision(command.command_id, result, reason)
            try:
                # Queueing an accepted ack must never delay an expired physical action.
                if self._now().astimezone(timezone.utc) >= command.expires_at:
                    raise TimeoutError()
                outcome = self.on_unlock(command)
                if outcome is True:
                    result, reason = "executed", None
                elif outcome is False:
                    result, reason = "rejected", "actuator_failed"
                else:
                    return Decision(command.command_id, "accepted")
            except TimeoutError:
                result, reason = "rejected", "expired"
            except Exception:
                result, reason = "rejected", "execution_uncertain"
            self._db.execute("update commands set result=?,reason=? where id=?", (result, reason, command.command_id))
            self._db.commit()
            self._ack(payload, result, reason)
            return Decision(command.command_id, result, reason)

    def confirm_command_execution(self, command_id: str) -> None:
        """Call only on actual hardware confirmation after an asynchronous callback."""
        with self._lock:
            row = self._db.execute("select payload,result from commands where id=?", (_uuid(command_id),)).fetchone()
            if row is None or row[1] != "accepted":
                raise ValueError("No pending locally accepted command to confirm")
            self._db.execute("update commands set result='executed',reason=null where id=?", (command_id,))
            self._db.commit()
            self._ack(json.loads(row[0]), "executed")

    @property
    def connected(self) -> bool:
        return self._connected

    def connect(self) -> None:
        if not self.broker or not self.broker.host or not self.broker.username or not self.broker.password:
            raise ValueError("Provisioned per-device MQTT credentials are required")
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="bot-" + self.bot_id, protocol=mqtt.MQTTv5)
        context = ssl.create_default_context(cafile=self.broker.ca_file)
        context.minimum_version = ssl.TLSVersion.TLSv1_2
        client.tls_set_context(context)
        client.username_pw_set(self.broker.username, self.broker.password)
        client.reconnect_delay_set(1, 30)
        client.max_queued_messages_set(100)
        will = {**self._base("availability"), "boot_id": self.boot_id, "online": False}
        self._validate(will)
        client.will_set(self.base_topic + "/availability", _json(will), qos=1, retain=True)
        def connected(mqtt_client, userdata, flags, reason_code, properties):
            self._connected = not reason_code.is_failure
            if self._connected:
                mqtt_client.subscribe(self.base_topic + "/commands", options=SubscribeOptions(qos=1, retainAsPublished=True, retainHandling=2))
                online = {**self._base("availability"), "boot_id": self.boot_id, "online": True}
                self._validate(online)
                mqtt_client.publish(self.base_topic + "/availability", _json(online), qos=1, retain=True)
        def disconnected(mqtt_client, userdata, flags, reason_code, properties):
            self._connected = False
        def message(mqtt_client, userdata, incoming):
            try:
                self._commands.put_nowait((incoming.topic, incoming.payload, incoming.retain))
            except queue.Full:
                pass  # Saturation refuses additional physical actions.
        client.on_connect, client.on_disconnect, client.on_message = connected, disconnected, message
        self._client = client
        props = Properties(PacketTypes.CONNECT)
        props.SessionExpiryInterval = 0
        client.connect(self.broker.host, self.broker.port, keepalive=15, clean_start=True, properties=props)
        self._worker = threading.Thread(target=self._work, daemon=True, name="hostelxpress-link")
        self._worker.start()
        client.loop_start()

    def _work(self):
        while not self._stop.is_set():
            try:
                topic, payload, retained = self._commands.get(timeout=1)
                self.process_command(topic, payload, retained=retained)
            except queue.Empty:
                pass
            try:
                self.flush_events()
            except Exception:
                pass  # Durable queue remains; caller can inspect pending_events/flush_events.

    def close(self):
        self._stop.set()
        if self._client:
            self._client.disconnect()
            self._client.loop_stop()
        if self._worker:
            self._worker.join(timeout=6)
            if self._worker.is_alive():
                raise RuntimeError("A hardware callback has not stopped; keep the ledger open until it returns")
        with self._lock:
            self._db.close()
            fcntl.flock(self._lockfile, fcntl.LOCK_UN)
            self._lockfile.close()
