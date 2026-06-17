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
    MAX_RETRY_ATTEMPTS,
    RETRYABLE_STATUSES,
    WEBHOOK_TRANSPORT_SOURCE,
    app,
    compute_backoff_delay,
    evaluate_forwarding_readiness,
    is_retryable_status,
    is_valid_tent_id,
    maybe_forward,
    sanitize_forward_error_value,
    summarize_forward_response,
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
        "retry_count",
    ):
        FORWARD_STATS[k] = 0
    FORWARD_STATS["last_status"] = None
    FORWARD_STATS["last_at"] = None
    FORWARD_STATS["last_error"] = None
    FORWARD_STATS["last_retry_error"] = None
    FORWARD_STATS["last_retry_at"] = None
    FORWARD_STATS["last_retryable_status"] = None
    FORWARD_STATS["last_forward_response_error"] = None
    FORWARD_STATS["last_forward_response_classification"] = None
    FORWARD_STATS["last_forward_response_message"] = None


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
class _FakeResp:
    def __init__(self, status_code, json_body=None, text=""):
        self.status_code = status_code
        self._json = json_body
        self.text = text

    def json(self):
        if self._json is None:
            raise ValueError("no json")
        return self._json


def _full_env(**extra):
    env = {
        "VERDANT_INGEST_URL": INGEST_URL,
        "VERDANT_BRIDGE_TOKEN": BRIDGE_TOKEN,
        "VERDANT_TENT_ID": VALID_TENT_UUID,
    }
    env.update(extra)
    return env


class ForwardedPayloadContractTests(unittest.TestCase):
    def setUp(self):
        _reset_stats()

    def _send(self, reading):
        with mock.patch.dict(os.environ, _full_env(), clear=False):
            with mock.patch("ecowitt_listener.requests") as fake_requests:
                fake_requests.post.return_value = _FakeResp(200, {"ok": True})
                result = maybe_forward(reading)
                kwargs = fake_requests.post.call_args.kwargs
                return result, kwargs

    def test_forwarded_payload_uses_webhook_transport_source_not_verdant_live(self):
        reading = {
            "captured_at": "2026-06-17T05:40:30Z",
            "source": "live",
            "vendor": "ecowitt_windows_testbench",
            "metrics": {"temp_f": 80.0},
            "metadata": {"raw_payload": {"tempf": 80.0}},
        }
        _, kwargs = self._send(reading)
        payload = kwargs["json"]
        # webhook contract requires WEBHOOK_ALLOWED_SOURCES; "live" is rejected
        self.assertEqual(payload["source"], WEBHOOK_TRANSPORT_SOURCE)
        self.assertEqual(payload["vendor"], "ecowitt_windows_testbench")
        self.assertEqual(payload["captured_at"], "2026-06-17T05:40:30Z")
        self.assertEqual(payload["metrics"], {"temp_f": 80.0})
        self.assertEqual(payload["tent_id"], VALID_TENT_UUID)
        # Verdant local source label preserved as lineage, never sent as `source`
        self.assertEqual(payload["metadata"]["verdant_source"], "live")

    def test_passkey_is_stripped_from_forwarded_raw_payload(self):
        reading = {
            "captured_at": "2026-06-17T05:40:30Z",
            "source": "live",
            "metrics": {"temp_f": 70.0},
            "metadata": {
                "raw_payload": {
                    "PASSKEY": "SECRETDEVICEAUTH123",
                    "passkey": "alt-secret",
                    "tempf": 70.0,
                    "stationtype": "GW1200B_V1.4.7",
                }
            },
        }
        _, kwargs = self._send(reading)
        payload = kwargs["json"]
        raw = payload["metadata"]["raw_payload"]
        self.assertNotIn("PASSKEY", raw)
        self.assertNotIn("passkey", raw)
        self.assertNotIn("Passkey", raw)
        self.assertIn("tempf", raw)
        self.assertIn("stationtype", raw)
        # And the literal secret string must not appear anywhere in the body
        import json as _json
        body_text = _json.dumps(payload)
        self.assertNotIn("SECRETDEVICEAUTH123", body_text)
        self.assertNotIn("alt-secret", body_text)


