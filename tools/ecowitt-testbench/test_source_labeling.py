"""Unit tests for resolve_source() in ecowitt_listener.

Run from this folder with the venv python:
    .\\.venv\\Scripts\\python.exe -m pytest test_source_labeling.py -q

Pure-function tests — no network, no Flask request context required
because resolve_source() accepts payload / remote_addr / header_mode /
env_mode as explicit arguments.
"""
from __future__ import annotations

import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

import ecowitt_listener
from ecowitt_listener import (
    ALLOWED_SOURCES,
    ECOWITT_GATEWAY_MARKERS,
    app,
    has_physical_gateway_evidence,
    looks_like_ecowitt_gateway,
    parse_ecowitt_dateutc,
    resolve_source,
    validate_ecowitt_dateutc,
)

FIXED_NOW = datetime(2026, 6, 17, 5, 45, 30, tzinfo=timezone.utc)


REAL_GATEWAY_PAYLOAD = {
    "PASSKEY": "abc123",
    "stationtype": "GW1200B_V1.4.7",
    "model": "GW1200B",
    "dateutc": "2026-06-17 05:40:30",
    "tempf": "77.4",
    "humidity": "58",
}

DEMO_BROWSER_PAYLOAD = {
    "temp1f": "77.4",
    "humidity1": "58",
    "soilmoisture1": "33",
    "co2": "721",
}


