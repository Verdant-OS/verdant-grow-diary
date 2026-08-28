"""Unit tests for EcoWitt custom-HTTP bridge ingest-readiness (FIELD_MAP).

Run from this folder:
    python3 -m unittest test_ingest_readiness -q
"""
from __future__ import annotations

import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

import ecowitt_listener
from ecowitt_listener import (
    ECOWITT_LIVE_FRESHNESS,
    FIELD_MAP,
    _redact_raw_payload_for_forward,
    app,
    is_stuck_zero_or_hundred_pct,
    metrics_force_invalid_source,
    normalize_metrics,
    resolve_source,
)

FIXED_NOW = datetime(2026, 6, 17, 5, 45, 30, tzinfo=timezone.utc)

MULTI_CHANNEL_DEMO = {
    "tempinf": "72.0",
    "humidityin": "48",
    "temp1f": "77.4",
    "humidity1": "58",
    "soilmoisture1": "33",
    "co2": "721",
    "temp2f": "74.0",
    "humidity2": "55",
    "soilmoisture3": "40",
    "leafwetness1": "12",
    "tf_ch1": "70.1",
    "PASSKEY": "should-never-forward",
    "dateutc": "2026-06-17 05:40:30",
}


class FieldMapIngestReadinessTests(unittest.TestCase):
    def test_existing_field_map_names_preserved(self):
        self.assertIn("temp1f", FIELD_MAP["temp_f"])
        self.assertIn("tempinf", FIELD_MAP["temp_f"])
        self.assertIn("humidity1", FIELD_MAP["humidity_percent"])
        self.assertIn("humidityin", FIELD_MAP["humidity_percent"])
        self.assertIn("soilmoisture1", FIELD_MAP["soil_moisture_pct"])
        self.assertIn("soilmoisture2", FIELD_MAP["soil_moisture_pct"])
        self.assertIn("co2", FIELD_MAP["co2_ppm"])
        self.assertIn("co2in", FIELD_MAP["co2_ppm"])

    def test_extra_channels_accepted_onto_canonical_names(self):
        self.assertIn("temp2f", FIELD_MAP["temp_f"])
        self.assertIn("temp8f", FIELD_MAP["temp_f"])
        self.assertIn("humidity2", FIELD_MAP["humidity_percent"])
        self.assertIn("humidity8", FIELD_MAP["humidity_percent"])
        self.assertIn("soilmoisture3", FIELD_MAP["soil_moisture_pct"])
        self.assertIn("soilmoisture16", FIELD_MAP["soil_moisture_pct"])

    def test_multi_channel_demo_normalizes_primary_metrics(self):
        metrics = normalize_metrics(MULTI_CHANNEL_DEMO)
        # First present candidate wins: ch1 over indoor / ch2.
        self.assertAlmostEqual(metrics["temp_f"], 77.4)
        self.assertAlmostEqual(metrics["humidity_percent"], 58.0)
        self.assertAlmostEqual(metrics["soil_moisture_pct"], 33.0)
        self.assertAlmostEqual(metrics["co2_ppm"], 721.0)

    def test_extra_channel_fills_when_primary_absent(self):
        metrics = normalize_metrics(
            {
                "temp2f": "70",
                "humidity2": "50",
                "soilmoisture3": "41",
                "co2in": "800",
            }
        )
        self.assertAlmostEqual(metrics["temp_f"], 70.0)
        self.assertAlmostEqual(metrics["humidity_percent"], 50.0)
        self.assertAlmostEqual(metrics["soil_moisture_pct"], 41.0)
        self.assertAlmostEqual(metrics["co2_ppm"], 800.0)

    def test_indoor_hub_maps_when_outdoor_absent(self):
        metrics = normalize_metrics({"tempinf": "72", "humidityin": "48"})
        self.assertAlmostEqual(metrics["temp_f"], 72.0)
        self.assertAlmostEqual(metrics["humidity_percent"], 48.0)

    def test_leafwetness_tf_ch_and_wh52_ec_not_in_field_map(self):
        all_candidates = {c for keys in FIELD_MAP.values() for c in keys}
        self.assertNotIn("leafwetness1", all_candidates)
        self.assertNotIn("tf_ch1", all_candidates)
        self.assertNotIn("soilad1", all_candidates)
        self.assertNotIn("ec1", all_candidates)

    def test_unknown_and_extra_keys_stay_in_redacted_raw_payload(self):
        payload = dict(MULTI_CHANNEL_DEMO, soilad1="1234", unknown_probe="keep-me")
        redacted = _redact_raw_payload_for_forward(payload)
        self.assertNotIn("PASSKEY", redacted)
        self.assertEqual(redacted["dateutc"], MULTI_CHANNEL_DEMO["dateutc"])
        self.assertEqual(redacted["temp2f"], "74.0")
        self.assertEqual(redacted["soilad1"], "1234")
        self.assertEqual(redacted["unknown_probe"], "keep-me")

    def test_unparseable_becomes_null(self):
        metrics = normalize_metrics({"temp1f": "NaN", "humidity1": "abc", "soilmoisture1": ""})
        self.assertIsNone(metrics["temp_f"])
        self.assertIsNone(metrics["humidity_percent"])
        self.assertIsNone(metrics["soil_moisture_pct"])

    def test_passkey_redacted_from_raw_payload(self):
        redacted = _redact_raw_payload_for_forward(MULTI_CHANNEL_DEMO)
        self.assertNotIn("PASSKEY", redacted)
        self.assertIn("leafwetness1", redacted)
        self.assertIn("tf_ch1", redacted)
        self.assertIn("temp2f", redacted)

    def test_live_freshness_is_fifteen_minutes(self):
        self.assertEqual(ECOWITT_LIVE_FRESHNESS, timedelta(minutes=15))

    def test_stuck_humidity_or_soil_forces_invalid(self):
        self.assertTrue(is_stuck_zero_or_hundred_pct(0.0))
        self.assertTrue(is_stuck_zero_or_hundred_pct(100.0))
        self.assertFalse(is_stuck_zero_or_hundred_pct(58.0))
        self.assertTrue(
            metrics_force_invalid_source(
                {
                    "temp_f": 77.0,
                    "humidity_percent": 0.0,
                    "soil_moisture_pct": 33.0,
                    "co2_ppm": 700.0,
                }
            )
        )
        self.assertTrue(
            metrics_force_invalid_source(
                {
                    "temp_f": 77.0,
                    "humidity_percent": 55.0,
                    "soil_moisture_pct": 100.0,
                    "co2_ppm": None,
                }
            )
        )


