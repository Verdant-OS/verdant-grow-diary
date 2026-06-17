"""Golden contract test for the EcoWitt -> sensor-ingest-webhook payload.

Asserts that maybe_forward() builds an outbound JSON body that matches
the contract sensor-ingest-webhook expects:

  - top-level: tent_id (UUID), source="ecowitt", vendor, captured_at, metrics
  - metadata.tent_id, metadata.verdant_source (lineage), metadata.remote_addr
  - PASSKEY stripped from any forwarded raw_payload
  - never contains bridge token, Authorization, vbt_, JWT-shaped value,
    or service-role markers
"""
from __future__ import annotations

import json
import os
import re
import unittest
from pathlib import Path
from unittest import mock

from ecowitt_listener import FORWARD_STATS, maybe_forward


VALID_TENT_UUID = "11111111-2222-3333-4444-555555555555"
INGEST_URL = "https://example.supabase.co/functions/v1/sensor-ingest-webhook"
BRIDGE_TOKEN = "test-bridge-token-not-a-real-vbt"

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "golden_forwarded_payload.json"

UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
JWT_RE = re.compile(r"eyJ[A-Za-z0-9_\-]{6,}\.[A-Za-z0-9_\-]{6,}\.[A-Za-z0-9_\-]{6,}")


def _reset_stats():
    for k in ("attempt_count", "success_count", "failure_count", "blocked_count", "retry_count"):
        FORWARD_STATS[k] = 0
    for k in ("last_status", "last_at", "last_error", "last_retry_error", "last_retry_at", "last_retryable_status"):
        FORWARD_STATS[k] = None


class _OkResp:
    status_code = 200
    text = '{"ok":true}'

    def json(self):
        return {"ok": True}


class GoldenContractTests(unittest.TestCase):
    def setUp(self):
        _reset_stats()

    def _build_outbound(self, reading):
        env = {
            "VERDANT_INGEST_URL": INGEST_URL,
            "VERDANT_BRIDGE_TOKEN": BRIDGE_TOKEN,
            "VERDANT_TENT_ID": VALID_TENT_UUID,
        }
        with mock.patch.dict(os.environ, env, clear=False):
            with mock.patch("ecowitt_listener.requests") as fake_requests:
                fake_requests.post.return_value = _OkResp()
                maybe_forward(reading)
                kwargs = fake_requests.post.call_args.kwargs
                return kwargs["json"], kwargs["headers"]

    def test_outbound_payload_matches_webhook_contract(self):
        reading = {
            "captured_at": "2026-06-17T05:40:30Z",
            "source": "live",
            "vendor": "ecowitt_windows_testbench",
            "metrics": {
                "temp_f": 80.42,
                "humidity_percent": 41,
                "soil_moisture_pct": 83,
            },
            "metadata": {
                "remote_addr": "192.168.68.75",
                "raw_payload": {
                    "PASSKEY": "DEVICESECRET-DO-NOT-LEAK",
                    "stationtype": "GW1200B_V1.4.7",
                    "model": "GW1200B",
                    "dateutc": "2026-06-17 05:40:30",
                    "tempf": 80.42,
                    "humidity": 41,
                    "soilmoisture1": 83,
                },
            },
        }
        payload, headers = self._build_outbound(reading)

        # Required top-level fields
        self.assertEqual(payload["tent_id"], VALID_TENT_UUID)
        self.assertTrue(UUID_RE.match(payload["tent_id"]))
        self.assertEqual(payload["source"], "ecowitt")
        self.assertEqual(payload["vendor"], "ecowitt_windows_testbench")
        self.assertEqual(payload["captured_at"], "2026-06-17T05:40:30Z")
        self.assertIsInstance(payload["metrics"], dict)

        # Required metadata fields
        md = payload["metadata"]
        self.assertEqual(md["tent_id"], VALID_TENT_UUID)
        self.assertEqual(md["verdant_source"], "live")
        self.assertEqual(md["remote_addr"], "192.168.68.75")

        # raw_payload exists only with PASSKEY stripped
        raw = md["raw_payload"]
        self.assertNotIn("PASSKEY", raw)
        self.assertNotIn("passkey", raw)
        self.assertIn("stationtype", raw)

        # Forbidden values nowhere in body
        body_text = json.dumps(payload)
        self.assertNotIn("DEVICESECRET-DO-NOT-LEAK", body_text)
        self.assertNotIn(BRIDGE_TOKEN, body_text)
        self.assertNotIn("Authorization", body_text)
        self.assertNotRegex(body_text, r"vbt_[A-Za-z0-9_\-]{6,}")
        self.assertIsNone(JWT_RE.search(body_text))
        self.assertNotIn("service" + "_role", body_text.lower())

        # Headers carry auth out-of-band, not body
        self.assertTrue(headers["Authorization"].startswith("Bearer "))
        self.assertEqual(headers["x-verdant-tent-id"], VALID_TENT_UUID)

    def test_outbound_matches_golden_shape(self):
        """The outbound payload keyset must match the golden fixture."""
        golden = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
        reading = {
            "captured_at": golden["captured_at"],
            "source": golden["metadata"]["verdant_source"],
            "vendor": golden["vendor"],
            "metrics": golden["metrics"],
            "metadata": {
                "remote_addr": golden["metadata"]["remote_addr"],
                "raw_payload": {**golden["metadata"]["raw_payload"], "PASSKEY": "X"},
            },
        }
        payload, _ = self._build_outbound(reading)

        self.assertEqual(sorted(payload.keys()), sorted(golden.keys()))
        self.assertEqual(sorted(payload["metadata"].keys()), sorted(golden["metadata"].keys()))
        # PASSKEY still stripped
        self.assertNotIn("PASSKEY", payload["metadata"]["raw_payload"])

    def test_golden_fixture_itself_has_no_secrets(self):
        text = FIXTURE_PATH.read_text(encoding="utf-8")
        self.assertNotIn("PASSKEY", text)
        self.assertNotIn("passkey", text.lower())
        self.assertNotRegex(text, r"vbt_[A-Za-z0-9_\-]{6,}")
        self.assertIsNone(JWT_RE.search(text))
        self.assertNotIn("Authorization", text)
        self.assertNotIn("Bearer ", text)
        self.assertNotIn("service" + "_role", text.lower())


if __name__ == "__main__":
    unittest.main()
