"""Regression tests: /debug/raw-log-tail and /debug/status must never leak
EcoWitt device secrets or identifiers.

Proof-day incident (2026-07-09): both endpoints returned the gateway's
PASSKEY verbatim from the raw log because sanitize_debug_payload redacted
by field name and "passkey" was not in _SECRET_FIELD_NAMES. The PASSKEY is
a device-auth secret (MAC-derived, not rotatable without re-pairing), so a
leak burns it permanently. These tests seed a raw log with a PASSKEY- and
MAC-bearing entry — exactly what a real gateway upload produces — and
assert both endpoints return it fully redacted.

Run from this folder with the venv python:
    .\\.venv\\Scripts\\python.exe -m unittest test_debug_redaction
"""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import ecowitt_listener
from ecowitt_listener import app, sanitize_debug_payload

FAKE_PASSKEY = "FAKEPASSKEY0123456789ABCDEF01234"
FAKE_MAC = "AA:BB:CC:DD:EE:FF"

# Shaped like a real logged reading: full vendor payload under
# metadata.raw_payload, gateway LAN address under metadata.remote_addr.
LEAKY_READING = {
    "captured_at": "2026-07-09T08:10:02.035102+00:00",
    "source": "live",
    "vendor": "ecowitt_windows_testbench",
    "metrics": {"temp_f": 78.08, "humidity_percent": 47},
    "metadata": {
        "raw_payload": {
            "PASSKEY": FAKE_PASSKEY,
            "mac": FAKE_MAC,
            "stationtype": "GW1200B_V1.4.8",
            "model": "GW1200B",
            "temp1f": "78.08",
            "humidity1": "47",
        },
        "tent_id": "11111111-2222-3333-4444-555555555555",
        "remote_addr": "192.168.68.75",
    },
}


class SanitizerUnitTests(unittest.TestCase):
    """sanitize_debug_payload must redact PASSKEY/mac by field name."""

    def test_passkey_field_redacted_all_casings(self):
        for key in ("PASSKEY", "passkey", "Passkey"):
            out = sanitize_debug_payload({key: FAKE_PASSKEY})
            self.assertEqual(out[key], "[REDACTED]", f"{key} leaked")

    def test_mac_field_redacted(self):
        out = sanitize_debug_payload({"mac": FAKE_MAC, "MAC": FAKE_MAC})
        self.assertEqual(out["mac"], "[REDACTED]")
        self.assertEqual(out["MAC"], "[REDACTED]")

    def test_nested_payload_redacted(self):
        out = sanitize_debug_payload(LEAKY_READING)
        text = json.dumps(out)
        self.assertNotIn(FAKE_PASSKEY, text)
        self.assertNotIn(FAKE_MAC, text)
        # Non-secret vendor lineage survives sanitization.
        self.assertIn("GW1200B", text)

    def test_metrics_and_timestamps_survive(self):
        out = sanitize_debug_payload(LEAKY_READING)
        self.assertEqual(out["metrics"]["temp_f"], 78.08)
        self.assertEqual(out["captured_at"], LEAKY_READING["captured_at"])


class DebugEndpointRedactionTests(unittest.TestCase):
    """End-to-end: seed the raw log, read it back through both endpoints."""

    def setUp(self):
        self.client = app.test_client()
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        log_path = Path(self._tmp.name) / "ecowitt_raw_log.jsonl"
        log_path.write_text(
            json.dumps(LEAKY_READING) + "\n", encoding="utf-8"
        )
        patcher = mock.patch.object(ecowitt_listener, "LOG_PATH", log_path)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _get_local(self, path: str):
        return self.client.get(path, environ_overrides={"REMOTE_ADDR": "127.0.0.1"})

    def test_raw_log_tail_redacts_passkey_and_mac(self):
        resp = self._get_local("/debug/raw-log-tail")
        self.assertEqual(resp.status_code, 200)
        text = resp.get_data(as_text=True)
        self.assertNotIn(FAKE_PASSKEY, text)
        self.assertNotIn(FAKE_MAC, text)
        # The entry itself still comes back (redacted), not dropped.
        body = resp.get_json()
        self.assertEqual(body["count"], 1)
        self.assertTrue(body["entries"][0]["parsed"])

    def test_debug_status_latest_entry_redacts_passkey_and_mac(self):
        resp = self._get_local("/debug/status")
        self.assertEqual(resp.status_code, 200)
        text = resp.get_data(as_text=True)
        self.assertNotIn(FAKE_PASSKEY, text)
        self.assertNotIn(FAKE_MAC, text)
        body = resp.get_json()
        self.assertEqual(body["entry_count"], 1)
        # Operator-useful fields survive redaction.
        self.assertEqual(body["latest_captured_at"], LEAKY_READING["captured_at"])
        self.assertEqual(body["latest_metrics"]["temp_f"], 78.08)

    def test_both_endpoints_stay_local_only(self):
        for path in ("/debug/raw-log-tail", "/debug/status"):
            resp = self.client.get(
                path, environ_overrides={"REMOTE_ADDR": "192.168.68.50"}
            )
            self.assertEqual(resp.status_code, 403, path)


class ForwardStripsRemoteAddrTests(unittest.TestCase):
    """maybe_forward must not send the gateway's private LAN address."""

    def test_forwarded_metadata_has_no_remote_addr(self):
        env = {
            "VERDANT_INGEST_URL": "https://example.supabase.co/functions/v1/sensor-ingest-webhook",
            "VERDANT_BRIDGE_TOKEN": "test-bridge-token-not-a-real-vbt",
            "VERDANT_TENT_ID": "11111111-2222-3333-4444-555555555555",
        }

        class _OkResp:
            status_code = 200
            text = '{"ok":true}'

            def json(self):
                return {"ok": True}

        with mock.patch.dict("os.environ", env, clear=False):
            with mock.patch("ecowitt_listener.requests") as fake_requests:
                fake_requests.post.return_value = _OkResp()
                ecowitt_listener.maybe_forward(LEAKY_READING)
                outbound = fake_requests.post.call_args.kwargs["json"]

        self.assertNotIn("remote_addr", outbound["metadata"])
        body_text = json.dumps(outbound)
        self.assertNotIn("192.168.68.75", body_text)
        self.assertNotIn(FAKE_PASSKEY, body_text)


if __name__ == "__main__":
    unittest.main()