class MultiChannelDemoSourceTests(unittest.TestCase):
    def setUp(self):
        patcher = mock.patch.object(ecowitt_listener, "_utc_now", return_value=FIXED_NOW)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_multi_channel_loopback_normalizes_as_demo(self):
        source = resolve_source(
            payload=MULTI_CHANNEL_DEMO,
            remote_addr="127.0.0.1",
            header_mode="",
            env_mode="",
        )
        self.assertEqual(source, "demo")
        metrics = normalize_metrics(MULTI_CHANNEL_DEMO)
        # Healthy multi-channel demo stays demo (not stuck).
        self.assertEqual(
            "invalid" if metrics_force_invalid_source(metrics) else source,
            "demo",
        )

    def test_dateutc_over_fifteen_minutes_is_stale(self):
        payload = {
            "stationtype": "GW1200B_V1.4.7",
            "model": "GW1200B",
            "dateutc": "2026-06-17 05:30:29",  # >15 min before FIXED_NOW
            "temp1f": "77.4",
            "humidity1": "58",
        }
        self.assertEqual(
            resolve_source(
                payload=payload,
                remote_addr="192.168.68.75",
                header_mode="",
                env_mode="",
            ),
            "stale",
        )

    def test_dateutc_within_fifteen_minutes_is_live(self):
        payload = {
            "stationtype": "GW1200B_V1.4.7",
            "model": "GW1200B",
            "dateutc": "2026-06-17 05:31:00",  # 14.5 min before FIXED_NOW
            "temp1f": "77.4",
            "humidity1": "58",
        }
        self.assertEqual(
            resolve_source(
                payload=payload,
                remote_addr="192.168.68.75",
                header_mode="",
                env_mode="",
            ),
            "live",
        )

    def test_forbidden_vendor_source_label_is_invalid(self):
        for bad in ("ecowitt", "mqtt", "webhook", "sim", "ha"):
            payload = dict(MULTI_CHANNEL_DEMO, source=bad)
            self.assertEqual(
                resolve_source(
                    payload=payload,
                    remote_addr="127.0.0.1",
                    header_mode="",
                    env_mode="",
                ),
                "invalid",
                bad,
            )

    def test_freshness_does_not_promote_vendor_token_on_lan_packet(self):
        payload = {
            "stationtype": "GW1200B_V1.4.7",
            "model": "GW1200B",
            "dateutc": "2026-06-17 05:31:00",
            "temp1f": "77.4",
            "humidity1": "58",
            "source": "ecowitt",
        }
        self.assertEqual(
            resolve_source(
                payload=payload,
                remote_addr="192.168.68.75",
                header_mode="live",
                env_mode="live",
            ),
            "invalid",
        )

    def test_stuck_humidity_on_live_lan_packet_is_invalid(self):
        payload = {
            "stationtype": "GW1200B_V1.4.7",
            "model": "GW1200B",
            "dateutc": "2026-06-17 05:31:00",
            "temp1f": "77.4",
            "humidity1": "0",
        }
        self.assertEqual(
            resolve_source(
                payload=payload,
                remote_addr="192.168.68.75",
                header_mode="",
                env_mode="",
            ),
            "invalid",
        )

    def test_stuck_soil_hundred_on_live_lan_packet_is_invalid(self):
        payload = {
            "stationtype": "GW1200B_V1.4.7",
            "model": "GW1200B",
            "dateutc": "2026-06-17 05:31:00",
            "temp1f": "77.4",
            "humidity1": "58",
            "soilmoisture1": "100",
        }
        self.assertEqual(
            resolve_source(
                payload=payload,
                remote_addr="192.168.68.75",
                header_mode="",
                env_mode="",
            ),
            "invalid",
        )