class SourceLabelingTests(unittest.TestCase):
    def setUp(self):
        patcher = mock.patch.object(ecowitt_listener, "_utc_now", return_value=FIXED_NOW)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_ecowitt_dateutc_parses_as_canonical_utc(self):
        self.assertEqual(
            parse_ecowitt_dateutc("2026-06-17 05:40:30"),
            "2026-06-17T05:40:30Z",
        )

    def test_missing_or_invalid_dateutc_fails_closed(self):
        for value in (
            None,
            "",
            "not-a-timestamp",
            "2026-02-30 05:40:30",
            "2026-6-7 5:4:3",
        ):
            self.assertIsNone(parse_ecowitt_dateutc(value), value)

    def test_dateutc_more_than_five_minutes_in_future_fails_closed(self):
        now = datetime(2026, 6, 17, 5, 40, 30, tzinfo=timezone.utc)
        self.assertEqual(
            validate_ecowitt_dateutc("2026-06-17 05:45:30", now=now),
            "2026-06-17T05:45:30Z",
        )
        self.assertIsNone(
            validate_ecowitt_dateutc("2026-06-17 05:45:31", now=now)
        )

    def test_dateutc_lookup_is_case_insensitive_for_gateway_evidence(self):
        payload = {
            "stationtype": "GW1200B_V1.4.7",
            "model": "GW1200B",
            "DATEUTC": "2026-06-17 05:40:30",
        }
        self.assertTrue(has_physical_gateway_evidence(payload, "198.51.100.75"))

    def test_lan_ecowitt_gateway_is_live(self):
        self.assertEqual(
            resolve_source(
                payload=REAL_GATEWAY_PAYLOAD,
                remote_addr="192.168.68.75",
                header_mode="",
                env_mode="",
            ),
            "live",
        )

    def test_loopback_browser_demo_is_demo(self):
        self.assertEqual(
            resolve_source(
                payload=DEMO_BROWSER_PAYLOAD,
                remote_addr="127.0.0.1",
                header_mode="",
                env_mode="",
            ),
            "demo",
        )

    def test_explicit_source_demo_remains_demo(self):
        payload = dict(REAL_GATEWAY_PAYLOAD, source="demo")
        self.assertEqual(
            resolve_source(
                payload=payload,
                remote_addr="192.168.68.75",
                header_mode="",
                env_mode="",
            ),
            "demo",
        )

    def test_unknown_source_label_is_invalid_not_live(self):
        payload = dict(REAL_GATEWAY_PAYLOAD, source="totally-unknown")
        result = resolve_source(
            payload=payload,
            remote_addr="192.168.68.75",
            header_mode="",
            env_mode="",
        )
        self.assertEqual(result, "invalid")
        self.assertNotEqual(result, "live")

    def test_spoofed_source_live_without_gateway_markers_downgrades(self):
        payload = {"temp1f": "77", "source": "live"}
        self.assertEqual(
            resolve_source(
                payload=payload,
                remote_addr="127.0.0.1",
                header_mode="",
                env_mode="",
            ),
            "demo",
        )

    def test_header_live_cannot_bypass_physical_gateway_evidence(self):
        self.assertEqual(
            resolve_source(
                payload=DEMO_BROWSER_PAYLOAD,
                remote_addr="127.0.0.1",
                header_mode="live",
                env_mode="",
            ),
            "demo",
        )

    def test_env_live_cannot_bypass_physical_gateway_evidence(self):
        self.assertEqual(
            resolve_source(
                payload=DEMO_BROWSER_PAYLOAD,
                remote_addr="127.0.0.1",
                header_mode="",
                env_mode="live",
            ),
            "demo",
        )

    def test_physical_gateway_evidence_requires_non_loopback_and_two_markers(self):
        self.assertTrue(
            has_physical_gateway_evidence(
                REAL_GATEWAY_PAYLOAD,
                "198.51.100.75",
            )
        )
        self.assertFalse(
            has_physical_gateway_evidence(
                REAL_GATEWAY_PAYLOAD,
                "127.0.0.1",
            )
        )
        self.assertFalse(
            has_physical_gateway_evidence(
                REAL_GATEWAY_PAYLOAD,
                None,
            )
        )
        self.assertFalse(
            has_physical_gateway_evidence(
                {"stationtype": "GW1200B", "tempf": "77.4"},
                "198.51.100.75",
            )
        )

    def test_gateway_shape_without_valid_dateutc_is_invalid_not_live(self):
        for dateutc in (None, "not-a-timestamp"):
            payload = dict(REAL_GATEWAY_PAYLOAD)
            if dateutc is None:
                payload.pop("dateutc")
            else:
                payload["dateutc"] = dateutc
            result = resolve_source(
                payload=payload,
                remote_addr="198.51.100.75",
                header_mode="",
                env_mode="",
            )
            self.assertEqual(result, "invalid")
            self.assertFalse(has_physical_gateway_evidence(payload, "198.51.100.75"))

    def test_header_or_payload_claim_cannot_create_physical_evidence(self):
        spoofed = dict(
            DEMO_BROWSER_PAYLOAD,
            source="live",
            physical_gateway_evidence=True,
        )
        self.assertFalse(has_physical_gateway_evidence(spoofed, "127.0.0.1"))

    def test_ipv6_mapped_loopback_is_treated_as_loopback(self):
        self.assertEqual(
            resolve_source(
                payload=REAL_GATEWAY_PAYLOAD,
                remote_addr="::ffff:127.0.0.1",
                header_mode="",
                env_mode="",
            ),
            "demo",
        )

    def test_gateway_marker_detector_requires_two_markers(self):
        self.assertFalse(looks_like_ecowitt_gateway({"stationtype": "x"}))
        self.assertFalse(
            looks_like_ecowitt_gateway({"PASSKEY": "secret", "stationtype": "x"})
        )
        self.assertTrue(looks_like_ecowitt_gateway({"stationtype": "x", "model": "y"}))

    def test_allowed_sources_set_is_canonical(self):
        self.assertEqual(
            ALLOWED_SOURCES,
            {"live", "manual", "csv", "demo", "stale", "invalid"},
        )

    def test_gateway_markers_include_expected_fields(self):
        for key in ("stationtype", "model", "dateutc", "freq"):
            self.assertIn(key, ECOWITT_GATEWAY_MARKERS)
        self.assertNotIn("passkey", ECOWITT_GATEWAY_MARKERS)


