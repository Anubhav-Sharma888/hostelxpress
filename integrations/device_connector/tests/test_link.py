from __future__ import annotations

import json
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from jsonschema import Draft202012Validator, FormatChecker
from hostelxpress_link import HostelxpressLink

ROOT = Path(__file__).resolve().parents[3]
SCHEMA = json.loads((ROOT / "contracts/mqtt/wire.schema.json").read_text())
VALIDATOR = Draft202012Validator(SCHEMA, format_checker=FormatChecker())
BOT = "00000000-0000-4000-8000-000000000001"
ORDER = "00000000-0000-4000-8000-000000000201"
NOW = datetime(2026, 10, 27, 12, 0, 0, tzinfo=timezone.utc)


def command(**updates):
    payload = {"schema_version": 1, "message_type": "command", "message_id": str(uuid4()),
               "bot_id": BOT, "sent_at": NOW.isoformat().replace("+00:00", "Z"),
               "issued_at": NOW.isoformat().replace("+00:00", "Z"),
               "expires_at": (NOW + timedelta(seconds=10)).isoformat().replace("+00:00", "Z"),
               "order_id": ORDER, "command": "unlock_inner", "compartment": 1}
    payload.update(updates)
    return payload


class LinkTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "ledger.sqlite3"
        self.calls, self.received = [], []
        def sender(payload):
            VALIDATOR.validate(payload)
            self.received.append(payload)
            return {"stored": True, "message_id": payload["message_id"], "duplicate": False}
        self.sender = sender
        self.links = []

    def tearDown(self):
        for link in self.links:
            link.close()
        self.temp.cleanup()

    def link(self, **kwargs):
        defaults = {"guard": lambda item: item.order_id == ORDER and item.compartment == 1,
                    "on_unlock": lambda item: self.calls.append(item.command_id) or True,
                    "clock_synchronized": lambda: True, "now": lambda: NOW,
                    "http_sender": self.sender}
        defaults.update(kwargs)
        link = HostelxpressLink(BOT, self.path, **defaults)
        self.links.append(link)
        return link

    def process(self, link, payload, **kwargs):
        return link.process_command(link.base_topic + "/commands", json.dumps(payload).encode(), **kwargs)

    def test_schema_copy_matches_canonical_contract(self):
        from importlib.resources import files
        self.assertEqual(SCHEMA, json.loads(files("hostelxpress_link").joinpath("wire.schema.json").read_text()))

    def test_valid_command_executes_once_across_duplicate_and_restart(self):
        link = self.link()
        payload = command()
        self.assertEqual(self.process(link, payload).result, "executed")
        self.assertEqual(self.process(link, payload).result, "executed")
        self.assertEqual(len(self.calls), 1)
        link.close()
        self.links.remove(link)
        restarted = self.link()
        self.assertEqual(self.process(restarted, payload).result, "executed")
        self.assertEqual(len(self.calls), 1)
        restarted.flush_events()
        self.assertTrue(all(message["command_id"] == payload["message_id"] for message in self.received))

    def test_reused_id_with_changed_assignment_never_reexecutes(self):
        link = self.link()
        payload = command()
        self.process(link, payload)
        payload["compartment"] = 2
        self.assertEqual(self.process(link, payload).reason, "wrong_assignment")
        self.assertEqual(len(self.calls), 1)

    def test_no_callback_or_guard_or_clock_refuses_action(self):
        for missing in ("on_unlock", "guard", "clock_synchronized"):
            with self.subTest(missing=missing):
                link = self.link(**{missing: None})
                self.assertEqual(self.process(link, command()).result, "rejected")
                link.close()
                self.links.remove(link)
        self.assertEqual(self.calls, [])

    def test_unsafe_guard_unknown_clock_and_wrong_assignment_refuse(self):
        for overrides in ({"guard": lambda item: False}, {"clock_synchronized": lambda: False}):
            link = self.link(**overrides)
            self.assertEqual(self.process(link, command()).result, "rejected")
            link.close()
            self.links.remove(link)
        link = self.link()
        self.assertEqual(self.process(link, command(order_id=str(uuid4()))).result, "rejected")
        self.assertEqual(self.calls, [])

    def test_expired_future_or_excessive_ttl_refuses(self):
        link = self.link()
        cases = [command(expires_at=(NOW-timedelta(seconds=1)).isoformat().replace("+00:00", "Z")),
                 command(expires_at=(NOW+timedelta(seconds=11)).isoformat().replace("+00:00", "Z")),
                 command(issued_at=(NOW+timedelta(seconds=3)).isoformat().replace("+00:00", "Z"),
                         expires_at=(NOW+timedelta(seconds=10)).isoformat().replace("+00:00", "Z"))]
        for payload in cases:
            self.assertEqual(self.process(link, payload).result, "rejected")
        self.assertEqual(self.calls, [])

    def test_retained_wrong_topic_malformed_and_unknown_fields_refuse(self):
        link = self.link()
        self.assertEqual(self.process(link, command(), retained=True).reason, "retained")
        self.assertEqual(link.process_command("hostelxpress/v1/bots/other/commands", b"{}").result, "rejected")
        self.assertEqual(link.process_command(link.base_topic + "/commands", b"invalid").result, "rejected")
        self.assertEqual(self.process(link, command(auth_token="never")).result, "rejected")
        self.assertEqual(self.calls, [])

    def test_async_uncertain_intent_is_not_replayed_after_crash(self):
        link = self.link(on_unlock=lambda item: self.calls.append(item.command_id))
        payload = command()
        self.assertEqual(self.process(link, payload).result, "accepted")
        link.close()
        self.links.remove(link)
        restarted = self.link()
        result = self.process(restarted, payload)
        self.assertEqual((result.result, result.reason), ("rejected", "execution_uncertain"))
        self.assertEqual(len(self.calls), 1)

    def test_callback_exception_never_causes_retry_actuation(self):
        def failing(item):
            self.calls.append(item.command_id)
            raise RuntimeError("Physical result unknown")
        link = self.link(on_unlock=failing)
        payload = command()
        self.assertEqual(self.process(link, payload).reason, "execution_uncertain")
        self.process(link, payload)
        self.assertEqual(len(self.calls), 1)

    def test_async_execution_confirmation_is_explicit(self):
        link = self.link(on_unlock=lambda item: None)
        payload = command()
        self.process(link, payload)
        link.confirm_command_execution(payload["message_id"])
        link.flush_events()
        self.assertEqual([p["result"] for p in self.received], ["accepted", "executed"])
        with self.assertRaises(ValueError):
            link.confirm_command_execution(str(uuid4()))

    def test_critical_queue_waits_for_matching_durable_receipt(self):
        link = self.link(http_sender=lambda payload: {"stored": True, "message_id": str(uuid4())})
        link.report_arrived(ORDER, 1)
        self.assertEqual(link.pending_events, 1)
        with self.assertRaises(ConnectionError):
            link.flush_events()
        self.assertEqual(link.pending_events, 1)
        link._http_sender = self.sender
        self.assertEqual(link.flush_events(), 1)
        self.assertEqual(link.pending_events, 0)

    def test_reconciliation_receipt_is_persisted_and_visible_after_restart(self):
        callbacks = []
        link = self.link(http_sender=lambda payload: {"stored": True, "message_id": payload["message_id"],
                                                       "duplicate": False, "reconciliation_required": True},
                         on_reconciliation=callbacks.append)
        message_id = link.report_arrived(ORDER, 1)
        self.assertEqual(link.flush_events(), 1)
        self.assertEqual(link.pending_events, 0)
        self.assertEqual(len(callbacks), 1)
        link.close()
        self.links.remove(link)
        restarted = self.link()
        self.assertEqual(restarted.pending_reconciliations[0]["message_id"], message_id)
        restarted.acknowledge_reconciliation(message_id)
        self.assertEqual(restarted.pending_reconciliations, [])

    def test_all_report_payloads_match_canonical_schema(self):
        link = self.link()
        link.report_telemetry(current_lat=None, current_lng=None, battery_level=80,
                              compartments=[{"compartment": 1, "outer_closed": True, "inner_closed": True, "is_empty": False}],
                              clock_synchronized=True)
        link.report_loaded(ORDER, 1, outer_closed=True, inner_closed=True, is_empty=False)
        link.report_arrived(ORDER, 1)
        link.report_lid_event(ORDER, 1, lid="outer", closed=True)
        link.report_lid_event(ORDER, 1, lid="inner", closed=True, command_id=str(uuid4()), is_empty=True)
        link.flush_events()
        self.assertEqual(len(self.received), 5)
        for payload in self.received:
            VALIDATOR.validate(payload)

    def test_sensor_reports_do_not_manufacture_safe_defaults(self):
        link = self.link()
        with self.assertRaises(ValueError):
            link.report_loaded(ORDER, 1, outer_closed=False, inner_closed=True, is_empty=False)
        with self.assertRaises(Exception):
            link.report_telemetry(current_lat=None, current_lng=10, battery_level=80,
                                  compartments=[], clock_synchronized=False)
        sensor = {"compartment": 1, "outer_closed": True, "inner_closed": True, "is_empty": True}
        with self.assertRaises(Exception):
            link.report_telemetry(current_lat=None, current_lng=None, battery_level=80,
                                  compartments=[sensor, {**sensor, "is_empty": False}], clock_synchronized=True)
        self.assertEqual(link.pending_events, 0)

    def test_one_process_owns_ledger(self):
        self.link()
        with self.assertRaises(RuntimeError):
            HostelxpressLink(BOT, self.path)

    def test_signed_http_request_does_not_follow_redirects(self):
        requests_seen = []
        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                requests_seen.append(self.path)
                self.rfile.read(int(self.headers.get("Content-Length", "0")))
                self.send_response(302)
                self.send_header("Location", "/must-not-receive-credentials")
                self.end_headers()
            def do_GET(self):
                requests_seen.append(self.path)
                self.send_response(200)
                self.end_headers()
            def log_message(self, *args):
                pass
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            link = self.link(http_sender=None, api_url=f"http://127.0.0.1:{server.server_port}",
                             device_secret="local-qa-secret-" * 3, allow_loopback_http=True)
            link.report_arrived(ORDER, 1)
            with self.assertRaises(HTTPError):
                link.flush_events()
            self.assertEqual(len(requests_seen), 1)
            self.assertEqual(link.pending_events, 1)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_insecure_nonlocal_http_is_rejected(self):
        with self.assertRaises(ValueError):
            HostelxpressLink(BOT, self.path, api_url="http://example.invalid", device_secret="a"*40,
                            allow_loopback_http=True)


if __name__ == "__main__":
    unittest.main(verbosity=2)
