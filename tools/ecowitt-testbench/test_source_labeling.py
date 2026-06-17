"""Unit tests for resolve_source() in ecowitt_listener.

Run from this folder with the venv python:
    .\\.venv\\Scripts\\python.exe -m pytest test_source_labeling.py -q

Pure-function tests — no network, no Flask request context required
because resolve_source() accepts payload / remote_addr / header_mode /
env_mode as explicit arguments.
"""
from __future__ import annotations

import unittest

from ecowitt_listener import (
    ALLOWED_SOURCES,
    ECOWITT_GATEWAY_MARKERS,
    looks_like_ecowitt_gateway,
    resolve_source,
)


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

    def test_header_opt_in_still_allows_live(self):
        self.assertEqual(
            resolve_source(
                payload=DEMO_BROWSER_PAYLOAD,
                remote_addr="127.0.0.1",
                header_mode="live",
                env_mode="",
            ),
            "live",
        )

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
        self.assertTrue(looks_like_ecowitt_gateway({"stationtype": "x", "model": "y"}))

    def test_allowed_sources_set_is_canonical(self):
        self.assertEqual(
            ALLOWED_SOURCES,
            {"live", "manual", "csv", "demo", "stale", "invalid"},
        )

    def test_gateway_markers_include_expected_fields(self):
        for key in ("passkey", "stationtype", "model", "dateutc"):
            self.assertIn(key, ECOWITT_GATEWAY_MARKERS)


if __name__ == "__main__":
    unittest.main()