class PhysicalGatewayEvidenceStatusTests(unittest.TestCase):
    """The local status projection must expose only listener-computed proof."""

    def setUp(self):
        self.client = app.test_client()
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.log_path = Path(self._tmp.name) / "ecowitt_raw_log.jsonl"
        patcher = mock.patch.object(ecowitt_listener, "LOG_PATH", self.log_path)
        patcher.start()
        self.addCleanup(patcher.stop)
        clock_patcher = mock.patch.object(
            ecowitt_listener,
            "_utc_now",
            return_value=FIXED_NOW,
        )
        clock_patcher.start()
        self.addCleanup(clock_patcher.stop)

    def _status(self):
        return self.client.get(
            "/debug/forwarding-status",
            environ_overrides={"REMOTE_ADDR": "127.0.0.1"},
        )

    def test_real_lan_gateway_sets_physical_evidence_in_latest_metrics(self):
        response = self.client.post(
            "/ecowitt",
            json=REAL_GATEWAY_PAYLOAD,
            environ_overrides={"REMOTE_ADDR": "198.51.100.75"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()["reading"]["physical_gateway_evidence"])

        status = self._status()
        self.assertEqual(status.status_code, 200)
        latest = status.get_json()["latest_metrics"]
        self.assertEqual(latest["source"], "live")
        self.assertTrue(latest["physical_gateway_evidence"])

    def test_gateway_dateutc_becomes_forwarded_captured_at(self):
        with mock.patch.object(
            ecowitt_listener,
            "maybe_forward",
            return_value={"forwarded": True, "status_code": 200},
        ) as forward:
            response = self.client.post(
                "/ecowitt",
                json=REAL_GATEWAY_PAYLOAD,
                environ_overrides={"REMOTE_ADDR": "198.51.100.75"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json()["reading"]["captured_at"],
            "2026-06-17T05:40:30Z",
        )
        forwarded_reading = forward.call_args.args[0]
        self.assertEqual(forwarded_reading["captured_at"], "2026-06-17T05:40:30Z")

    def test_replayed_gateway_packet_keeps_identical_captured_at(self):
        forwarded = []

        def capture(reading):
            forwarded.append(reading)
            return {"forwarded": True, "status_code": 200}

        with mock.patch.object(ecowitt_listener, "maybe_forward", side_effect=capture):
            first = self.client.post(
                "/ecowitt",
                json=REAL_GATEWAY_PAYLOAD,
                environ_overrides={"REMOTE_ADDR": "198.51.100.75"},
            )
            second = self.client.post(
                "/ecowitt",
                json=REAL_GATEWAY_PAYLOAD,
                environ_overrides={"REMOTE_ADDR": "198.51.100.75"},
            )

        self.assertEqual(
            first.get_json()["reading"]["captured_at"],
            second.get_json()["reading"]["captured_at"],
        )
        self.assertEqual(forwarded[0]["captured_at"], forwarded[1]["captured_at"])

    def test_stale_gateway_dateutc_is_preserved_not_replaced_with_receive_time(self):
        stale = dict(REAL_GATEWAY_PAYLOAD, dateutc="2020-01-02 03:04:05")
        with mock.patch.object(
            ecowitt_listener,
            "maybe_forward",
            return_value={"forwarded": True, "status_code": 200},
        ) as forward:
            response = self.client.post(
                "/ecowitt",
                json=stale,
                environ_overrides={"REMOTE_ADDR": "198.51.100.75"},
            )

        self.assertEqual(
            response.get_json()["reading"]["captured_at"],
            "2020-01-02T03:04:05Z",
        )
        self.assertEqual(response.get_json()["reading"]["source"], "stale")
        self.assertTrue(response.get_json()["reading"]["physical_gateway_evidence"])
        self.assertEqual(
            forward.call_args.args[0]["captured_at"],
            "2020-01-02T03:04:05Z",
        )
        self.assertEqual(forward.call_args.args[0]["source"], "stale")

    def test_missing_or_invalid_gateway_dateutc_is_never_forwarded(self):
        blocked_before = int(ecowitt_listener.FORWARD_STATS["blocked_count"])
        for dateutc in (None, "not-a-timestamp"):
            payload = dict(REAL_GATEWAY_PAYLOAD)
            if dateutc is None:
                payload.pop("dateutc")
            else:
                payload["dateutc"] = dateutc

            with self.subTest(dateutc=dateutc), mock.patch.object(
                ecowitt_listener,
                "maybe_forward",
            ) as forward:
                response = self.client.post(
                    "/ecowitt",
                    json=payload,
                    environ_overrides={"REMOTE_ADDR": "198.51.100.75"},
                )

                self.assertEqual(response.status_code, 200)
                body = response.get_json()
                self.assertEqual(body["reading"]["source"], "invalid")
                self.assertFalse(body["reading"]["physical_gateway_evidence"])
                self.assertIsNone(body["reading"]["captured_at"])
                self.assertEqual(
                    body["forward"],
                    {
                        "forwarded": False,
                        "reason": "invalid_gateway_timestamp",
                    },
                )
                forward.assert_not_called()
                self.assertEqual(
                    ecowitt_listener.FORWARD_STATS["last_error"],
                    "invalid_gateway_timestamp",
                )
        self.assertEqual(
            ecowitt_listener.FORWARD_STATS["blocked_count"],
            blocked_before + 2,
        )

    def test_future_gateway_dateutc_is_invalid_and_never_forwarded(self):
        future = FIXED_NOW + timedelta(minutes=6)
        payload = dict(
            REAL_GATEWAY_PAYLOAD,
            dateutc=future.strftime("%Y-%m-%d %H:%M:%S"),
        )
        with mock.patch.object(ecowitt_listener, "maybe_forward") as forward:
            response = self.client.post(
                "/ecowitt",
                json=payload,
                environ_overrides={"REMOTE_ADDR": "198.51.100.75"},
            )

        body = response.get_json()
        self.assertEqual(body["reading"]["source"], "invalid")
        self.assertFalse(body["reading"]["physical_gateway_evidence"])
        self.assertIsNone(body["reading"]["captured_at"])
        self.assertEqual(body["forward"]["reason"], "invalid_gateway_timestamp")
        forward.assert_not_called()

    def test_configured_uppercase_path_accepts_physical_gateway_uploads(self):
        response = self.client.post(
            "/ECOWITT/",
            json=REAL_GATEWAY_PAYLOAD,
            environ_overrides={"REMOTE_ADDR": "192.0.2.44"},
        )
        self.assertEqual(response.status_code, 200)
        reading = response.get_json()["reading"]
        self.assertEqual(reading["source"], "live")
        self.assertTrue(reading["physical_gateway_evidence"])

    def test_ingest_ack_and_local_log_never_retain_device_credentials(self):
        payload = dict(
            REAL_GATEWAY_PAYLOAD,
            PASSKEY="DEVICESECRET-DO-NOT-RETAIN",
            mac="AA:BB:CC:DD:EE:FF",
        )
        response = self.client.post(
            "/ECOWITT",
            json=payload,
            environ_overrides={"REMOTE_ADDR": "192.0.2.44"},
        )

        self.assertEqual(response.status_code, 200)
        response_text = response.get_data(as_text=True)
        log_text = self.log_path.read_text(encoding="utf-8")
        for forbidden in ("DEVICESECRET-DO-NOT-RETAIN", "AA:BB:CC:DD:EE:FF"):
            self.assertNotIn(forbidden, response_text)
            self.assertNotIn(forbidden, log_text)
        self.assertNotIn("raw_payload", response.get_json()["reading"])
        self.assertIn("stationtype", log_text)

    def test_loopback_header_live_downgrades_and_stays_non_physical(self):
        spoofed = dict(DEMO_BROWSER_PAYLOAD, physical_gateway_evidence=True)
        response = self.client.post(
            "/ecowitt",
            json=spoofed,
            headers={"X-Verdant-Forward-Mode": "live"},
            environ_overrides={"REMOTE_ADDR": "127.0.0.1"},
        )
        self.assertEqual(response.status_code, 200)
        reading = response.get_json()["reading"]
        self.assertEqual(reading["source"], "demo")
        self.assertFalse(reading["physical_gateway_evidence"])

        latest = self._status().get_json()["latest_metrics"]
        self.assertEqual(latest["source"], "demo")
        self.assertFalse(latest["physical_gateway_evidence"])


if __name__ == "__main__":
    unittest.main()
