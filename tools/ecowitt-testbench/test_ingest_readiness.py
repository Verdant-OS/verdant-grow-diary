"""Listener integration with synthetic packets; no gateway or Verdant access."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import tempfile
import threading
import unittest
import unittest.mock as mock
from datetime import datetime, timedelta, timezone
from pathlib import Path

import ecowitt_listener as listener
from test_multitent import TENT_A, TENT_B, TOKEN_A, TOKEN_B, tent


NOW = datetime(2026, 9, 28, 12, tzinfo=timezone.utc)


class ListenerIntegrationTests(unittest.TestCase):
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
                raise RuntimeError("synthetic replay crash")
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
