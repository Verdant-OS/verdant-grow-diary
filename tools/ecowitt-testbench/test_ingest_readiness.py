"""Listener integration with synthetic packets; no gateway or Verdant access."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import tempfile
import unittest
import unittest.mock as mock
from datetime import datetime, timedelta, timezone
from pathlib import Path

import ecowitt_listener as listener
from test_multitent import TENT_A, TENT_B, TOKEN_A, TOKEN_B, tent


NOW = datetime(2026, 9, 28, 12, tzinfo=timezone.utc)


class ListenerIntegrationTests(unittest.TestCase):
    def test_mapped_forwarding_diagnostics_use_mapped_credentials_without_state_writes(self):
        for active in (False, True):
            with self.subTest(active=active):
                if active:
                    self.post()
                before = {path: path.read_bytes() for path in self.root.rglob("*") if path.is_file()}
                with mock.patch.object(listener, "get_runtime", side_effect=AssertionError("diagnostics must not initialize state")):
                    for endpoint in ("/debug/forwarding-status", "/debug/forwarding-error-report"):
                        report = self.client.get(endpoint).get_json()
                        self.assertTrue(report["forwarding_enabled"])
                        self.assertTrue(report["forwarding_ready"])
                        self.assertTrue(report["bridge_token_configured"])
                        self.assertTrue(report["tent_id_valid"])
                        text = json.dumps(report)
                        for private in (TOKEN_A, TOKEN_B, TENT_A, TENT_B, "VERDANT_BRIDGE_TOKEN", "VERDANT_TENT_ID"):
                            self.assertNotIn(private, text)
                        self.assertEqual(self.client.get(endpoint, environ_overrides={"REMOTE_ADDR": "198.51.100.2"}).status_code, 403)
                self.assertEqual(before, {path: path.read_bytes() for path in self.root.rglob("*") if path.is_file()})
                self.requests.post.assert_not_called()

    def test_mapped_diagnostics_recheck_rotated_credentials_and_use_safe_guidance(self):
        self.post()
        original = os.environ["TOKEN_B"]
        for value in (None, "private invalid rotated credential", TOKEN_A):
            with self.subTest(value=value):
                if value is None:
                    os.environ.pop("TOKEN_B", None)
                else:
                    os.environ["TOKEN_B"] = value
                for endpoint in ("/debug/forwarding-status", "/debug/forwarding-error-report"):
                    report = self.client.get(endpoint).get_json()
                    self.assertFalse(report["forwarding_ready"])
                    self.assertFalse(report["bridge_token_configured"])
                    text = json.dumps(report)
                    self.assertNotIn("private invalid", text)
                    self.assertNotIn("VERDANT_BRIDGE_TOKEN", text)
                    if endpoint.endswith("error-report"):
                        self.assertIn("mapped", report["recommended_next_step"].lower())
        os.environ["TOKEN_B"] = original
        self.assertTrue(self.client.get("/debug/forwarding-status").get_json()["forwarding_ready"])
        with mock.patch.dict(listener.FORWARD_STATS, {"last_forward_response_classification": "tent_authorization_mismatch"}):
            guidance = self.client.get("/debug/forwarding-error-report").get_json()["recommended_next_step"]
            self.assertIn("mapped", guidance.lower())
            self.assertNotIn("VERDANT_TENT_ID", guidance)
        self.requests.post.assert_not_called()

    def test_mapped_diagnostics_fail_closed_before_startup_for_bad_map_or_url(self):
        for kind in ("map", "url"):
            with self.subTest(kind=kind):
                with mock.patch.dict(os.environ, {"VERDANT_INGEST_URL": "http://example.invalid"} if kind == "url" else {}):
                    if kind == "map":
                        self.mapping.write_text("private invalid map")
                    else:
                        self.mapping.write_text(json.dumps([tent(air_channels=[1])]))
                    report = self.client.get("/debug/forwarding-error-report").get_json()
                    self.assertFalse(report["forwarding_ready"])
                    self.assertNotIn("private invalid", json.dumps(report))
                    self.assertNotIn("VERDANT_BRIDGE_TOKEN", report["recommended_next_step"])
                    self.assertIsNone(listener._RUNTIME)
                    self.assertFalse((self.root / "spool").exists())
        self.requests.post.assert_not_called()

    def test_invalid_health_state_cannot_evict_durable_queue_before_startup_refusal(self):
        self.post()
        runtime = listener.get_runtime()
        saved_queue = runtime.spool.path.read_bytes()
        saved_stats = runtime.spool.stats_path.read_bytes()
        saved_health = runtime.health.path.read_bytes()
        saved_ids = list(runtime.spool.entries)
        cap = runtime.spool._disk_bytes() // 2
        corrupt_health = json.dumps({"tents": "invalid", "private": TOKEN_A + "x" * 10000}).encode()
        runtime.health.path.write_bytes(corrupt_health)
        os.environ["ECOWITT_SPOOL_MAX_MB"] = str(cap / (1024 * 1024))
        listener._RUNTIME = None
        with self.assertRaises(ValueError) as caught:
            listener.get_runtime()
        self.assertNotIn(TOKEN_A, str(caught.exception))
        self.assertEqual(runtime.spool.path.read_bytes(), saved_queue)
        self.assertEqual(runtime.spool.stats_path.read_bytes(), saved_stats)
        self.assertEqual(runtime.health.path.read_bytes(), corrupt_health)
        self.assertEqual(self.client.get("/health").status_code, 503)
        self.assertEqual(self.post().status_code, 503)
        self.requests.post.assert_not_called()
        runtime.health.path.write_bytes(saved_health)
        os.environ.pop("ECOWITT_SPOOL_MAX_MB")
        restored = listener.get_runtime()
        self.assertEqual(list(restored.spool.entries), saved_ids)
        self.assertEqual(restored.spool.stats["dropped_count"], 0)
        restored.replay_once()
        self.assertEqual(restored.spool.pending_count, 0)
        self.assertEqual(self.requests.post.call_count, 2)

    def test_mapped_unsafe_ingest_urls_fail_before_touching_durable_queue(self):
        self.post()
        runtime = listener.get_runtime()
        saved_queue = runtime.spool.path.read_bytes()
        original_url = os.environ["VERDANT_INGEST_URL"]
        urls = ("http://example.invalid/ingest", "ftp://example.invalid/ingest",
                "https://synthetic-private@example.invalid/ingest", "https://@example.invalid/ingest",
                "https://:synthetic-private@example.invalid/ingest", "https:///ingest",
                "https://example.invalid:bad/ingest", "https://example.invalid:65536/ingest",
                "https://example.invalid/ingest\n")
        for url in urls:
            with self.subTest(url=url):
                os.environ["VERDANT_INGEST_URL"] = url
                listener._RUNTIME = None
                with self.assertRaises(ValueError) as caught:
                    listener.get_runtime()
                self.assertNotIn("synthetic-private", str(caught.exception))
                self.assertNotIn(url, str(caught.exception))
                self.assertEqual(runtime.spool.path.read_bytes(), saved_queue)
                self.assertEqual(self.client.get("/health").status_code, 503)
                self.assertEqual(self.post().status_code, 503)
                self.requests.post.assert_not_called()
        os.environ["VERDANT_INGEST_URL"] = original_url
        restored = listener.get_runtime()
        restored.replay_once()
        self.assertEqual(restored.spool.pending_count, 0)

    def test_replay_rechecks_ingest_url_before_sending_outbound_credentials(self):
        self.post()
        runtime = listener.get_runtime()
        saved_ids = list(runtime.spool.entries)
        original_url = os.environ["VERDANT_INGEST_URL"]
        os.environ["VERDANT_INGEST_URL"] = "http://example.invalid/ingest"
        runtime.replay_once()
        self.requests.post.assert_not_called()
        self.assertEqual(list(runtime.spool.entries), saved_ids)
        self.assertTrue(all(entry["attempts"] == 1 for entry in runtime.spool.entries.values()))
        os.environ["VERDANT_INGEST_URL"] = original_url
        self.now += timedelta(seconds=6)
        runtime.replay_once()
        self.assertEqual(runtime.spool.pending_count, 0)
        self.assertEqual(self.requests.post.call_count, 2)

    def test_legacy_unowned_stuck_probes_are_only_local_diagnostics(self):
        os.environ.pop("ECOWITT_TENT_MAP")
        os.environ.update(VERDANT_TENT_ID=TENT_A, VERDANT_BRIDGE_TOKEN=TOKEN_A)
        for field in ("soilmoisture4", "SOILMOISTURE4", "humidity5", "HUMIDITY5", "humidity2"):
            for value in ("0", "100"):
                with self.subTest(field=field, value=value):
                    response = self.post({**self.packet, field: value})
                    self.assertEqual(response.status_code, 200)
                    self.assertEqual(response.get_json()["reading"]["source"], "live")
                    forwarded = self.requests.post.call_args.kwargs["json"]
                    self.assertEqual(forwarded["metadata"]["verdant_source"], "live")
                    self.assertEqual(forwarded["metrics"]["temp_f"], 77)
                    self.assertEqual(forwarded["metrics"]["humidity_percent"], 50)
                    self.assertNotIn(field, forwarded["metadata"]["raw_payload"])
                    rows = (listener.get_runtime().spool.root / "unmapped_channels.jsonl").read_text()
                    self.assertTrue(any(json.loads(row)["key"] == field for row in rows.splitlines()))

    def test_legacy_owned_stuck_primary_and_secondary_candidates_remain_invalid(self):
        os.environ.pop("ECOWITT_TENT_MAP")
        os.environ.update(VERDANT_TENT_ID=TENT_A, VERDANT_BRIDGE_TOKEN=TOKEN_A)
        for field in ("humidity1", "humidity", "humidityin", "soilmoisture1", "soilmoisture2"):
            for value in ("0", "100"):
                with self.subTest(field=field, value=value):
                    response = self.post({**self.packet, field: value})
                    self.assertEqual(response.get_json()["reading"]["source"], "invalid")
                    self.assertEqual(self.requests.post.call_args.kwargs["json"]["metadata"]["verdant_source"], "invalid")

    def test_legacy_stuck_percentages_are_null_before_enqueue_and_delivery(self):
        os.environ.pop("ECOWITT_TENT_MAP")
        os.environ.update(VERDANT_TENT_ID=TENT_A, VERDANT_BRIDGE_TOKEN=TOKEN_A)
        for field in ("humidity1", "HUMIDITY1", "humidity", "humidityin", "soilmoisture1", "soilmoisture2"):
            for value in ("0", "100"):
                with self.subTest(field=field, value=value):
                    canonical = "humidity_percent" if field.lower().startswith("humidity") else "soil_moisture_pct"
                    response = self.post({**self.packet, field: value})
                    self.assertIsNone(response.get_json()["reading"]["metrics"][canonical])
                    outbound = self.requests.post.call_args.kwargs["json"]
                    self.assertIsNone(outbound["metrics"][canonical])
                    self.assertEqual(outbound["metrics"]["temp_f"], 77)
                    self.assertEqual(outbound["metadata"]["raw_payload"][field], value)
                    self.assertEqual(outbound["metadata"]["verdant_source"], "invalid")
        for value in ("0.1", "99.9", "50"):
            result = listener.normalize_metrics({"humidity1": value, "soilmoisture1": value})
            self.assertEqual(result["humidity_percent"], float(value))
            self.assertEqual(result["soil_moisture_pct"], float(value))

    def test_legacy_stuck_percent_delivery_warning_survives_success_and_restart(self):
        os.environ.pop("ECOWITT_TENT_MAP")
        os.environ.update(VERDANT_TENT_ID=TENT_A, VERDANT_BRIDGE_TOKEN=TOKEN_A)
        for field in ("humidity1", "soilmoisture1"):
            with self.subTest(field=field):
                packet = {**self.packet, field: "100", "dateutc": self.now.strftime("%Y-%m-%d %H:%M:%S")}
                self.post(packet)
                self.now += timedelta(minutes=10)
                self.post({**packet, "dateutc": self.now.strftime("%Y-%m-%d %H:%M:%S")})
                self.assertEqual(self.client.get("/health").status_code, 503)
                listener._RUNTIME = None
                self.assertEqual(self.client.get("/health").status_code, 503)
                self.post({**self.packet, "dateutc": self.now.strftime("%Y-%m-%d %H:%M:%S")})
                self.assertEqual(self.client.get("/health").status_code, 200)

    def test_legacy_preexisting_stuck_queue_values_cannot_forward_as_numeric(self):
        os.environ.pop("ECOWITT_TENT_MAP")
        os.environ.update(VERDANT_TENT_ID=TENT_A, VERDANT_BRIDGE_TOKEN=TOKEN_A)
        runtime = listener.get_runtime()
        reading = {"captured_at": NOW.isoformat(), "source": "invalid", "vendor": listener.VENDOR,
                   "physical_gateway_evidence": True,
                   "metrics": {"temp_f": 77, "humidity_percent": 100, "soil_moisture_pct": 0},
                   "metadata": {"raw_payload": {**self.packet, "humidity1": "100", "soilmoisture1": "0"}}}
        runtime.enqueue(reading, TENT_A)
        listener._RUNTIME = None
        listener.get_runtime().replay_once()
        outbound = self.requests.post.call_args.kwargs["json"]
        self.assertIsNone(outbound["metrics"]["humidity_percent"])
        self.assertIsNone(outbound["metrics"]["soil_moisture_pct"])
        self.assertEqual(outbound["metrics"]["temp_f"], 77)
        self.assertEqual(outbound["metadata"]["verdant_source"], "invalid")
        self.assertEqual(reading["metrics"]["humidity_percent"], 100)

    def test_legacy_unowned_probes_preserve_explicit_stale_and_loopback_source_fences(self):
        os.environ.pop("ECOWITT_TENT_MAP")
        os.environ.update(VERDANT_TENT_ID=TENT_A, VERDANT_BRIDGE_TOKEN=TOKEN_A, VERDANT_FORWARD_MODE="live")
        cases = [({"source": "manual"}, "198.51.100.2", "manual"),
                 ({"source": "csv"}, "198.51.100.2", "csv"),
                 ({"source": "invalid"}, "198.51.100.2", "invalid"),
                 ({"source": "unknown"}, "198.51.100.2", "invalid"),
                 ({"dateutc": "2026-09-28 11:29:00"}, "198.51.100.2", "stale"),
                 ({"source": "live"}, "127.0.0.1", "demo")]
        for fields, remote, expected in cases:
            with self.subTest(fields=fields, remote=remote):
                response = self.client.post("/ecowitt", json={**self.packet, "soilmoisture4": "0", **fields},
                    headers={"X-Verdant-Forward-Mode": "live"}, environ_overrides={"REMOTE_ADDR": remote})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.get_json()["reading"]["source"], expected)
                self.assertEqual(self.requests.post.call_args.kwargs["json"]["metadata"]["verdant_source"], expected)

    def test_orphaned_queue_alert_and_recovery_are_shared_durable_and_private(self):
        self.post()
        original_map = self.mapping.read_text()
        self.mapping.write_text(json.dumps([json.loads(original_map)[1]]))
        send = mock.Mock(return_value=True)
        def restore_runtime():
            listener._RUNTIME = None
            runtime = listener.get_runtime()
            runtime.health.send_alert = send
            runtime.health.alert_interval = 0
            return runtime
        runtime = restore_runtime()
        runtime.replay_once()
        self.assertEqual(send.call_count, 1)
        self.assertEqual(send.call_args.args[0]["event"], "alert")
        self.assertEqual(send.call_args.args[0]["reason"], "orphaned_queue")
        self.assertIn("orphaned_queue", runtime.health.status()["reasons"])
        self.assertEqual(self.client.get("/health").status_code, 503)
        runtime.replay_once()
        runtime = restore_runtime()
        runtime.replay_once()
        self.assertEqual(send.call_count, 1)
        self.mapping.write_text(original_map)
        runtime = restore_runtime()
        self.now += timedelta(seconds=61)
        runtime.replay_once()
        self.assertEqual(send.call_count, 2)
        self.assertEqual(send.call_args.args[0]["event"], "recovery")
        self.assertEqual(send.call_args.args[0]["reason"], "orphaned_queue")
        runtime.replay_once()
        self.assertEqual(send.call_count, 2)
        self.assertEqual(runtime.spool.pending_count, 0)
        self.assertEqual(self.client.get("/health").status_code, 200)
        messages = json.dumps([call.args[0] for call in send.call_args_list])
        for private in (TENT_A, TENT_B, TOKEN_A, TOKEN_B):
            self.assertNotIn(private, messages)

    def test_each_local_delivery_latch_emits_one_alert_and_one_recovery(self):
        runtime = listener.get_runtime()
        send = mock.Mock(return_value=True)
        runtime.health.send_alert = send
        runtime.health.alert_interval = 0
        for index, (field, value) in enumerate((("last_local_error", "local_delivery_state_error"),
                                               ("last_enqueue_error", "local_delivery_state_error"),
                                               ("last_receive_error", "routing"))):
            with self.subTest(field=field):
                setattr(runtime, field, value)
                runtime.health.tick()
                self.assertEqual(send.call_count, index * 2 + 1)
                self.assertEqual(send.call_args.args[0]["event"], "alert")
                self.assertEqual(send.call_args.args[0]["reason"], "local_delivery_state_error")
                runtime.health.tick()
                self.assertEqual(send.call_count, index * 2 + 1)
                setattr(runtime, field, None)
                runtime.health.tick()
                self.assertEqual(send.call_count, index * 2 + 2)
                self.assertEqual(send.call_args.args[0]["event"], "recovery")
                self.assertEqual(send.call_args.args[0]["reason"], "local_delivery_state_error")
                self.assertTrue(runtime.delivery_health()["ok"])

    def test_replay_worker_reports_local_error_while_retries_are_still_failing(self):
        runtime = listener.get_runtime()
        runtime.enqueue({"captured_at": NOW.isoformat(), "source": "live", "metrics": {"temp_f": 70},
                         "metadata": {"raw_payload": self.packet}}, TENT_A)
        runtime.interval = 0.01
        runtime.health.alert_interval = 0
        alerted, recovered, allow_recovery = threading.Event(), threading.Event(), threading.Event()
        messages = []
        def send(message):
            messages.append(message)
            (alerted if message["event"] == "alert" else recovered).set()
            return True
        runtime.health.send_alert = send
        original = runtime.replay_once
        def replay():
            if not allow_recovery.is_set():
                raise OSError("synthetic private disk details " + TOKEN_A)
            original()
        with mock.patch.object(runtime, "replay_once", side_effect=replay), mock.patch("builtins.print") as logs:
            runtime.start()
            self.addCleanup(lambda: (runtime.stop(), runtime.thread.join(timeout=2)))
            self.assertTrue(alerted.wait(timeout=2))
            self.assertIsNotNone(runtime.last_local_error)
            allow_recovery.set()
            self.assertTrue(recovered.wait(timeout=2))
            runtime.stop()
            runtime.thread.join(timeout=2)
            self.assertEqual([message["event"] for message in messages], ["alert", "recovery"])
            self.assertNotIn(TOKEN_A, json.dumps(messages) + str(logs.call_args_list))
            self.assertNotIn("private disk details", json.dumps(messages) + str(logs.call_args_list))
        self.assertEqual(self.requests.post.call_count, 1)

    def test_observed_family_without_primary_is_not_hidden_by_other_family_delivery(self):
        common = {k: v for k, v in self.packet.items() if k in ("PASSKEY", "model", "stationtype", "dateutc")}
        cases = (
            ("air", {"temp2f": "80", "humidity2": "60", "soilmoisture1": "30"}, {"temp1f": "77"}),
            ("soil", {"soilmoisture2": "40", "temp1f": "77"}, {"soilmoisture1": "30"}),
            ("soil_temp", {"tf_ch2": "77", "temp1f": "77"}, {"tf_ch1": "76"}),
            ("co2", {"tf_co2": "77", "soilmoisture1": "30"}, {"co2": "800"}),
        )
        for family, fields, recovered in cases:
            with self.subTest(family=family):
                self.mapping.write_text(json.dumps([tent(air_channels=[1, 2], soil_channels=[1, 2], soil_temp_channels=[1, 2])]))
                listener._RUNTIME = None
                packet = {**common, **fields, "dateutc": self.now.strftime("%Y-%m-%d %H:%M:%S")}
                response = self.post(packet)
                self.assertTrue(response.get_json()["readings"][0]["metrics"])
                runtime = listener.get_runtime()
                runtime.replay_once()  # successful delivery of the other family
                self.now += timedelta(minutes=10)
                runtime.health.packet_received()
                self.assertEqual(self.client.get("/health").status_code, 503)
                listener._RUNTIME = None
                restored = listener.get_runtime()
                self.assertEqual(self.client.get("/health").status_code, 503)
                self.post({**packet, **recovered, "dateutc": self.now.strftime("%Y-%m-%d %H:%M:%S")})
                restored.replay_once()
                self.assertEqual(self.client.get("/health").status_code, 200)
                self.requests.post.reset_mock()

    def test_raw_receive_failure_remains_unhealthy_across_restart_until_a_real_write(self):
        self.post()
        runtime = listener.get_runtime()
        runtime.replay_once()
        original_open = Path.open
        def broken(path, *args, **kwargs):
            if path == listener.LOG_PATH:
                raise OSError("synthetic private disk details")
            return original_open(path, *args, **kwargs)
        with mock.patch.object(Path, "open", autospec=True, side_effect=broken):
            self.assertEqual(self.post().status_code, 503)
            listener._RUNTIME = None
            restored = listener.get_runtime()
            self.assertEqual(self.client.get("/health").status_code, 503)
            self.assertFalse(self.client.get("/status").get_json()["ok"])
            restored.replay_once()
            self.assertEqual(self.client.get("/health").status_code, 503)
        self.assertEqual(self.post().status_code, 200)
        self.assertEqual(self.client.get("/health").status_code, 200)
        listener._RUNTIME = None
        self.assertEqual(self.client.get("/health").status_code, 200)

    def test_mapped_mode_requires_ingest_url_at_startup(self):
        for url in (None, "", "   "):
            with self.subTest(url=url):
                if url is None:
                    os.environ.pop("VERDANT_INGEST_URL", None)
                else:
                    os.environ["VERDANT_INGEST_URL"] = url
                listener._RUNTIME = None
                with self.assertRaises(ValueError) as caught:
                    listener.get_runtime()
                self.assertIn("requires VERDANT_INGEST_URL", str(caught.exception))
                self.assertNotIn(TOKEN_A, str(caught.exception))
                self.assertEqual(self.client.get("/health").status_code, 503)
                self.assertEqual(self.post().status_code, 503)
                self.assertEqual(self.client.get("/livez").status_code, 200)
                self.requests.post.assert_not_called()

    def test_missing_mapped_url_preserves_queue_until_configuration_recovers(self):
        self.post()
        original = listener.get_runtime()
        saved_ids = list(original.spool.entries)
        saved_queue = original.spool.path.read_bytes()
        url = os.environ.pop("VERDANT_INGEST_URL")
        listener._RUNTIME = None
        self.assertEqual(self.client.get("/health").status_code, 503)
        self.assertEqual(self.post().status_code, 503)
        self.assertEqual(original.spool.path.read_bytes(), saved_queue)
        self.requests.post.assert_not_called()
        os.environ["VERDANT_INGEST_URL"] = url
        restored = listener.get_runtime()
        self.assertEqual(list(restored.spool.entries), saved_ids)
        restored.replay_once()
        self.assertEqual(restored.spool.pending_count, 0)
        self.assertEqual(self.client.get("/health").status_code, 200)
        self.assertEqual(self.requests.post.call_count, 2)

    def test_legacy_receive_only_still_accepts_packets_without_forwarding_config(self):
        for key in ("ECOWITT_TENT_MAP", "VERDANT_INGEST_URL", "VERDANT_BRIDGE_TOKEN", "VERDANT_TENT_ID"):
            os.environ.pop(key, None)
        response = self.post()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["forward"]["reason"], "no_forwarding_configured")
        self.assertEqual(listener.get_runtime().spool.pending_count, 0)
        self.assertEqual(self.client.get("/health").status_code, 200)
        self.assertEqual(self.client.get("/livez").status_code, 200)
        self.requests.post.assert_not_called()

    def test_map_without_owned_channels_fails_receive_and_health_without_forwarding(self):
        identity = {"tent_id": TENT_A, "label": "Test tent", "token_env": "TOKEN_A"}
        for ownership in ({}, {"air_channels": [], "soil_channels": [],
                              "soil_temp_channels": [], "co2": False}):
            with self.subTest(ownership=ownership):
                self.mapping.write_text(json.dumps([{**identity, **ownership}]))
                listener._RUNTIME = None
                response = self.post()
                self.assertEqual(response.status_code, 503)
                self.assertNotIn(TOKEN_A, response.get_data(as_text=True))
                health = self.client.get("/health")
                self.assertEqual(health.status_code, 503)
                self.assertFalse(health.get_json()["ok"])
                self.assertIsNone(listener._RUNTIME)
                self.requests.post.assert_not_called()

    def test_evicted_older_batch_stays_unhealthy_until_durable_delivery_after_restart(self):
        self.post()
        runtime = listener.get_runtime()
        old_ids = set(runtime.spool.entries)
        runtime.spool.max_bytes = runtime.spool._disk_bytes() + 256  # allow incident/checkpoint state, not another reading
        self.now += timedelta(seconds=2)
        packet = {**self.packet, "dateutc": self.now.strftime("%Y-%m-%d %H:%M:%S")}
        forward = self.post(packet).get_json()["forward"]
        self.assertTrue(forward["queued"])
        self.assertEqual(forward["dropped_count"], 0)  # both current entries survived
        self.assertFalse(old_ids & set(runtime.spool.entries))
        self.assertGreater(runtime.spool.stats["dropped_count"], 0)
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 503)
        self.assertIn("spool_data_drop", response.get_json()["reasons"])
        listener._RUNTIME = None
        restored = listener.get_runtime()
        self.assertEqual(self.client.get("/health").status_code, 503)
        self.requests.post.return_value.status_code = 503
        restored.replay_once()
        self.assertEqual(self.client.get("/health").status_code, 503)
        self.now += timedelta(seconds=6)
        self.requests.post.return_value.status_code = 200
        restored.replay_once()
        self.assertEqual(self.client.get("/health").status_code, 200)
        listener._RUNTIME = None
        self.assertEqual(self.client.get("/health").status_code, 200)

    def test_secondary_only_owned_data_records_failure_without_promotion(self):
        self.mapping.write_text(json.dumps([tent(air_channels=[1, 2], soil_channels=[1], soil_temp_channels=[1])]))
        runtime = listener.get_runtime()
        common = {k: v for k, v in self.packet.items() if k in ("PASSKEY", "model", "stationtype", "dateutc")}
        for fields in ({"temp2f": "80", "humidity2": "60"}, {"tf_co2": "77"}):
            with self.subTest(fields=fields):
                common["dateutc"] = self.now.strftime("%Y-%m-%d %H:%M:%S")
                response = self.post({**common, **fields})
                self.assertEqual(response.get_json()["forward"]["entry_count"], 0)
                self.assertEqual(response.get_json()["readings"][0]["metrics"], {})
                self.assertIsNotNone(runtime.health.data["tents"][TENT_A]["first_forward_failure_at"])
                self.now += timedelta(minutes=10)
                runtime.health.packet_received()
                self.assertEqual(self.client.get("/health").status_code, 503)
        self.requests.post.assert_not_called()
        listener._RUNTIME = None
        self.assertEqual(self.client.get("/health").status_code, 503)
        common["dateutc"] = self.now.strftime("%Y-%m-%d %H:%M:%S")
        self.post({**common, "temp1f": "77", "co2": "800"})
        listener.get_runtime().replay_once()
        self.assertEqual(self.client.get("/health").status_code, 200)

    def test_real_raw_log_open_and_write_failures_latch_health_until_repaired(self):
        runtime = listener.get_runtime()
        original_open = Path.open
        for stage in ("open", "write"):
            with self.subTest(stage=stage):
                def broken(path, *args, **kwargs):
                    if path != listener.LOG_PATH:
                        return original_open(path, *args, **kwargs)
                    if stage == "open":
                        raise OSError("synthetic private disk details")
                    handle = mock.MagicMock()
                    handle.__enter__.return_value = handle
                    handle.write.side_effect = OSError("synthetic private disk details")
                    return handle
                with mock.patch.object(Path, "open", autospec=True, side_effect=broken):
                    response = self.post()
                self.assertEqual(response.status_code, 503)
                self.assertNotIn("synthetic private disk details", response.get_data(as_text=True))
                runtime.replay_once()
                self.assertEqual(self.client.get("/health").status_code, 503)
                self.assertEqual(self.post().status_code, 200)
                self.assertEqual(self.client.get("/health").status_code, 200)
                runtime.replay_once()

    def test_replay_preserves_normalized_source_case_variants_and_age(self):
        for key, value in (("SOURCE", "LIVE"), ("Source", " live ")):
            with self.subTest(key=key):
                response = self.post({**self.packet, key: value})
                self.assertTrue(all(item["source"] == "live" for item in response.get_json()["readings"]))
                runtime = listener.get_runtime()
                runtime.replay_once()
                self.assertTrue(all(call.kwargs["json"]["metadata"]["verdant_source"] == "live"
                                    for call in self.requests.post.call_args_list))
                self.requests.post.reset_mock()
        self.post({**self.packet, "SOURCE": "LIVE"})
        self.now += listener.ECOWITT_LIVE_FRESHNESS + timedelta(microseconds=1)
        runtime.replay_once()
        self.assertTrue(all(call.kwargs["json"]["metadata"]["verdant_source"] == "stale"
                            for call in self.requests.post.call_args_list))

    def test_every_accepted_nonsecret_gateway_marker_survives_mapped_routing(self):
        for marker in sorted(listener.ECOWITT_GATEWAY_MARKERS - {"dateutc"}):
            with self.subTest(marker=marker):
                packet = {"dateutc": self.packet["dateutc"], marker: "synthetic-marker", "temp1f": "77", "humidity1": "50"}
                response = self.post(packet)
                self.assertEqual(response.get_json()["readings"][0]["source"], "live")
                listener.get_runtime().replay_once()
                forwarded = self.requests.post.call_args.kwargs["json"]
                self.assertEqual(forwarded["metadata"]["verdant_source"], "live")
                self.assertEqual(forwarded["metadata"]["raw_payload"][marker], "synthetic-marker")
                self.assertGreaterEqual(len(set(k.lower() for k in forwarded["metadata"]["raw_payload"]) & listener.ECOWITT_GATEWAY_MARKERS), 2)
                self.requests.post.reset_mock()

    def test_invalid_owned_empty_packets_fail_health_and_absence_does_not(self):
        runtime = listener.get_runtime()
        common = {k: v for k, v in self.packet.items() if k in ("PASSKEY", "model", "stationtype", "dateutc")}
        self.post(common)
        self.assertIsNone(runtime.health.data["tents"][TENT_A]["first_forward_failure_at"])
        for fields in ({"humidity1": "0"}, {"humidity1": "100"}, {"temp1f": "malformed"}):
            with self.subTest(fields=fields):
                response = self.post({**common, **fields})
                self.assertEqual(response.get_json()["forward"]["entry_count"], 0)
                self.assertIsNotNone(runtime.health.data["tents"][TENT_A]["first_forward_failure_at"])
        self.now += timedelta(minutes=10)
        common["dateutc"] = self.now.strftime("%Y-%m-%d %H:%M:%S")
        self.post({**common, "humidity1": "0", "temp2f": "80"})
        runtime.replay_once()  # another tent's success cannot hide invalid data
        self.assertEqual(self.client.get("/health").status_code, 503)
        listener._RUNTIME = None
        restored = listener.get_runtime()
        self.assertEqual(self.client.get("/health").status_code, 503)
        self.post({**common, "temp1f": "77", "humidity1": "50"})
        restored.replay_once()
        self.assertEqual(self.client.get("/health").status_code, 200)

    def test_orphaned_queue_is_unhealthy_until_same_tent_is_restored_and_delivered(self):
        self.post()
        old = listener.get_runtime()
        entry = next(e for e in old.spool.entries.values() if e["reading"]["metadata"]["tent_id"] == TENT_A)
        identity = (entry["id"], entry["idempotency_key"], entry["reading"]["captured_at"])
        original_map = self.mapping.read_text()
        self.mapping.write_text(json.dumps([json.loads(original_map)[1]]))
        listener._RUNTIME = None
        runtime = listener.get_runtime()
        runtime.replay_once()
        self.assertEqual(self.requests.post.call_count, 1)
        self.assertEqual(self.requests.post.call_args.kwargs["json"]["tent_id"], TENT_B)
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 503)
        self.assertIn("orphaned_queue", response.get_json()["reasons"])
        self.assertNotIn(TENT_A, response.get_data(as_text=True))
        self.assertIn("orphaned_queue", self.client.get("/status").get_json()["reasons"])
        listener._RUNTIME = None
        runtime = listener.get_runtime()
        queued = runtime.spool.entries[identity[0]]
        self.assertEqual((queued["id"], queued["idempotency_key"], queued["reading"]["captured_at"]), identity)
        self.assertEqual(self.client.get("/health").status_code, 503)
        self.mapping.write_text(original_map)
        listener._RUNTIME = None
        runtime = listener.get_runtime()
        self.now += timedelta(seconds=61)
        runtime.replay_once()
        self.assertEqual(runtime.spool.pending_count, 0)
        self.assertEqual(self.client.get("/health").status_code, 200)

    def test_all_passkey_case_values_are_redacted_in_mapped_and_legacy_delivery(self):
        secrets = ("synthetic-first-passkey", "synthetic-second-passkey")
        for mapped in (True, False):
            with self.subTest(mapped=mapped):
                if not mapped:
                    os.environ.pop("ECOWITT_TENT_MAP")
                    os.environ.update(VERDANT_TENT_ID=TENT_A, VERDANT_BRIDGE_TOKEN=TOKEN_A)
                packet = {**self.packet, "PASSKEY": secrets[0], "passkey": secrets[1],
                          "echo": {"nested": list(secrets)}, "runtime": "prefix " + secrets[1]}
                with mock.patch("builtins.print") as logs:
                    response = self.post(packet)
                    listener.get_runtime().replay_once()
                combined = response.get_data(as_text=True) + str(logs.call_args_list)
                combined += json.dumps([call.kwargs.get("json") for call in self.requests.post.call_args_list])
                combined += self.client.get("/status").get_data(as_text=True)
                for path in self.root.rglob("*"):
                    if path.is_file() and path != self.mapping:
                        combined += path.read_text()
                for secret in secrets:
                    self.assertNotIn(secret, combined)

    def test_blocked_single_tent_config_is_unhealthy_but_unconfigured_mode_is_allowed(self):
        os.environ.pop("ECOWITT_TENT_MAP")
        os.environ["VERDANT_BRIDGE_TOKEN"] = TOKEN_A
        for tent_id, reason in (("", "blocked_missing_tent_id"), ("private-placeholder", "blocked_invalid_tent_id")):
            with self.subTest(reason=reason):
                os.environ["VERDANT_TENT_ID"] = tent_id
                self.assertEqual(self.post().get_json()["forward"]["reason"], reason)
                runtime = listener.get_runtime()
                runtime.replay_once()
                health = self.client.get("/health")
                self.assertEqual(health.status_code, 503)
                self.assertIn(reason, health.get_json()["reasons"])
                self.assertNotIn("private-placeholder", health.get_data(as_text=True))
                self.assertEqual(self.client.get("/livez").status_code, 200)
        os.environ.pop("VERDANT_BRIDGE_TOKEN")
        self.assertEqual(self.post().get_json()["forward"]["reason"], "no_forwarding_configured")
        self.assertEqual(self.client.get("/health").status_code, 200)
        self.requests.post.assert_not_called()

    def test_pre_enqueue_write_failure_latches_until_that_path_recovers(self):
        runtime = listener.get_runtime()
        packet = {**self.packet, "unknown": 5}
        with mock.patch.object(runtime.health, "unmapped", side_effect=OSError("synthetic private error")):
            self.assertEqual(self.post(packet).status_code, 503)
        runtime.replay_once()
        self.assertEqual(self.client.get("/health").status_code, 503)
        self.assertEqual(self.post().status_code, 200)  # no unmapped append to prove repair
        self.assertEqual(self.client.get("/health").status_code, 503)
        self.assertEqual(self.post(packet).status_code, 200)
        self.assertEqual(self.client.get("/health").status_code, 200)
        with mock.patch.object(listener, "append_raw_log", side_effect=ValueError("synthetic private error")):
            response = self.post()
            self.assertEqual(response.status_code, 503)
            self.assertNotIn("synthetic private error", response.get_data(as_text=True))
        runtime.replay_once()
        self.assertEqual(self.client.get("/health").status_code, 503)
        self.assertEqual(self.post().status_code, 200)
        self.assertEqual(self.client.get("/health").status_code, 200)
    def test_newer_success_cannot_hide_an_older_outstanding_failure(self):
        runtime = listener.get_runtime()
        runtime.health.packet_received()
        def reading(value):
            return {"captured_at": NOW.isoformat(), "source": "live", "metrics": {"temp_f": value},
                    "metadata": {"raw_payload": self.packet}}
        old = runtime.enqueue(reading(70), TENT_A)
        newer = runtime.enqueue(reading(80), TENT_A)
        runtime.finish(old, {"status_code": 503})
        failed_at = runtime.health.data["tents"][TENT_A]["first_forward_failure_at"]
        self.now += timedelta(minutes=10)
        runtime.health.packet_received()
        runtime.finish(newer, {"status_code": 200})
        self.assertEqual(runtime.health.data["tents"][TENT_A]["first_forward_failure_at"], failed_at)
        self.assertIsNotNone(runtime.health.data["tents"][TENT_A]["last_forward_ok_at"])
        self.assertEqual(self.client.get("/health").status_code, 503)
        listener._RUNTIME = None
        restored = listener.get_runtime()
        self.assertIn(old, restored.spool.entries)
        self.assertEqual(self.client.get("/health").status_code, 503)
        restored.finish(old, {"status_code": 200})
        self.assertIsNone(restored.health.data["tents"][TENT_A]["first_forward_failure_at"])
        self.assertEqual(self.client.get("/health").status_code, 200)

    def test_mapped_enqueue_failure_stays_unhealthy_until_a_durable_enqueue(self):
        runtime = listener.get_runtime()
        for error in (OSError("synthetic private failure"), ValueError("synthetic private failure")):
            with self.subTest(error=type(error)):
                with mock.patch.object(runtime.spool, "enqueue", side_effect=error):
                    response = self.post()
                    self.assertEqual(response.status_code, 503)
                    self.assertNotIn("synthetic private failure", response.get_data(as_text=True))
                    runtime.replay_once()  # an empty read is not a successful write probe
                    self.assertEqual(self.client.get("/health").status_code, 503)
                self.assertEqual(self.post().status_code, 200)
                self.assertEqual(self.client.get("/health").status_code, 200)
                runtime.replay_once()

    def test_duplicate_enqueue_noop_cannot_clear_failed_write_latch(self):
        runtime = listener.get_runtime()
        self.assertEqual(self.post().status_code, 200)
        distinct = {**self.packet, "temp1f": "71.9"}
        with mock.patch.object(runtime.spool, "enqueue", side_effect=OSError("synthetic private failure")):
            self.assertEqual(self.post(distinct).status_code, 503)
        self.assertEqual(runtime.last_enqueue_error, "local_delivery_state_error")

        self.assertEqual(self.post().status_code, 200)
        self.assertEqual(runtime.last_enqueue_error, "local_delivery_state_error")
        self.assertEqual(self.client.get("/health").status_code, 503)

        self.assertEqual(self.post(distinct).status_code, 200)
        self.assertIsNone(runtime.last_enqueue_error)
        self.assertEqual(self.client.get("/health").status_code, 200)

    def test_empty_replay_cannot_clear_failed_finish_latch(self):
        self.mapping.write_text(json.dumps([json.loads(self.mapping.read_text())[0]]))
        self.assertEqual(self.post().status_code, 200)
        runtime = listener.get_runtime()
        entry = next(iter(runtime.spool.entries.values()))

        def fail_after_scheduling_retry(entry_id, _status):
            queued = runtime.spool.entries[entry_id]
            queued["attempts"] += 1
            queued["next_attempt_at"] = (self.now + timedelta(minutes=5)).isoformat()
            raise OSError("synthetic private failure")

        with mock.patch.object(runtime.spool, "finish", side_effect=fail_after_scheduling_retry):
            with self.assertRaises(OSError):
                runtime.replay_once()
        runtime.last_local_error = "local_delivery_state_error"
        runtime.replay_once()
        self.assertEqual(runtime.last_local_error, "local_delivery_state_error")
        self.assertEqual(self.client.get("/health").status_code, 503)

        self.now += timedelta(minutes=6)
        runtime.replay_once()
        self.assertIsNone(runtime.last_local_error)
        self.assertNotIn(entry["id"], runtime.spool.entries)
        self.assertEqual(self.client.get("/health").status_code, 200)

    def test_absent_mapped_tent_metrics_are_local_diagnostics_not_dead_letters(self):
        packet = {k: v for k, v in self.packet.items() if not k.endswith("2") and k != "temp2f"}
        response = self.post(packet)
        self.assertEqual(response.status_code, 200)
        forward = response.get_json()["forward"]
        self.assertEqual(forward["entry_count"], 1)
        self.assertEqual(forward["skipped_empty_count"], 1)
        runtime = listener.get_runtime()
        runtime.replay_once()
        self.assertEqual(self.requests.post.call_count, 1)
        self.assertEqual(self.requests.post.call_args.kwargs["json"]["tent_id"], TENT_A)
        self.assertEqual(runtime.spool.stats["dead_letter_count"], 0)
        empty = {k: v for k, v in self.packet.items() if k in ("PASSKEY", "model", "stationtype", "dateutc")}
        response = self.post(empty)
        self.assertFalse(response.get_json()["forward"]["queued"])
        self.assertEqual(response.get_json()["forward"]["reason"], "no_deliverable_metrics")
        self.assertEqual(response.get_json()["forward"]["entry_count"], 0)
        self.assertTrue(all(item["source"] == "invalid" for item in response.get_json()["readings"]))

    def test_mapped_batch_acknowledgement_counts_only_surviving_entries(self):
        self.post()
        runtime = listener.get_runtime()
        runtime.replay_once()
        original = runtime.enqueue
        calls = 0
        def enqueue(*args):
            nonlocal calls
            calls += 1
            key = original(*args)
            if calls == 2:
                # Exercise actual oldest-first cap eviction after the batch grows.
                runtime.spool._compact()
                runtime.spool.max_bytes = runtime.spool._disk_bytes() - 1
                runtime.spool.enforce_limits()
            return key
        with mock.patch.object(runtime, "enqueue", side_effect=enqueue):
            response = self.post()
        forward = response.get_json()["forward"]
        self.assertEqual(runtime.spool.pending_count, 1)
        self.assertFalse(forward["queued"])
        self.assertEqual(forward["entry_count"], 1)
        self.assertEqual(forward["dropped_count"], 1)
        self.assertEqual(forward["reason"], "spool_capacity_drop")
    def test_listener_uses_the_effective_pure_field_map(self):
        import ecowitt_multitent
        self.assertIs(listener.FIELD_MAP, ecowitt_multitent.FIELD_MAP)

    def test_single_tent_conflicting_case_fields_never_select_a_healthy_metric(self):
        os.environ.pop("ECOWITT_TENT_MAP")
        os.environ.update(VERDANT_TENT_ID=TENT_A, VERDANT_BRIDGE_TOKEN=TOKEN_A)
        for variants in ({"TEMP1F": 70, "temp1f": 90}, {"temp1f": 90, "TEMP1F": 70},
                         {"TEMP1F": "70", "temp1f": 70}, {"TEMP1F": 70, "temp1f": 70.0}):
            with self.subTest(variants=variants):
                packet = {**self.packet, "tempf": 88}
                packet.pop("temp1f")
                packet.update(variants)
                metrics = listener.normalize_metrics(packet)
                self.assertIsNone(metrics["temp_f"])
                self.assertEqual(listener.resolve_source(packet, "198.51.100.2", "", "", now=NOW), "invalid")
                response = self.post(packet)
                self.assertEqual(response.status_code, 200)
                forwarded = self.requests.post.call_args.kwargs["json"]
                self.assertIsNone(forwarded["metrics"]["temp_f"])
                self.assertEqual(forwarded["metadata"]["verdant_source"], "invalid")
                self.assertEqual(listener.get_runtime().spool.pending_count, 0)

    def test_identical_case_variants_preserve_legacy_candidates_and_provenance(self):
        packet = {**self.packet, "TEMP1F": "77", "tempf": "90"}
        self.assertEqual(listener.normalize_metrics(packet)["temp_f"], 77)
        self.assertEqual(listener.resolve_source(packet, "198.51.100.2", "", "", now=NOW), "live")
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.now = NOW
        self.mapping = self.root / "map.json"
        self.mapping.write_text(json.dumps([tent(air_channels=[1], soil_channels=[1], soil_temp_channels=[1]),
            tent(TENT_B, "TOKEN_B", air_channels=[2], soil_channels=[2], soil_temp_channels=[2], co2=False)]))
        self.env = {"ECOWITT_TENT_MAP": str(self.mapping), "ECOWITT_SPOOL_DIR": str(self.root / "spool"),
                    "VERDANT_INGEST_URL": "https://example.invalid/functions/v1/sensor-ingest-webhook",
                    "TOKEN_A": TOKEN_A, "TOKEN_B": TOKEN_B}
        patches = [mock.patch.dict(os.environ, self.env, clear=True),
                   mock.patch.object(listener, "LOG_PATH", self.root / "raw.jsonl"),
                   mock.patch.object(listener, "_utc_now", side_effect=lambda: self.now),
                   mock.patch.object(listener, "_RUNTIME", None, create=True),
                   mock.patch.object(listener, "_RUNTIME_KEY", None, create=True),
                   mock.patch.object(listener, "requests")]
        for patch in patches:
            value = patch.start()
            self.addCleanup(patch.stop)
            if patch is patches[-1]:
                self.requests = value
        self.requests.post.return_value.status_code = 200
        self.client = listener.app.test_client()
        self.packet = {"PASSKEY": "synthetic-gateway-passkey", "stationtype": "GW-synthetic", "model": "GW",
                       "dateutc": "2026-09-28 12:00:00", "temp1f": "77", "humidity1": "50",
                       "temp2f": "80", "humidity2": "60", "soilmoisture1": "30", "soilmoisture2": "40"}

    def post(self, packet=None):
        return self.client.post("/ecowitt", json=self.packet if packet is None else packet,
                                environ_overrides={"REMOTE_ADDR": "198.51.100.2"})

    def test_case_insensitive_legacy_field_lookup(self):
        self.assertEqual(listener.normalize_metrics({"TEMP1F": "77", "HUMIDITY1": "55"})["temp_f"], 77)

    def test_repeated_jwt_prefixes_cannot_stall_redaction(self):
        # A gateway request can carry up to 64 KiB. Check both disk and debug
        # redaction in a bounded child, so a regression cannot hang this suite.
        script = (
            "from ecowitt_multitent import sanitize; "
            "from ecowitt_listener import _scrub_inline_secrets; "
            "value = 'eyJ' * 20000; "
            "assert sanitize(value) == value; "
            "assert _scrub_inline_secrets(value) == value"
        )
        subprocess.run([sys.executable, "-c", script], cwd=Path(__file__).parent,
                       timeout=5, check=True, capture_output=True, text=True)

    def test_stuck_percent_is_invalid_even_on_fresh_physical_packet(self):
        for field in ("humidity1", "humidity8", "soilmoisture1", "soilmoisture8"):
            for value in ("0", "100"):
                raw = {**self.packet, field: value}
                self.assertEqual(listener.resolve_source(raw, "198.51.100.2", "", "", now=NOW), "invalid")

    def test_celsius_only_never_becomes_fahrenheit(self):
        self.assertIsNone(listener.normalize_metrics({"temp1c": "25", "temp": "77"})["temp_f"])

    def test_gateway_packet_is_spooled_before_any_request(self):
        response = self.post()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(listener.get_runtime().spool.pending_count, 2)
        self.requests.post.assert_not_called()

    def test_one_post_per_tent_with_own_token_and_exact_time(self):
        self.post()
        listener.get_runtime().replay_once()
        self.assertEqual(self.requests.post.call_count, 2)
        for call, tent_id, token in zip(self.requests.post.call_args_list, (TENT_A, TENT_B), (TOKEN_A, TOKEN_B)):
            payload, headers = call.kwargs["json"], call.kwargs["headers"]
            self.assertEqual(payload["tent_id"], tent_id)
            self.assertEqual(headers["x-verdant-tent-id"], tent_id)
            self.assertEqual(headers["Authorization"], "Bearer " + token)
            self.assertEqual(payload["captured_at"], "2026-09-28T12:00:00Z")
            self.assertFalse(call.kwargs["allow_redirects"])
        self.assertEqual(listener.get_runtime().spool.pending_count, 0)

    def test_token_is_resolved_at_send_time_and_never_spooled(self):
        self.post()
        rotated = "vbt_" + "synthetic-rotated-" * 3
        os.environ["TOKEN_A"] = rotated
        listener.get_runtime().replay_once()
        self.assertEqual(self.requests.post.call_args_list[0].kwargs["headers"]["Authorization"], "Bearer " + rotated)
        for path in (self.root / "spool").glob("*"):
            self.assertNotIn(rotated, path.read_text())

    def test_restart_replay_is_stale_original_timestamp_and_idempotency(self):
        self.post()
        self.requests.post.return_value.status_code = 503
        listener.get_runtime().replay_once()
        first_keys = [call.kwargs["headers"]["Idempotency-Key"] for call in self.requests.post.call_args_list]
        listener._RUNTIME = None
        self.now += timedelta(hours=2)
        self.requests.post.reset_mock()
        self.requests.post.return_value.status_code = 200
        listener.get_runtime().replay_once()
        for call in self.requests.post.call_args_list:
            self.assertEqual(call.kwargs["json"]["captured_at"], "2026-09-28T12:00:00Z")
            self.assertEqual(call.kwargs["json"]["metadata"]["verdant_source"], "stale")
            self.assertIn(call.kwargs["headers"]["Idempotency-Key"], first_keys)

    def test_unmapped_not_forwarded_and_warning_only_once_per_key(self):
        self.packet["unknown_channel"] = "123"
        with mock.patch("builtins.print") as logs:
            self.post()
            self.post()
            listener.get_runtime().replay_once()
        self.assertEqual(listener.get_runtime().health.data["unmapped_counts"]["unknown_channel"], 2)
        self.assertEqual(sum("seen but not mapped" in str(call) for call in logs.call_args_list), 1)
        for call in self.requests.post.call_args_list:
            self.assertNotIn("unknown_channel", call.kwargs["json"]["metadata"]["raw_payload"])

    def test_invalid_one_tent_does_not_taint_other(self):
        self.packet["humidity1"] = "0"
        self.post()
        listener.get_runtime().replay_once()
        self.assertEqual(self.requests.post.call_args_list[0].kwargs["json"]["metadata"]["verdant_source"], "invalid")
        self.assertEqual(self.requests.post.call_args_list[1].kwargs["json"]["metadata"]["verdant_source"], "live")

    def test_no_token_passkey_or_auth_in_spool_logs_status_or_public_ack(self):
        self.packet["echo"] = "prefix " + TOKEN_A
        with mock.patch("builtins.print") as logs:
            response = self.post()
            listener.get_runtime().replay_once()
        combined = json.dumps(response.get_json()) + str(logs.call_args_list)
        combined += self.client.get("/status").get_data(as_text=True)
        for path in self.root.rglob("*"):
            if path.is_file() and path != self.mapping:
                combined += path.read_text()
        for secret in (TOKEN_A, TOKEN_B, "synthetic-gateway-passkey"):
            self.assertNotIn(secret, combined)
        self.assertNotIn("Bearer ", combined)

    def test_status_is_local_only_and_contains_persisted_counters(self):
        self.post({**self.packet, "unmapped_key": "7"})
        body = self.client.get("/status").get_json()
        self.assertEqual(body["unmapped_counts"]["unmapped_key"], 1)
        remote = self.client.get("/status", environ_overrides={"REMOTE_ADDR": "198.51.100.3"})
        self.assertEqual(remote.status_code, 403)

    def test_health_quiet_stays_live_without_claiming_delivery_is_healthy(self):
        self.post()
        self.now += timedelta(minutes=11)
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.get_json()["ok"])
        self.assertIn("gateway_quiet", response.get_json()["reasons"])
        self.packet["dateutc"] = "2026-09-28 12:11:00"
        self.post()
        self.assertEqual(self.client.get("/health").status_code, 200)

    def test_health_without_initial_traffic_stays_live_but_reports_quiet(self):
        listener.get_runtime()
        self.now += timedelta(minutes=11)
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.get_json()["ok"])
        self.assertEqual(response.get_json()["reasons"], ["gateway_quiet"])
        self.requests.post.assert_not_called()

    def test_quiet_does_not_hide_a_sustained_forward_failure(self):
        runtime = listener.get_runtime()
        runtime.health.forward_result(TENT_A, False)
        self.now += timedelta(minutes=11)
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.get_json()["reasons"], ["forward_failure", "gateway_quiet"])

    def test_livez_is_200_when_health_is_503_for_delivery_failure(self):
        runtime = listener.get_runtime()
        runtime.health.forward_result(TENT_A, False)
        self.now += timedelta(minutes=11)
        self.assertEqual(self.client.get("/health").status_code, 503)
        response = self.client.get("/livez")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()["alive"])

    def test_livez_is_200_after_restart_with_persisted_failure(self):
        listener.get_runtime().health.forward_result(TENT_A, False)
        self.now += timedelta(minutes=11)
        listener._RUNTIME = None  # simulate a process restart; health state reloads from disk
        self.assertEqual(self.client.get("/health").status_code, 503)
        self.assertEqual(self.client.get("/livez").status_code, 200)

    def test_livez_is_200_before_any_runtime_exists_and_on_local_error(self):
        self.assertEqual(self.client.get("/livez").status_code, 200)
        runtime = listener.get_runtime()
        runtime.last_local_error = "local_delivery_state_error"
        self.assertEqual(self.client.get("/health").status_code, 503)
        self.assertEqual(self.client.get("/livez").status_code, 200)

    def test_livez_reports_worker_state_without_failing(self):
        runtime = listener.get_runtime()
        self.assertIsNone(runtime.thread)
        body = self.client.get("/livez").get_json()
        self.assertFalse(body["replay_worker_alive"])

    def test_dead_replay_worker_is_replaced_once_started(self):
        runtime = listener.get_runtime()
        self.addCleanup(lambda: runtime.stop_event.set())
        runtime.start()
        first = runtime.thread
        runtime.stop_event.set()
        first.join(timeout=5)
        self.assertFalse(first.is_alive())
        runtime.stop_event = __import__("threading").Event()  # runtime still running; only the worker died
        with mock.patch("builtins.print"):
            self.assertTrue(runtime.ensure_worker())
        self.assertIsNot(runtime.thread, first)
        self.assertTrue(runtime.thread.is_alive())
        self.assertEqual(runtime.worker_restarts, 1)
        self.assertFalse(runtime.ensure_worker())  # alive worker: no restart loop

    def test_worker_is_not_started_by_health_if_never_started(self):
        runtime = listener.get_runtime()
        self.assertFalse(runtime.ensure_worker())
        self.client.get("/health")
        self.assertIsNone(runtime.thread)

    def test_stopped_runtime_does_not_restart_worker(self):
        runtime = listener.get_runtime()
        runtime.start()
        runtime.stop_event.set()
        runtime.thread.join(timeout=5)
        with mock.patch("builtins.print"):
            self.assertFalse(runtime.ensure_worker())

    def test_invalid_or_future_timestamp_never_enters_spool(self):
        for value in (None, "garbage", "2026-09-28 12:06:00"):
            response = self.post({**self.packet, "dateutc": value})
            self.assertEqual(response.get_json()["forward"]["reason"], "invalid_gateway_timestamp")
        self.assertEqual(listener.get_runtime().spool.pending_count, 0)

    def test_bad_timestamp_traffic_does_not_mask_sustained_delivery_failure(self):
        bad = {**self.packet, "dateutc": "garbage"}
        self.post(bad)
        self.now += timedelta(minutes=11)
        self.post(bad)
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.get_json()["reasons"], ["forward_failure"])
        self.assertEqual(listener.get_runtime().spool.pending_count, 0)
        self.requests.post.assert_not_called()

    def test_legacy_single_tent_candidate_order_preserved_and_buffered(self):
        os.environ.pop("ECOWITT_TENT_MAP")
        os.environ.update(VERDANT_TENT_ID=TENT_A, VERDANT_BRIDGE_TOKEN=TOKEN_A)
        self.post({**self.packet, "tempf": "85", "tempinf": "86"})
        self.assertEqual(self.requests.post.call_count, 1)
        self.assertEqual(self.requests.post.call_args.kwargs["json"]["metrics"]["temp_f"], 77)
        self.assertEqual(listener.get_runtime().spool.pending_count, 0)

    def test_single_tent_ingest_is_durable_while_replay_send_lock_is_busy(self):
        os.environ.pop("ECOWITT_TENT_MAP")
        os.environ.update(VERDANT_TENT_ID=TENT_A, VERDANT_BRIDGE_TOKEN=TOKEN_A)
        runtime = listener.get_runtime()
        held, release = threading.Event(), threading.Event()
        def hold():
            with runtime.send_lock:
                held.set()
                release.wait(2)
        worker = threading.Thread(target=hold)
        worker.start()
        try:
            self.assertTrue(held.wait(1))
            response = self.post()
            self.assertEqual(response.status_code, 200)
            self.assertEqual(runtime.spool.pending_count, 1)
            self.assertTrue((self.root / "spool" / "queue.jsonl").read_text())
            self.requests.post.assert_not_called()
        finally:
            release.set()
            worker.join(2)
        runtime.replay_once()
        self.assertEqual(self.requests.post.call_count, 1)
        self.assertEqual(runtime.spool.pending_count, 0)

    def test_public_health_omits_private_tents_and_local_status_retains_them(self):
        self.post()
        runtime = listener.get_runtime()
        runtime.replay_once()
        response = self.client.get("/health", environ_overrides={"REMOTE_ADDR": "198.51.100.2"})
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("tents", response.get_json())
        self.assertNotIn(TENT_A, response.get_data(as_text=True))
        self.assertEqual(self.client.get("/status", environ_overrides={"REMOTE_ADDR": "198.51.100.2"}).status_code, 403)
        status = self.client.get("/status", environ_overrides={"REMOTE_ADDR": "127.0.0.1"}).get_json()
        self.assertIn(TENT_A, status["tents"])

    def test_bad_startup_map_is_sanitized_and_does_not_fall_back(self):
        self.mapping.write_text('{"private": "do-not-echo"}')
        with self.assertRaises(ValueError) as caught:
            listener.get_runtime()
        self.assertNotIn("do-not-echo", str(caught.exception))
        self.requests.post.assert_not_called()

    def test_out_of_calendar_retention_is_rejected_without_echoing_configuration(self):
        os.environ["ECOWITT_SPOOL_MAX_DAYS"] = "1000000"
        with self.assertRaises(ValueError) as caught:
            listener.get_runtime()
        self.assertIn("ECOWITT_SPOOL_MAX_DAYS", str(caught.exception))
        self.assertNotIn("1000000", str(caught.exception))
        self.requests.post.assert_not_called()

    def test_spool_write_failure_sends_nothing_and_returns_503(self):
        runtime = listener.get_runtime()
        with mock.patch.object(runtime.spool, "enqueue", side_effect=OSError("unsafe-private-error")):
            response = self.post()
        self.assertEqual(response.status_code, 503)
        self.requests.post.assert_not_called()
        self.assertNotIn("unsafe-private-error", response.get_data(as_text=True))

    def test_alert_payload_adapters_do_not_send_sensor_values_or_urls(self):
        message = {"event": "alert", "reason": "gateway_quiet", "message": "Ecowitt listener quiet"}
        for provider in ("generic", "slack", "discord", "ntfy"):
            with mock.patch.dict(os.environ, {"ECOWITT_ALERT_FORMAT": provider, "ECOWITT_ALERT_WEBHOOK_URL": "https://example.invalid/alerts", "ECOWITT_ALERT_NTFY_TOPIC": "test-topic"}):
                listener.send_listener_alert(message)
                body = self.requests.post.call_args.kwargs["json"]
                self.assertNotIn("temp_f", json.dumps(body))
                self.assertNotIn("https://", json.dumps(body))
                self.assertIn({"generic": "message", "slack": "text", "discord": "content", "ntfy": "topic"}[provider], body)

    def test_no_alert_webhook_means_log_only_no_network(self):
        listener.send_listener_alert({"event": "alert", "reason": "gateway_quiet", "message": "quiet"})
        self.requests.post.assert_not_called()

    def test_network_exception_credentials_never_reach_stats_or_status(self):
        self.post()
        self.requests.post.side_effect = RuntimeError("unsafe echo " + TOKEN_A)
        listener.get_runtime().replay_once()
        body = json.dumps(listener.FORWARD_STATS) + self.client.get("/debug/forwarding-status").get_data(as_text=True)
        self.assertNotIn(TOKEN_A, body)
        self.assertEqual(listener.get_runtime().spool.pending_count, 2)

    def test_passkey_echo_in_unknown_field_is_redacted_in_legacy_mode(self):
        os.environ.pop("ECOWITT_TENT_MAP")
        os.environ.update(VERDANT_TENT_ID=TENT_A, VERDANT_BRIDGE_TOKEN=TOKEN_A)
        self.packet["echo"] = self.packet["PASSKEY"]
        self.post()
        for path in self.root.rglob("*"):
            if path.is_file() and path != self.mapping:
                self.assertNotIn(self.packet["PASSKEY"], path.read_text())

    def test_background_worker_sends_without_another_gateway_packet(self):
        import threading
        done = threading.Event()
        self.post()
        runtime = listener.get_runtime()
        def sent(*args, **kwargs):
            response = mock.Mock(status_code=200)
            done.set()
            return response
        self.requests.post.side_effect = sent
        runtime.interval = 0.01
        runtime.start()
        self.addCleanup(lambda: (runtime.stop_event.set(), runtime.thread.join(timeout=1)))
        runtime.start()
        self.assertTrue(done.wait(timeout=2))
        self.assertTrue(runtime.thread.is_alive())

    def test_dead_worker_is_replaced_and_drains_without_another_packet(self):
        self.post()
        runtime = listener.get_runtime()
        old = threading.Thread(target=lambda: None)
        old.start()
        old.join(timeout=1)
        self.assertFalse(old.is_alive())
        runtime.thread = old
        runtime.interval = 0.01
        drained = threading.Event()
        original = runtime.replay_once

        def replay():
            original()
            drained.set()

        with mock.patch.object(runtime, "replay_once", side_effect=replay):
            runtime.start()
            self.addCleanup(lambda: (runtime.stop_event.set(), runtime.thread.join(timeout=2)))
            self.assertIsNot(runtime.thread, old)
            self.assertTrue(drained.wait(timeout=2))
        self.assertEqual(runtime.spool.pending_count, 0)
        self.assertEqual(self.requests.post.call_count, 2)
        for call in self.requests.post.call_args_list:
            self.assertEqual(call.kwargs["json"]["captured_at"], "2026-09-28T12:00:00Z")

    def test_unexpected_worker_exception_is_redacted_then_replay_recovers(self):
        self.post()
        runtime = listener.get_runtime()
        saved_keys = {entry["idempotency_key"] for entry in runtime.spool.entries.values()}
        runtime.interval = 0.01
        waiting = threading.Event()
        allow_recovery = threading.Event()
        recovered = threading.Event()
        original = runtime.replay_once
        attempts = 0

        def replay():
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise RuntimeError("private failure " + TOKEN_A)
            waiting.set()
            if allow_recovery.wait(timeout=2):
                original()
                recovered.set()

        def stop():
            runtime.stop_event.set()
            allow_recovery.set()
            runtime.thread.join(timeout=2)

        with mock.patch.object(runtime, "replay_once", side_effect=replay), \
                mock.patch("builtins.print") as logs, mock.patch.object(threading, "excepthook") as hook:
            runtime.start()
            self.addCleanup(stop)
            self.assertTrue(waiting.wait(timeout=2))
            self.assertTrue(runtime.thread.is_alive())
            self.assertEqual(runtime.spool.pending_count, 2)
            self.assertEqual(runtime.last_local_error, "local_delivery_state_error")
            self.assertEqual(self.client.get("/health").status_code, 503)
            allow_recovery.set()
            self.assertTrue(recovered.wait(timeout=2))
            self.assertEqual(runtime.spool.pending_count, 0)
            self.assertEqual(self.client.get("/health").status_code, 200)
            hook.assert_not_called()
            self.assertNotIn(TOKEN_A, str(logs.call_args_list))
            self.assertNotIn("private failure", str(logs.call_args_list))
            runtime.stop_event.set()
            runtime.thread.join(timeout=2)
        self.assertEqual({call.kwargs["headers"]["Idempotency-Key"]
                          for call in self.requests.post.call_args_list}, saved_keys)

    def test_concurrent_starts_create_only_one_worker(self):
        runtime = listener.get_runtime()
        real_thread = threading.Thread
        barrier = threading.Barrier(8)

        def start():
            barrier.wait(timeout=2)
            runtime.start()

        with mock.patch.object(listener.threading, "Thread", wraps=real_thread) as constructor:
            callers = [real_thread(target=start) for _ in range(8)]
            for caller in callers:
                caller.start()
            for caller in callers:
                caller.join(timeout=2)
                self.assertFalse(caller.is_alive())
            self.addCleanup(lambda: (runtime.stop_event.set(), runtime.thread.join(timeout=2)))
            self.assertEqual(constructor.call_count, 1)
            self.assertTrue(runtime.thread.is_alive())
            runtime.start()
            self.assertEqual(constructor.call_count, 1)

    def test_retired_runtime_stop_event_is_never_cleared_or_restarted(self):
        runtime = listener.get_runtime()
        runtime.stop_event.set()
        with mock.patch.object(listener.threading, "Thread") as constructor:
            runtime.start()
        constructor.assert_not_called()
        self.assertIsNone(runtime.thread)
        self.assertTrue(runtime.stop_event.is_set())
        self.requests.post.assert_not_called()

    def test_unsupported_internal_payload_values_are_durably_contained(self):
        raw = {**self.packet, "temp1f": b"unsupported", "unknown": {"nested": object()}}
        with mock.patch.object(listener, "extract_payload", return_value=raw):
            response = self.post()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["readings"][0]["source"], "invalid")
        self.assertEqual(response.get_json()["readings"][1]["metrics"]["temp_f"], 80)
        runtime = listener.get_runtime()
        self.assertEqual(runtime.spool.pending_count, 2)
        self.requests.post.assert_not_called()
        listener._RUNTIME = None
        restored = listener.get_runtime()
        self.assertEqual(restored.spool.pending_count, 2)
        first = next(iter(restored.spool.entries.values()))
        self.assertIsNone(first["reading"]["metadata"]["raw_payload"]["temp1f"])
        for path in (self.root / "spool").glob("*.jsonl"):
            for line in path.read_text().splitlines():
                json.loads(line)

    def test_json_container_metric_is_invalid_without_blocking_other_tent(self):
        response = self.post({**self.packet, "temp1f": {"unexpected": ["shape"]}})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["readings"][0]["source"], "invalid")
        self.assertEqual(response.get_json()["readings"][1]["metrics"]["temp_f"], 80)
        self.assertEqual(listener.get_runtime().spool.pending_count, 2)
        self.requests.post.assert_not_called()

    def test_changed_secondary_values_at_same_time_are_not_coalesced_away(self):
        mapping = json.loads(self.mapping.read_text())
        mapping[0]["air_channels"] = [1, 3]
        self.mapping.write_text(json.dumps(mapping))
        self.packet["temp3f"] = "70"
        self.post()
        self.packet["temp3f"] = "71"
        self.post()
        runtime = listener.get_runtime()
        self.assertEqual(runtime.spool.pending_count, 3)
        runtime.replay_once()
        bodies = [call.kwargs["json"] for call in self.requests.post.call_args_list if call.kwargs["json"]["tent_id"] == TENT_A]
        self.assertEqual([body["metadata"]["channels"][0]["value"] for body in bodies], [70, 71])


    def test_livez_does_not_load_runtime_or_claim_delivery_readiness(self):
        with mock.patch.object(listener, "get_runtime", side_effect=ValueError("invalid local state")) as runtime:
            response = self.client.get("/livez")
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.get_json()["alive"])
            runtime.assert_not_called()
            self.assertEqual(self.client.get("/health").status_code, 503)
        self.requests.post.assert_not_called()


    def test_livez_stays_available_during_persisted_forward_failures_and_restart(self):
        for status in (401, None):
            with self.subTest(status=status):
                runtime = listener.get_runtime()
                self.post()
                self.requests.post.side_effect = OSError("synthetic network outage") if status is None else None
                self.requests.post.return_value.status_code = status
                runtime.replay_once()
                self.now += timedelta(minutes=10)
                failed_at = runtime.health.data["tents"][TENT_A]["first_forward_failure_at"]
                self.assertEqual(self.client.get("/health").status_code, 503)
                self.assertEqual(self.client.get("/livez").status_code, 200)
                with mock.patch.object(listener, "_RUNTIME", None):
                    restored = listener.get_runtime()
                    self.assertEqual(restored.health.data["tents"][TENT_A]["first_forward_failure_at"], failed_at)
                    self.assertEqual(self.client.get("/health").status_code, 503)
                    self.assertTrue(self.client.get("/livez").get_json()["alive"])
        self.assertEqual(self.requests.post.call_count, 4)


    def test_livez_stays_available_during_sustained_gateway_clock_skew(self):
        self.packet["dateutc"] = "2026-09-28 13:00:00"
        self.post()
        self.now += timedelta(minutes=10)
        self.post()
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 503)
        self.assertIn("forward_failure", response.get_json()["reasons"])
        self.assertTrue(self.client.get("/livez").get_json()["alive"])
        self.requests.post.assert_not_called()


    def test_supervisor_replaces_a_crashed_worker_without_another_gateway_packet(self):
        self.post()
        runtime = listener.get_runtime()
        runtime.interval = 0.01
        release_crash, delivered = threading.Event(), threading.Event()
        replay_once = runtime.replay_once
        first_call = True
        def replay():
            nonlocal first_call
            if first_call:
                first_call = False
                release_crash.wait(timeout=2)
                raise SystemExit("synthetic replay crash")
            replay_once()
            delivered.set()
        supervisor_wait = runtime.supervisor_stop_event.wait
        with mock.patch.object(runtime, "replay_once", side_effect=replay), mock.patch.object(threading, "excepthook"), mock.patch.object(runtime.supervisor_stop_event, "wait", side_effect=lambda timeout: supervisor_wait(0.01)):
            runtime.start()
            runtime.supervise()
            first_worker = runtime.thread
            first_worker_event = runtime.stop_event
            supervisor_event = runtime.supervisor_stop_event
            self.addCleanup(runtime.stop)
            release_crash.set()
            self.assertTrue(delivered.wait(timeout=2))
            self.assertIsNot(runtime.thread, first_worker)
            self.assertIsNot(runtime.stop_event, first_worker_event)
            self.assertIs(runtime.supervisor_stop_event, supervisor_event)
            self.assertTrue(runtime.thread.is_alive())
            self.assertEqual(runtime.spool.pending_count, 0)
            self.assertEqual(self.requests.post.call_count, 2)
            supervisor = runtime.supervisor_thread
            runtime.start()
            runtime.supervise()
            self.assertIs(runtime.supervisor_thread, supervisor)
            runtime.stop()
            supervisor.join(timeout=1)
            runtime.thread.join(timeout=1)
            self.assertFalse(supervisor.is_alive())
            self.assertFalse(runtime.thread.is_alive())


    def test_supervisor_does_not_restart_worker_after_shutdown_wins_the_check_race(self):
        runtime = listener.get_runtime()
        supervisor = None
        with mock.patch.object(listener.threading, "Thread") as thread:
            runtime.start()
            runtime.supervise()
            supervisor = thread.call_args.kwargs["target"]
        runtime.stop()
        with mock.patch.object(runtime.supervisor_stop_event, "wait", return_value=False), mock.patch.object(runtime, "start") as start:
            supervisor()
            start.assert_not_called()


    def test_supervisor_retries_a_failed_restart_without_echoing_exception_details(self):
        runtime = listener.get_runtime()
        with mock.patch.object(listener.threading, "Thread") as thread:
            runtime.start()
            runtime.supervise()
            supervise = thread.call_args.kwargs["target"]
        with mock.patch.object(runtime.supervisor_stop_event, "wait", side_effect=[False, False, True]), mock.patch.object(runtime, "ensure_worker", side_effect=[RuntimeError("private diagnostic"), None]) as start, mock.patch("builtins.print") as output:
            supervise()
            self.assertEqual(start.call_count, 2)
            self.assertEqual(runtime.last_local_error, "local_delivery_state_error")
            self.assertNotIn("private diagnostic", str(output.call_args_list))

    def test_worker_restart_rechecks_shutdown_after_acquiring_the_lock(self):
        runtime = listener.get_runtime()
        runtime.started = True
        runtime.thread = mock.Mock()
        runtime.thread.is_alive.return_value = False
        with mock.patch.object(runtime, "lock") as lock, mock.patch.object(runtime, "start") as start:
            lock.__enter__.side_effect = runtime.stop_event.set
            self.assertFalse(runtime.ensure_worker())
            start.assert_not_called()


    def test_runtime_replacement_stops_the_old_supervisor_and_worker(self):
        previous = listener.get_runtime()
        os.environ["ECOWITT_SPOOL_DIR"] = str(self.root / "replacement")
        self.assertIsNot(listener.get_runtime(), previous)
        self.assertTrue(previous.supervisor_stop_event.is_set())
        self.assertTrue(previous.stop_event.is_set())


    def test_main_starts_supervision_and_stops_it_when_the_server_exits(self):
        runtime = mock.Mock()
        with mock.patch.object(listener, "get_runtime", return_value=runtime), mock.patch.object(listener.app, "run") as run, mock.patch("builtins.print"):
            listener.main()
        runtime.supervise.assert_called_once()
        runtime.start.assert_called_once()
        runtime.stop.assert_called_once()
        run.assert_called_once_with(host="0.0.0.0", port=listener.PORT, debug=False)



if __name__ == "__main__":
    unittest.main()
