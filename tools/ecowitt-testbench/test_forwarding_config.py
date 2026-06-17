"""Unit tests for forwarding readiness in ecowitt_listener.

Run from this folder with the venv python:
    .\\.venv\\Scripts\\python.exe -m unittest test_forwarding_config

Pure-function tests — no network, no Flask request context required.
"""
from __future__ import annotations

import os
import unittest
from unittest import mock

from ecowitt_listener import (
    FORWARD_STATS,
    evaluate_forwarding_readiness,
    is_valid_tent_id,
    maybe_forward,
)


VALID_TENT_UUID = "11111111-2222-3333-4444-555555555555"
INGEST_URL = "https://example.supabase.co/functions/v1/sensor-ingest-webhook"
BRIDGE_TOKEN = "test-bridge-token-not-a-real-vbt"


def _reset_stats() -> None:
    for k in (
        "attempt_count",
        "success_count",
        "failure_count",
        "blocked_count",
    ):
        FORWARD_STATS[k] = 0
    FORWARD_STATS["last_status"] = None
    FORWARD_STATS["last_at"] = None
    FORWARD_STATS["last_error"] = None


class TentIdValidationTests(unittest.TestCase):
    def test_valid_uuid_is_accepted(self):
        self.assertTrue(is_valid_tent_id(VALID_TENT_UUID))

    def test_all_zero_uuid_is_rejected(self):
        self.assertFalse(is_valid_tent_id("00000000-0000-0000-0000-000000000000"))

    def test_display_name_is_rejected(self):
        self.assertFalse(is_valid_tent_id("Flower Tent"))

    def test_demo_ids_are_rejected(self):
        for bad in ("tent-1", "demo-tent", "t1"):
            self.assertFalse(is_valid_tent_id(bad), bad)

    def test_empty_and_none_rejected(self):
        self.assertFalse(is_valid_tent_id(None))
        self.assertFalse(is_valid_tent_id(""))
        self.assertFalse(is_valid_tent_id("   "))

    def test_garbage_rejected(self):
        self.assertFalse(is_valid_tent_id("not-a-uuid"))


class ReadinessTests(unittest.TestCase):
    def test_missing_url_or_token(self):
        r = evaluate_forwarding_readiness(None, None, VALID_TENT_UUID)
        self.assertFalse(r["ready"])
        self.assertEqual(r["reason"], "no_forwarding_configured")

    def test_missing_tent_id_blocks(self):
        r = evaluate_forwarding_readiness(INGEST_URL, BRIDGE_TOKEN, None)
        self.assertFalse(r["ready"])
        self.assertEqual(r["reason"], "blocked_missing_tent_id")
        self.assertFalse(r["tent_id_configured"])

    def test_invalid_tent_id_blocks(self):
        r = evaluate_forwarding_readiness(INGEST_URL, BRIDGE_TOKEN, "Flower Tent")
        self.assertFalse(r["ready"])
        self.assertEqual(r["reason"], "blocked_invalid_tent_id")
        self.assertTrue(r["tent_id_configured"])
        self.assertFalse(r["tent_id_valid"])

    def test_valid_uuid_is_ready(self):
        r = evaluate_forwarding_readiness(INGEST_URL, BRIDGE_TOKEN, VALID_TENT_UUID)
        self.assertTrue(r["ready"])
        self.assertIsNone(r["reason"])
        self.assertTrue(r["tent_id_valid"])


class MaybeForwardTests(unittest.TestCase):
    def setUp(self):
        _reset_stats()

    def test_missing_tent_id_blocks_without_network(self):
        env = {"VERDANT_INGEST_URL": INGEST_URL, "VERDANT_BRIDGE_TOKEN": BRIDGE_TOKEN}
        with mock.patch.dict(os.environ, env, clear=False):
            os.environ.pop("VERDANT_TENT_ID", None)
            with mock.patch("ecowitt_listener.requests") as fake_requests:
                result = maybe_forward({"captured_at": "x", "metrics": {}})
                self.assertFalse(result["forwarded"])
                self.assertEqual(result["reason"], "blocked_missing_tent_id")
                fake_requests.post.assert_not_called()
        self.assertEqual(FORWARD_STATS["blocked_count"], 1)
        self.assertEqual(FORWARD_STATS["last_error"], "blocked_missing_tent_id")
        self.assertIsNone(FORWARD_STATS["last_status"])

    def test_invalid_tent_id_blocks_without_network(self):
        env = {
            "VERDANT_INGEST_URL": INGEST_URL,
            "VERDANT_BRIDGE_TOKEN": BRIDGE_TOKEN,
            "VERDANT_TENT_ID": "Flower Tent",
        }
        with mock.patch.dict(os.environ, env, clear=False):
            with mock.patch("ecowitt_listener.requests") as fake_requests:
                result = maybe_forward({"captured_at": "x", "metrics": {}})
                self.assertFalse(result["forwarded"])
                self.assertEqual(result["reason"], "blocked_invalid_tent_id")
                fake_requests.post.assert_not_called()
        self.assertEqual(FORWARD_STATS["blocked_count"], 1)

    def test_valid_tent_id_includes_tent_in_payload_and_header(self):
        env = {
            "VERDANT_INGEST_URL": INGEST_URL,
            "VERDANT_BRIDGE_TOKEN": BRIDGE_TOKEN,
            "VERDANT_TENT_ID": VALID_TENT_UUID,
        }
        with mock.patch.dict(os.environ, env, clear=False):
            fake_resp = mock.Mock()
            fake_resp.status_code = 200
            with mock.patch("ecowitt_listener.requests") as fake_requests:
                fake_requests.post.return_value = fake_resp
                result = maybe_forward(
                    {
                        "captured_at": "x",
                        "metrics": {"temp_f": 70.0},
                        "metadata": {"remote_addr": "192.168.1.10"},
                    }
                )
                self.assertTrue(result["forwarded"])
                self.assertEqual(result["status_code"], 200)
                fake_requests.post.assert_called_once()
                kwargs = fake_requests.post.call_args.kwargs
                sent_payload = kwargs["json"]
                sent_headers = kwargs["headers"]
                # top-level tent_id required by ingest webhook
                self.assertEqual(sent_payload["tent_id"], VALID_TENT_UUID)
                # mirrored in metadata for audit
                self.assertEqual(sent_payload["metadata"]["tent_id"], VALID_TENT_UUID)
                # header echoes the configured tent
                self.assertEqual(sent_headers["x-verdant-tent-id"], VALID_TENT_UUID)
                # Authorization preserved
                self.assertTrue(sent_headers["Authorization"].startswith("Bearer "))

    def test_no_url_or_token_is_silent_noop(self):
        env_no = {k: v for k, v in os.environ.items()
                  if k not in {"VERDANT_INGEST_URL", "VERDANT_BRIDGE_TOKEN", "VERDANT_TENT_ID"}}
        with mock.patch.dict(os.environ, env_no, clear=True):
            result = maybe_forward({"captured_at": "x", "metrics": {}})
            self.assertFalse(result["forwarded"])
            self.assertEqual(result["reason"], "no_forwarding_configured")
        # Silent no-op: not counted as a "blocked" forward.
        self.assertEqual(FORWARD_STATS["blocked_count"], 0)


if __name__ == "__main__":
    unittest.main()