class ForwardErrorSanitizationTests(unittest.TestCase):
    def setUp(self):
        _reset_stats()

    def test_400_invalid_payload_json_body_is_captured(self):
        with mock.patch.dict(os.environ, _full_env(), clear=False):
            with mock.patch("ecowitt_listener.requests") as fake_requests:
                fake_requests.post.return_value = _FakeResp(
                    400, {"error": "invalid_payload", "errors": ["tent_id required (uuid)"]}
                )
                maybe_forward({"captured_at": "x", "metrics": {"temp_f": 70.0}})
        self.assertEqual(FORWARD_STATS["last_status"], 400)
        self.assertEqual(FORWARD_STATS["last_error"], "http_400")
        self.assertEqual(
            FORWARD_STATS["last_forward_response_error"], "invalid_payload"
        )
        self.assertEqual(
            FORWARD_STATS["last_forward_response_classification"],
            "payload_shape_mismatch",
        )
        # message is sanitized
        msg = FORWARD_STATS["last_forward_response_message"]
        self.assertIsNotNone(msg)

    def test_400_with_token_like_string_is_redacted(self):
        leaky = "vbt_" + ("A" * 26)
        with mock.patch.dict(os.environ, _full_env(), clear=False):
            with mock.patch("ecowitt_listener.requests") as fake_requests:
                fake_requests.post.return_value = _FakeResp(
                    400,
                    {
                        "error": "invalid_payload",
                        "message": f"bad token {leaky} in payload",
                    },
                )
                maybe_forward({"captured_at": "x", "metrics": {"temp_f": 70.0}})
        import json as _json
        dumped = _json.dumps(FORWARD_STATS, default=str)
        self.assertNotIn(leaky, dumped)

    def test_non_json_400_body_is_summarized(self):
        with mock.patch.dict(os.environ, _full_env(), clear=False):
            with mock.patch("ecowitt_listener.requests") as fake_requests:
                fake_requests.post.return_value = _FakeResp(
                    400, json_body=None, text="<html>nginx 400</html>"
                )
                maybe_forward({"captured_at": "x", "metrics": {"temp_f": 70.0}})
        self.assertEqual(
            FORWARD_STATS["last_forward_response_error"], "non_json_response"
        )
        self.assertEqual(
            FORWARD_STATS["last_forward_response_classification"],
            "non_json_response",
        )
        msg = FORWARD_STATS["last_forward_response_message"]
        self.assertIsInstance(msg, str)
        self.assertLessEqual(len(msg), 240)

    def test_response_fields_reset_each_attempt(self):
        with mock.patch.dict(os.environ, _full_env(), clear=False):
            with mock.patch("ecowitt_listener.requests") as fake_requests:
                fake_requests.post.return_value = _FakeResp(
                    400, {"error": "invalid_payload"}
                )
                maybe_forward({"captured_at": "x", "metrics": {"temp_f": 70.0}})
                self.assertEqual(
                    FORWARD_STATS["last_forward_response_error"], "invalid_payload"
                )
                # second call succeeds — fields should clear
                fake_requests.post.return_value = _FakeResp(200, {"ok": True})
                maybe_forward({"captured_at": "x", "metrics": {"temp_f": 70.0}})
                self.assertIsNone(FORWARD_STATS["last_forward_response_error"])
                self.assertIsNone(
                    FORWARD_STATS["last_forward_response_classification"]
                )

    def test_sanitize_forward_error_value_redacts_token_like_strings(self):
        leaky = "vbt_" + ("B" * 26)
        out = sanitize_forward_error_value(leaky)
        self.assertNotEqual(out, leaky)
        jwt_like = "Bearer " + "eyJ" + "abcdefghij" + "." + "eyJ" + "abcdefghij" + ".signaturesignature"
        out2 = sanitize_forward_error_value(jwt_like)
        self.assertNotIn("eyJ", str(out2))


    def test_summarize_forward_response_known_classifications(self):
        for err, cls in [
            ("invalid_payload", "payload_shape_mismatch"),
            ("forbidden_tent", "tent_authorization_mismatch"),
            ("tent_lookup_failed", "tent_lookup_failed"),
            ("insert_failed", "storage_insert_failed"),
            ("unauthorized", "auth_failed"),
        ]:
            r = summarize_forward_response(_FakeResp(400, {"error": err}))
            self.assertEqual(r["error"], err)
            self.assertEqual(r["classification"], cls)


if __name__ == "__main__":
    unittest.main()

