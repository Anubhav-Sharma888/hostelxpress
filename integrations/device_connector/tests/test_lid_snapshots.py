"""Full physical lid snapshots through the public connector API."""
import tempfile
import unittest
from pathlib import Path
from test_link import BOT, ORDER, NOW, VALIDATOR
from uuid import uuid4
from hostelxpress_link import HostelxpressLink


class LidSnapshotTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.received=[]
        def sender(payload):
            VALIDATOR.validate(payload)
            self.received.append(payload)
            return {"stored":True,"duplicate":False,"message_id":payload["message_id"]}
        self.link=HostelxpressLink(BOT,Path(self.temp.name)/"ledger.sqlite3",
            http_sender=sender,now=lambda:NOW)

    def tearDown(self):
        self.link.close()
        self.temp.cleanup()

    def test_complete_lid_snapshot_is_transmitted(self):
        self.link.report_lid_event(ORDER,2,lid="inner",closed=True,command_id=str(uuid4()),
            outer_closed=True,inner_closed=True,is_empty=True)
        self.link.flush_events()
        payload=self.received[-1]
        self.assertIs(payload["outer_closed"],True)
        self.assertIs(payload["inner_closed"],True)
        self.assertIs(payload["is_empty"],True)

    def test_partial_lid_snapshot_remains_supported(self):
        self.link.report_lid_event(ORDER,2,lid="inner",closed=True,command_id=str(uuid4()),is_empty=True)
        self.link.flush_events()
        self.assertNotIn("outer_closed",self.received[-1])

    def test_explicit_snapshot_values_are_boolean_and_agree_with_event(self):
        for kwargs in ({"outer_closed":1},{"inner_closed":"true"},{"inner_closed":False}):
            with self.subTest(kwargs=kwargs):
                with self.assertRaises(ValueError):
                    self.link.report_lid_event(ORDER,2,lid="inner",closed=True,command_id=str(uuid4()),**kwargs)
        self.assertEqual(self.link.pending_events,0)
