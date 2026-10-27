#!/usr/bin/env python3
"""Validate the hardware/server MQTT contract on Linux without a broker."""

from __future__ import annotations

import copy
import json
from pathlib import Path
import re
import sys
import unittest

from jsonschema import Draft202012Validator, FormatChecker


if sys.platform != "linux":
    raise SystemExit("Run Phase 0 validation inside Linux; Windows execution is unsupported.")

ROOT = Path(__file__).resolve().parents[1]
BOT_ID = "00000000-0000-4000-8000-000000000001"
ORDER_ID = "00000000-0000-4000-8000-000000000201"
COMMAND_ID = "00000000-0000-4000-8000-000000000101"
BOOT_ID = "00000000-0000-4000-8000-000000000301"
INCIDENT_ID = "00000000-0000-4000-8000-000000000401"
NOW = "2026-10-26T12:00:00Z"


def unique_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    """JSON silently accepts duplicate keys by default; the contract must not."""
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Duplicate JSON key: {key}")
        result[key] = value
    return result


def base(message_type: str) -> dict[str, object]:
    return {
        "schema_version": 1,
        "message_type": message_type,
        "message_id": COMMAND_ID,
        "bot_id": BOT_ID,
        "sent_at": NOW,
    }


def fixtures() -> dict[str, dict[str, object]]:
    return {
        "command": {
            **base("command"),
            "issued_at": NOW,
            "expires_at": "2026-10-26T12:00:10Z",
            "order_id": ORDER_ID,
            "command": "unlock_inner",
            "compartment": 1,
        },
        "telemetry": {
            **base("telemetry"),
            "boot_id": BOOT_ID,
            "sequence": 0,
            "observed_at": NOW,
            "current_lat": 28.0,
            "current_lng": 77.0,
            "battery_level": 85.5,
        },
        "state": {
            **base("state"),
            "boot_id": BOOT_ID,
            "sequence": 1,
            "observed_at": NOW,
            "status": "AT_HOSTEL",
        },
        "event": {
            **base("event"),
            "observed_at": NOW,
            "event_type": "inner_lid_closed",
            "order_id": ORDER_ID,
            "compartment": 1,
            "command_id": COMMAND_ID,
        },
        "ack": {
            **base("ack"),
            "command_id": COMMAND_ID,
            "order_id": ORDER_ID,
            "compartment": 1,
            "result": "executed",
        },
        "availability": {
            **base("availability"),
            "boot_id": BOOT_ID,
            "online": True,
        },
    }


class ContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        schema = json.loads(
            (ROOT / "contracts/mqtt/wire.schema.json").read_text(encoding="utf-8"),
            object_pairs_hook=unique_object,
        )
        Draft202012Validator.check_schema(schema)
        cls.validator = Draft202012Validator(schema, format_checker=FormatChecker())

    def setUp(self) -> None:
        self.examples = fixtures()

    def assert_valid(self, payload: object) -> None:
        errors = list(self.validator.iter_errors(payload))
        self.assertFalse(errors, "\n".join(error.message for error in errors))

    def assert_invalid(self, payload: object) -> None:
        self.assertTrue(list(self.validator.iter_errors(payload)), repr(payload))

    def test_all_six_message_types(self) -> None:
        for kind, example in self.examples.items():
            with self.subTest(message_type=kind):
                self.assert_valid(example)

    def test_documented_command_example(self) -> None:
        document = (ROOT / "docs/mqtt-contract.md").read_text(encoding="utf-8")
        blocks = re.findall(r"```json\s*\n(.*?)\n```", document, flags=re.DOTALL)
        self.assertTrue(blocks, "The contract should include an executable JSON example.")
        for block in blocks:
            self.assert_valid(json.loads(block, object_pairs_hook=unique_object))

    def test_no_fix_requires_both_coordinates_null(self) -> None:
        telemetry = self.examples["telemetry"]
        telemetry.update(current_lat=None, current_lng=None)
        self.assert_valid(telemetry)
        for key in ("current_lat", "current_lng"):
            mixed = copy.deepcopy(telemetry)
            mixed[key] = 0
            with self.subTest(missing_coordinate=key):
                self.assert_invalid(mixed)

    def test_coordinate_and_battery_bounds(self) -> None:
        for key, value in (
            ("current_lat", 90.01), ("current_lat", -90.01),
            ("current_lng", 180.01), ("current_lng", -180.01),
            ("battery_level", -1), ("battery_level", 101),
            ("battery_level", "85"),
        ):
            with self.subTest(field=key, value=value):
                invalid = copy.deepcopy(self.examples["telemetry"])
                invalid[key] = value
                self.assert_invalid(invalid)

    def test_compartment_validation(self) -> None:
        for kind in ("command", "event", "ack"):
            for value in (0, 4, 1.5, "1", True, None):
                with self.subTest(message_type=kind, compartment=value):
                    invalid = copy.deepcopy(self.examples[kind])
                    invalid["compartment"] = value
                    self.assert_invalid(invalid)

    def test_uuid_identity_validation(self) -> None:
        for value in ("bot-1", "../commands", "not-a-uuid", "00000000-0000-4000-8000-00000000000Z"):
            for kind, example in self.examples.items():
                with self.subTest(message_type=kind, bot_id=value):
                    invalid = copy.deepcopy(example)
                    invalid["bot_id"] = value
                    self.assert_invalid(invalid)

    def test_missing_envelope_fields(self) -> None:
        for kind, example in self.examples.items():
            for key in ("schema_version", "message_type", "message_id", "bot_id", "sent_at"):
                with self.subTest(message_type=kind, missing=key):
                    invalid = copy.deepcopy(example)
                    del invalid[key]
                    self.assert_invalid(invalid)

    def test_unknown_fields_and_wrong_type(self) -> None:
        for kind, example in self.examples.items():
            with self.subTest(message_type=kind):
                extra = copy.deepcopy(example)
                extra["auth_token"] = "must-never-appear-on-mqtt"
                self.assert_invalid(extra)
                wrong_type = copy.deepcopy(example)
                wrong_type["message_type"] = "unregistered_message_type"
                self.assert_invalid(wrong_type)

    def test_inner_lid_events_require_command_correlation(self) -> None:
        for event_type in ("inner_lid_opened", "inner_lid_closed"):
            invalid = copy.deepcopy(self.examples["event"])
            invalid["event_type"] = event_type
            del invalid["command_id"]
            with self.subTest(event_type=event_type):
                self.assert_invalid(invalid)

    def test_lid_event_requires_order_and_compartment(self) -> None:
        for key in ("order_id", "compartment"):
            invalid = copy.deepcopy(self.examples["event"])
            del invalid[key]
            with self.subTest(missing=key):
                self.assert_invalid(invalid)

    def test_acknowledgement_requires_correlation(self) -> None:
        invalid = copy.deepcopy(self.examples["ack"])
        del invalid["command_id"]
        self.assert_invalid(invalid)

    def test_rejected_ack_requires_known_reason(self) -> None:
        rejected = copy.deepcopy(self.examples["ack"])
        rejected["result"] = "rejected"
        self.assert_invalid(rejected)
        rejected["reason"] = "expired"
        self.assert_valid(rejected)
        rejected["reason"] = "anything"
        self.assert_invalid(rejected)
        accepted = copy.deepcopy(self.examples["ack"])
        accepted["result"] = "accepted"
        accepted["reason"] = "expired"
        self.assert_invalid(accepted)

    def test_dates_are_valid_utc_timestamps(self) -> None:
        for value in ("yesterday", "2026-02-30T12:00:00Z", "2026-10-26", "2026-10-26T12:00:00", "2026-10-26T17:30:00+05:30"):
            invalid = copy.deepcopy(self.examples["command"])
            invalid["sent_at"] = value
            with self.subTest(sent_at=value):
                self.assert_invalid(invalid)

    def test_unknown_command_or_lifecycle_rejected(self) -> None:
        command = copy.deepcopy(self.examples["command"])
        command["command"] = "drive_to_hostel"
        self.assert_invalid(command)
        state = copy.deepcopy(self.examples["state"])
        state["status"] = "FLYING"
        self.assert_invalid(state)
        state["status"] = "FAULT_MODE"
        self.assert_valid(state)

    def test_sequence_is_safe_nonnegative_integer(self) -> None:
        for value in (-1, 1.5, 9007199254740992, True):
            invalid = copy.deepcopy(self.examples["telemetry"])
            invalid["sequence"] = value
            with self.subTest(sequence=value):
                self.assert_invalid(invalid)

    def test_optional_sensor_observations_require_distinct_complete_compartments(self) -> None:
        telemetry = self.examples["telemetry"]
        sensor = {"compartment": 1, "outer_closed": True, "inner_closed": True, "is_empty": False}
        telemetry.update(clock_synchronized=True, compartments=[sensor])
        self.assert_valid(telemetry)
        for invalid_sensors in ([sensor, {**sensor, "is_empty": True}], [{"compartment": 1}],
                                [{**sensor, "compartment": 4}], [{**sensor, "is_empty": None}]):
            invalid = copy.deepcopy(telemetry)
            invalid["compartments"] = invalid_sensors
            self.assert_invalid(invalid)

    def test_evidence_result_requires_private_reference_and_hash(self) -> None:
        event = {
            **base("event"),
            "observed_at": NOW,
            "event_type": "camera_evidence_uploaded",
            "incident_id": INCIDENT_ID,
            "evidence_object_key": f"incidents/{BOT_ID}/{INCIDENT_ID}/clip.mp4",
            "evidence_sha256": "a" * 64,
        }
        self.assert_valid(event)
        for key in ("incident_id", "evidence_object_key", "evidence_sha256"):
            invalid = copy.deepcopy(event)
            del invalid[key]
            with self.subTest(missing=key):
                self.assert_invalid(invalid)
        for value in ("https://example.invalid/public.mp4", "../../secret", f"incidents/{BOT_ID}/{INCIDENT_ID}/../clip.mp4"):
            invalid = copy.deepcopy(event)
            invalid["evidence_object_key"] = value
            with self.subTest(object_key=value):
                self.assert_invalid(invalid)


if __name__ == "__main__":
    unittest.main(verbosity=2)