class IngestReadinessRouteTests(unittest.TestCase):
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

    def test_get_multi_channel_demo_normalizes_as_demo(self):
        qs = (
            "tempinf=72.0&humidityin=48&temp1f=77.4&humidity1=58"
            "&soilmoisture1=33&co2=721&temp2f=74.0&humidity2=55"
            "&soilmoisture3=40&leafwetness1=12&tf_ch1=70.1"
            "&PASSKEY=should-never-store&dateutc=2026-06-17+05:40:30"
        )
        captured = []

        def capture(reading):
            captured.append(reading)
            return {"forwarded": False, "reason": "no_forwarding_configured"}

        with mock.patch.object(ecowitt_listener, "maybe_forward", side_effect=capture):
            response = self.client.get(
                f"/ecowitt?{qs}",
                environ_overrides={"REMOTE_ADDR": "127.0.0.1"},
            )
        self.assertEqual(response.status_code, 200)
        public = response.get_json()["reading"]
        self.assertEqual(public["source"], "demo")
        self.assertAlmostEqual(public["metrics"]["temp_f"], 77.4)
        self.assertAlmostEqual(public["metrics"]["humidity_percent"], 58.0)
        self.assertAlmostEqual(public["metrics"]["soil_moisture_pct"], 33.0)
        self.assertAlmostEqual(public["metrics"]["co2_ppm"], 721.0)
        self.assertEqual(len(captured), 1)
        raw = captured[0]["metadata"]["raw_payload"]
        self.assertNotIn("PASSKEY", raw)
        self.assertEqual(raw["temp2f"], "74.0")
        self.assertEqual(raw["leafwetness1"], "12")
        self.assertEqual(raw["tf_ch1"], "70.1")
        self.assertEqual(raw["soilmoisture3"], "40")

    def test_post_extra_channels_land_in_raw_payload_not_dropped(self):
        payload = dict(
            MULTI_CHANNEL_DEMO,
            soilad1="1234",
            ec1="0.8",
            unknown_probe="keep-me",
        )
        captured = []

        def capture(reading):
            captured.append(reading)
            return {"forwarded": False, "reason": "no_forwarding_configured"}

        with mock.patch.object(ecowitt_listener, "maybe_forward", side_effect=capture):
            response = self.client.post(
                "/ecowitt",
                json=payload,
                environ_overrides={"REMOTE_ADDR": "127.0.0.1"},
            )
        self.assertEqual(response.status_code, 200)
        public = response.get_json()["reading"]
        self.assertEqual(public["source"], "demo")
        self.assertAlmostEqual(public["metrics"]["temp_f"], 77.4)
        self.assertEqual(len(captured), 1)
        raw = captured[0]["metadata"]["raw_payload"]
        self.assertNotIn("PASSKEY", raw)
        self.assertEqual(raw["temp2f"], "74.0")
        self.assertEqual(raw["humidity2"], "55")
        self.assertEqual(raw["soilmoisture3"], "40")
        self.assertEqual(raw["leafwetness1"], "12")
        self.assertEqual(raw["tf_ch1"], "70.1")
        self.assertEqual(raw["soilad1"], "1234")
        self.assertEqual(raw["ec1"], "0.8")
        self.assertEqual(raw["unknown_probe"], "keep-me")
        self.assertNotIn("leafwetness1", FIELD_MAP["temp_f"])


if __name__ == "__main__":
    unittest.main()
