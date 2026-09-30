"""Durable delivery/health proofs; all clocks and network sends are injected."""
from __future__ import annotations

import json
import tempfile
import threading
import unittest
import unittest.mock as mock
from datetime import datetime, timedelta, timezone
from pathlib import Path

from ecowitt_delivery import HealthState, JsonlSpool


class DeliveryFixture(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.now = datetime(2026, 9, 28, 12, tzinfo=timezone.utc)
        self.warnings = []
        self.clock = lambda: self.now

    def spool(self, **kwargs):
        return JsonlSpool(self.root, clock=self.clock, warn=self.warnings.append, **kwargs)

    def reading(self, value=77):
        return {"captured_at": "2026-09-28T12:00:00Z", "source": "live", "metrics": {"temp_f": value},
                "metadata": {"tent_id": "11111111-2222-3333-4444-555555555555", "raw_payload": {"dateutc": "2026-09-28 12:00:00"}}}


class DeliveryTests(DeliveryFixture):
    def test_crashed_health_replace_does_not_evict_acknowledged_queue_entries(self):
        spool = self.spool()
        spool.enqueue("old", self.reading())
        spool.enqueue("new", self.reading(78))
        health = HealthState(self.root / "state.json", [], clock=self.clock)
        committed_state = health.path.read_bytes()
        budget = spool._disk_bytes() + 32
        with mock.patch("ecowitt_delivery.os.replace", side_effect=RuntimeError("simulated interruption")):
            with self.assertRaises(RuntimeError):
                health._save()
        self.assertTrue((self.root / "state.json.tmp").exists())
        restored = self.spool(max_bytes=budget)
        self.assertEqual(list(restored.entries), ["old", "new"])
        self.assertEqual(restored.stats["dropped_count"], 0)
        self.assertEqual(health.path.read_bytes(), committed_state)
        HealthState(health.path, [], clock=self.clock)
        self.assertFalse((self.root / "state.json.tmp").exists())
        self.assertEqual(self.spool(max_bytes=budget).stats["dropped_count"], 0)

    def test_only_known_atomic_temporary_files_are_excluded_from_durable_budget(self):
        spool = self.spool()
        spool.enqueue("old", self.reading())
        durable_bytes = spool._disk_bytes()
        for name in ("queue.jsonl.tmp", "dead-letter.jsonl.tmp", "spool-stats.json.tmp",
                     "state.json.tmp", "unmapped_channels.jsonl.tmp"):
            (self.root / name).write_bytes(b"uncommitted temporary state" * 100)
        self.assertEqual(spool._disk_bytes(), durable_bytes)
        (self.root / "operator-backup.tmp").write_bytes(b"external state")
        self.assertEqual(spool._disk_bytes(), durable_bytes + len(b"external state"))
        restored = self.spool(max_bytes=durable_bytes + 64)
        self.assertEqual(list(restored.entries), ["old"])
        self.assertEqual(restored.stats["dropped_count"], 0)

    def test_failed_eviction_journal_keeps_live_and_durable_entries_until_retry(self):
        for limit in ("age", "size"):
            with self.subTest(limit=limit):
                spool = JsonlSpool(self.root / limit, clock=self.clock)
                spool.enqueue("old", self.reading())
                saved_bytes = spool.path.read_bytes()
                if limit == "age":
                    self.now += timedelta(days=8)
                else:
                    spool.max_bytes = 200
                with mock.patch("ecowitt_delivery.append_jsonl", side_effect=OSError("simulated disk full")), \
                        mock.patch.object(spool, "_compact", wraps=spool._compact) as compact:
                    with self.assertRaises(OSError):
                        spool.enforce_limits()
                    compact.assert_not_called()
                self.assertEqual(list(spool.entries), ["old"])
                self.assertEqual(spool.path.read_bytes(), saved_bytes)
                self.assertEqual(spool.stats["dropped_count"], 0)
                spool.max_days, spool.max_bytes = 1000, 50 * 1024 * 1024
                self.assertEqual([entry["id"] for entry in spool.due_entries()], ["old"])
                spool.finish("old", 200)
                restored = JsonlSpool(spool.root, clock=self.clock, max_days=1000)
                self.assertEqual(restored.pending_count, 0)
                self.assertEqual(restored.stats["dropped_count"], 0)

    def test_eviction_journal_survives_crashes_before_and_after_queue_rewrite(self):
        for limit in ("age", "size"):
            for phase in ("before", "after"):
                with self.subTest(limit=limit, phase=phase):
                    root = self.root / (limit + phase)
                    spool = JsonlSpool(root, clock=self.clock, warn=self.warnings.append)
                    spool.enqueue("old", self.reading())
                    if limit == "age":
                        self.now += timedelta(days=8)
                    else:
                        spool.max_bytes = 200
                    compact = spool._compact
                    def interrupted():
                        if phase == "after":
                            compact()
                        raise RuntimeError("simulated process interruption")
                    with mock.patch.object(spool, "_compact", side_effect=interrupted):
                        with self.assertRaises(RuntimeError):
                            spool.enforce_limits()
                    restored = JsonlSpool(root, clock=self.clock, max_days=1000)
                    self.assertEqual(restored.pending_count, 0)
                    self.assertEqual(restored.stats["dropped_count"], 1)
                    again = JsonlSpool(root, clock=self.clock, max_days=1000)
                    self.assertEqual(again.stats["dropped_count"], 1)
                    health = HealthState(root / "state.json", [], clock=self.clock,
                                         spool_drops=lambda: again.stats["dropped_count"])
                    self.assertIn("spool_data_drop", health.status()["reasons"])

    def test_torn_eviction_journal_retains_entries_without_reporting_a_committed_drop(self):
        spool = self.spool()
        spool.enqueue("old", self.reading())
        with spool.path.open("ab") as handle:
            handle.write(b'{"op":"drop","ids":["old"]')
        restored = self.spool()
        self.assertEqual(list(restored.entries), ["old"])
        self.assertEqual(restored.stats["dropped_count"], 0)
        self.assertEqual(restored.stats["torn_tail_count"], 1)

    def test_invalid_eviction_journal_fails_closed_without_echoing_payload(self):
        for record in ({"op": "drop", "ids": "do-not-print", "dropped_count": 1},
                       {"op": "drop", "ids": ["old"], "dropped_count": -1},
                       {"op": "drop", "ids": ["old"], "dropped_count": True},
                       {"op": "drop_checkpoint", "dropped_count": "do-not-print"}):
            with self.subTest(record=record):
                (self.root / "queue.jsonl").write_text(json.dumps(record) + "\n", encoding="utf-8")
                with self.assertRaises(ValueError) as caught:
                    self.spool()
                self.assertNotIn("do-not-print", str(caught.exception))

    def test_auxiliary_budget_is_reclaimed_before_pending_entries(self):
        spool = self.spool()
        for n in range(2):
            spool.enqueue(str(n), self.reading(n))
        for path in (spool.dead_path, self.root / "unmapped_channels.jsonl"):
            path.write_text("".join(json.dumps({"recorded_at": self.now.isoformat(), "value": "x" * 200}) + "\n"
                                    for _ in range(8)), encoding="utf-8")
        spool.max_bytes = 2300
        with mock.patch.object(spool, "_compact", wraps=spool._compact) as compact:
            spool.enforce_limits()
            self.assertLessEqual(compact.call_count, 1)
        self.assertEqual(list(spool.entries), ["0", "1"])
        self.assertEqual(spool.stats["dropped_count"], 0)
        self.assertGreater(spool.stats["aux_log_dropped_count"], 0)
        self.assertGreater(spool.stats["dead_letter_dropped_count"], 0)
        self.assertLessEqual(spool._disk_bytes(), spool.max_bytes)
        restored = self.spool(max_bytes=2300)
        self.assertEqual(list(restored.entries), ["0", "1"])
        self.assertEqual(restored.stats, spool.stats)

    def test_success_batch_uses_durable_done_records_without_full_rewrites(self):
        spool = self.spool()
        for i in range(100):
            spool.enqueue(str(i), self.reading(i))
        with mock.patch.object(spool, "_compact", wraps=spool._compact) as compact:
            for i in range(50):
                spool.finish(str(i), 200)
            self.assertEqual(compact.call_count, 0)
            self.assertIn('"op":"done"', spool.path.read_text())
            restored = self.spool()
            self.assertEqual(list(restored.entries), [str(i) for i in range(50, 100)])
            for i in range(50, 100):
                spool.finish(str(i), 200)
            self.assertLessEqual(compact.call_count, 2)
        self.assertEqual(self.spool().pending_count, 0)

    def test_dead_letter_cache_preserves_exact_age_boundary_and_external_changes(self):
        spool = self.spool(max_days=1)
        spool.enqueue("bad", self.reading())
        spool.finish("bad", 401)
        with mock.patch.object(Path, "read_bytes", autospec=True, wraps=None) as read:
            self.now += timedelta(days=1)
            spool.enforce_limits()
            read.assert_not_called()
        self.now += timedelta(microseconds=1)
        spool.enforce_limits()
        self.assertEqual(spool.stats["dead_letter_dropped_count"], 1)
        spool.dead_path.write_text('invalid complete row\n')
        spool.enforce_limits()
        self.assertEqual(spool.stats["dead_letter_dropped_count"], 2)
        spool.dead_path.write_text(json.dumps({"recorded_at": "2020-01-01T00:00:00Z"}) + "\n")
        spool.enqueue("next", self.reading())
        spool.finish("next", 401)
        self.assertEqual(spool.stats["dead_letter_dropped_count"], 3)
        self.assertEqual(len(spool.dead_path.read_text().splitlines()), 1)

    def test_write_ahead_is_durable_before_send_and_survives_restart(self):
        spool = self.spool()
        entry = spool.enqueue("fixed-id", self.reading())
        self.assertEqual(spool.pending_count, 1)
        on_disk = json.loads((self.root / "queue.jsonl").read_text().splitlines()[0])
        self.assertEqual(on_disk["entry"]["id"], entry["id"])
        restored = self.spool()
        self.assertEqual(restored.due_entries()[0]["reading"], self.reading())

    def test_every_success_status_marks_done_across_restart(self):
        for status in (200, 202, 204, 299):
            with self.subTest(status=status):
                spool = self.spool()
                entry = spool.enqueue(str(status), self.reading())
                spool.finish(entry["id"], status)
                self.assertEqual(self.spool().pending_count, 0)

    def test_terminal_4xx_dead_letters_sanitized_reason_not_response(self):
        spool = self.spool()
        entry = spool.enqueue("id", self.reading())
        spool.finish(entry["id"], 401)
        self.assertEqual(spool.pending_count, 0)
        dead = json.loads((self.root / "dead-letter.jsonl").read_text())
        self.assertEqual(dead["reason"], "http_401")
        self.assertEqual(self.spool().pending_count, 0)

    def test_retryable_statuses_and_network_failure_keep_key_and_original_time(self):
        for status in (None, 408, 425, 429, 500, 501, 503):
            with self.subTest(status=status):
                spool = self.spool()
                entry = spool.enqueue("same-key", self.reading())
                spool.finish(entry["id"], status)
                self.assertEqual(spool.due_entries(), [])
                self.now += timedelta(minutes=10)
                replay = self.spool().due_entries()[0]
                self.assertEqual(replay["id"], "same-key")
                self.assertEqual(replay["reading"]["captured_at"], "2026-09-28T12:00:00Z")
                self.assertGreater(replay["attempts"], 0)

    def test_oldest_first_with_stable_tie_order(self):
        spool = self.spool()
        spool.enqueue("z-first", self.reading())
        spool.enqueue("a-second", self.reading(78))
        self.assertEqual([e["id"] for e in self.spool().due_entries()], ["z-first", "a-second"])

    def test_same_pending_key_does_not_append_or_replace_reading(self):
        spool = self.spool()
        spool.enqueue("key", self.reading())
        size = (self.root / "queue.jsonl").stat().st_size
        spool.enqueue("key", self.reading(99))
        self.assertEqual((self.root / "queue.jsonl").stat().st_size, size)
        self.assertEqual(spool.due_entries()[0]["reading"], self.reading())

    def test_age_cap_drops_oldest_warns_and_persists_counter(self):
        spool = self.spool(max_days=7)
        spool.enqueue("old", self.reading())
        self.now += timedelta(days=8)
        spool.enqueue("new", self.reading(78))
        self.assertEqual([e["id"] for e in spool.due_entries()], ["new"])
        self.assertEqual(spool.stats["dropped_count"], 1)
        self.assertEqual(self.spool().stats["dropped_count"], 1)
        self.assertTrue(any("dropped" in warning for warning in self.warnings))

    def test_byte_cap_drops_oldest_not_newest(self):
        spool = self.spool(max_bytes=600)
        spool.enqueue("old", self.reading())
        spool.enqueue("new", self.reading(78))
        self.assertEqual([e["id"] for e in spool.due_entries()], ["new"])
        self.assertEqual(spool.stats["dropped_count"], 1)
        self.assertLessEqual(sum(p.stat().st_size for p in self.root.iterdir()), 600)

    def test_bulk_size_eviction_compacts_once_and_preserves_newest_entries(self):
        spool = self.spool()
        for n in range(20):
            spool.enqueue(str(n), self.reading(n))
        spool.max_bytes = 1200
        with mock.patch.object(spool, "_compact", wraps=spool._compact) as compact, \
             mock.patch.object(spool, "_disk_bytes", wraps=spool._disk_bytes) as disk_bytes:
            spool.enforce_limits()
            self.assertEqual(compact.call_count, 1)
            self.assertLessEqual(disk_bytes.call_count, 3)
        kept = list(spool.entries)
        self.assertTrue(kept)
        self.assertEqual(kept[-1], "19")
        self.assertEqual(kept, [str(n) for n in range(20 - len(kept), 20)])
        self.assertEqual(spool.stats["dropped_count"], 20 - len(kept))
        self.assertLessEqual(spool._disk_bytes(), spool.max_bytes)
        restored = self.spool(max_bytes=1200)
        self.assertEqual(list(restored.entries), kept)
        self.assertEqual(restored.stats["dropped_count"], spool.stats["dropped_count"])

    def test_dead_letter_is_bounded(self):
        spool = self.spool()
        for n in range(8):
            entry = spool.enqueue(str(n), self.reading(n))
            spool.finish(entry["id"], 400)
        spool.max_bytes = 850
        spool.enforce_limits()
        self.assertLessEqual((self.root / "dead-letter.jsonl").stat().st_size, 850)
        self.assertGreater(spool.stats["dead_letter_dropped_count"], 0)

    def test_size_evictions_batch_compaction_and_restore_exact_survivors(self):
        spool = self.spool()
        reading = self.reading()
        reading["metadata"]["note"] = "Unicode: \u6f22\u5b57 \U0001f33f\nsecond line"
        for n in range(100):
            spool.enqueue(f"entry-{n:03d}", reading)
        spool.max_bytes = int(spool._disk_bytes() * 0.3)
        with mock.patch.object(spool, "_compact", wraps=spool._compact) as compact, \
                mock.patch.object(spool, "_disk_bytes", wraps=spool._disk_bytes) as scans:
            spool.enforce_limits()
        survivors = list(spool.entries)
        self.assertGreater(spool.stats["dropped_count"], 50)
        self.assertEqual(survivors, [f"entry-{n:03d}" for n in range(100 - len(survivors), 100)])
        self.assertLessEqual(compact.call_count, 2)
        self.assertLessEqual(scans.call_count, 8)
        self.assertLessEqual(spool._disk_bytes(), spool.max_bytes)
        restored = self.spool(max_bytes=spool.max_bytes)
        self.assertEqual(list(restored.entries), survivors)
        self.assertEqual(restored.stats["dropped_count"], 100 - len(survivors))
        for entry in restored.entries.values():
            self.assertEqual(entry["reading"], reading)

    def test_journal_compaction_reclaims_space_without_evicting_pending_entry(self):
        spool = self.spool()
        spool.enqueue("pending", self.reading())
        for _ in range(20):
            spool.finish("pending", 503)
        spool.max_bytes = 600
        with mock.patch.object(spool, "_compact", wraps=spool._compact) as compact:
            spool.enforce_limits()
        self.assertEqual(list(spool.entries), ["pending"])
        self.assertEqual(spool.stats["dropped_count"], 0)
        self.assertEqual(compact.call_count, 1)
        self.assertLessEqual(spool._disk_bytes(), spool.max_bytes)
        self.assertEqual(self.spool(max_bytes=600).entries["pending"]["attempts"], 20)

    def test_size_budget_includes_growth_of_persisted_drop_counter(self):
        spool = self.spool()
        spool.stats["dropped_count"] = 9
        spool._save_stats()
        spool.enqueue("old", self.reading())
        spool.enqueue("new", self.reading())
        newest_line = spool.path.read_bytes().splitlines(keepends=True)[-1]
        spool.max_bytes = len(newest_line) + spool.stats_path.stat().st_size
        spool.enforce_limits()
        self.assertNotIn("old", spool.entries)
        self.assertLessEqual(spool._disk_bytes(), spool.max_bytes)
        restored = self.spool(max_bytes=spool.max_bytes)
        self.assertEqual(list(restored.entries), list(spool.entries))
        self.assertEqual(restored.stats["dropped_count"], 11 - spool.pending_count)

    def test_age_and_size_evictions_include_auxiliary_state_in_budget(self):
        spool = self.spool()
        spool.enqueue("expired", self.reading())
        self.now += timedelta(days=8)
        for n in range(20):
            spool.enqueue(f"fresh-{n:02d}", self.reading())
        fixed = self.root / "state.json"
        fixed.write_text(json.dumps({"note": "x" * 200}), encoding="utf-8")
        spool.max_bytes = 1500
        with mock.patch.object(spool, "_compact", wraps=spool._compact) as compact:
            spool.enforce_limits()
        self.assertNotIn("expired", spool.entries)
        self.assertLessEqual(compact.call_count, 2)
        self.assertLessEqual(spool._disk_bytes(), 1500)
        self.assertEqual(json.loads(fixed.read_text()), {"note": "x" * 200})
        restored = self.spool(max_bytes=1500)
        self.assertEqual(list(restored.entries), list(spool.entries))
        self.assertEqual(restored.stats["dropped_count"], 21 - spool.pending_count)

    def test_fixed_state_larger_than_cap_still_refuses_delivery(self):
        spool = self.spool()
        fixed = self.root / "state.json"
        fixed.write_text(json.dumps({"note": "x" * 1000}), encoding="utf-8")
        spool.max_bytes = 600
        with self.assertRaisesRegex(ValueError, "Spool state exceeds size cap"):
            spool.due_entries()
        self.assertTrue(fixed.exists())

    def test_torn_tail_does_not_destroy_prior_entry_or_next_append(self):
        spool = self.spool()
        spool.enqueue("old", self.reading())
        with (self.root / "queue.jsonl").open("ab") as handle:
            handle.write(b'{"op":"put","entry":')
        restored = self.spool()
        restored.enqueue("new", self.reading())
        self.assertEqual(self.spool().pending_count, 2)
        self.assertEqual(restored.stats["torn_tail_count"], 1)

    def test_corrupt_complete_record_fails_closed(self):
        (self.root / "queue.jsonl").write_text('{"private": "never-print"}\n')
        with self.assertRaises(ValueError) as caught:
            self.spool()
        self.assertNotIn("never-print", str(caught.exception))

    def test_non_string_saved_timestamps_fail_closed_without_echoing_payload(self):
        for field, value in (("created_at", None), ("next_attempt_at", False)):
            with self.subTest(field=field):
                (self.root / "queue.jsonl").unlink(missing_ok=True)
                spool = self.spool()
                entry = spool.enqueue("id", self.reading())
                entry[field] = value
                (self.root / "queue.jsonl").write_text(
                    json.dumps({"op": "put", "entry": entry}) + "\n")
                with self.assertRaises(ValueError) as caught:
                    self.spool()
                self.assertIn("invalid complete record", str(caught.exception))
                (self.root / "queue.jsonl").unlink()

    def test_credentials_never_written_even_nested(self):
        reading = self.reading()
        reading["metadata"]["raw_payload"]["PASSKEY"] = "synthetic-passkey"
        reading["metadata"]["Authorization"] = "Bearer " + "vbt_" + "synthetic-value"
        spool = self.spool()
        entry = spool.enqueue("id", reading)
        spool.finish(entry["id"], 403)
        for path in self.root.glob("*"):
            contents = path.read_text()
            self.assertNotIn("synthetic-passkey", contents)
            self.assertNotIn("vbt_", contents)
            self.assertNotIn("Authorization", contents)


class HealthTests(DeliveryFixture):
    def test_spool_drop_incident_recovers_only_through_matching_durable_count(self):
        dropped = 1
        state = self.health(spool_drops=lambda: dropped, alert_interval=0)
        state.packet_received()
        self.assertIn("spool_data_drop", state.status()["reasons"])
        state.tick()
        self.assertTrue(any(m.get("event") == "alert" and m.get("reason") == "spool_data_drop" for m in self.messages))
        state.forward_result("tent-a", True)
        self.assertIn("spool_data_drop", state.status()["reasons"])
        dropped = 2  # another eviction while an earlier delivery was completing
        state.forward_result("tent-a", True, recovered_spool_drop_count=1)
        self.assertIn("spool_data_drop", state.status()["reasons"])
        state.forward_result("tent-a", True, recovered_spool_drop_count=2)
        state.tick()
        self.assertTrue(state.status()["ok"])
        self.assertTrue(self.health(spool_drops=lambda: dropped).status()["ok"])
        self.assertTrue(any(m.get("event") == "recovery" and m.get("reason") == "spool_data_drop" for m in self.messages))

    def setUp(self):
        super().setUp()
        self.messages = []
        self.sends = []

    def health(self, **kwargs):
        return HealthState(self.root / "state.json", ["tent-a", "tent-b"], clock=self.clock,
                           log=self.messages.append, send_alert=self.sends.append, **kwargs)

    def test_unmapped_cardinality_and_long_keys_cannot_poison_state(self):
        state = self.health(max_log_bytes=4096)
        state.unmapped({f"unknown-{i}": i for i in range(1000)})
        state.unmapped({"x" * 60000: 1})
        state.packet_received()
        state.forward_result("tent-a", True)
        state.tick()
        self.assertLessEqual(len(state.data["unmapped_counts"]), 256)
        self.assertLessEqual(state.path.stat().st_size, 4096)
        self.assertEqual(sum(state.data["unmapped_counts"].values()) + state.data["unmapped_overflow_count"], 1001)
        restored = self.health(max_log_bytes=4096)
        self.assertEqual(restored.data["unmapped_overflow_count"], state.data["unmapped_overflow_count"])
        self.assertTrue(restored.status()["ok"])

    def test_overflowed_unmapped_keys_still_have_sanitized_local_log_rows(self):
        state = self.health()
        state.unmapped({f"unknown-{i}": i for i in range(300)})
        self.assertEqual(state.data["unmapped_overflow_count"], 44)
        rows = [json.loads(line) for line in (self.root / "unmapped_channels.jsonl").read_text().splitlines()]
        self.assertEqual(len(rows), 300)
        self.assertEqual(rows[-1]["key"], "unknown-299")
        self.assertEqual(rows[-1]["value"], 299)
        self.assertEqual(self.health().data["unmapped_overflow_count"], 44)
        self.assertTrue(any(message.get("event") == "unmapped_counter_limit" for message in self.messages))

    def test_unmapped_append_is_batched_and_no_change_does_not_rescan(self):
        state = self.health()
        from ecowitt_delivery import append_jsonl_many
        with mock.patch("ecowitt_delivery.append_jsonl_many", wraps=append_jsonl_many) as append:
            state.unmapped({f"unknown-{i}": i for i in range(20)})
            self.assertEqual(append.call_count, 1)
        with mock.patch.object(Path, "read_bytes") as read:
            state.unmapped({})
            state.unmapped({"unknown-1": 30})
            read.assert_not_called()
        self.now += timedelta(days=7, microseconds=1)
        state.unmapped({})
        self.assertEqual(state.data["unmapped_log_dropped_count"], 21)

    def test_unmapped_overflow_counter_rejects_invalid_state(self):
        state = self.health()
        data = json.loads(state.path.read_text())
        for value in (-1, True, "1", None):
            with self.subTest(value=value):
                data["unmapped_overflow_count"] = value
                state.path.write_text(json.dumps(data))
                with self.assertRaises(ValueError):
                    self.health()

    def test_alert_network_call_releases_lock_and_attempt_is_durable(self):
        state = self.health()
        entered, release, updated = threading.Event(), threading.Event(), threading.Event()
        def send(message):
            saved = json.loads(state.path.read_text())
            self.assertEqual(saved["pending_alerts"], [])
            self.assertIsNotNone(saved["last_alert_webhook_at"])
            entered.set()
            release.wait(2)
            return False
        state.send_alert = send
        self.now += timedelta(minutes=10)
        worker = threading.Thread(target=state.tick)
        worker.start()
        try:
            self.assertTrue(entered.wait(1))
            update = threading.Thread(target=lambda: (state.packet_received(), updated.set()))
            update.start()
            self.assertTrue(updated.wait(1))
            update.join(1)
        finally:
            release.set()
            worker.join(2)
        self.assertEqual(state.data["alert_webhook_error_count"], 1)
        self.assertEqual(self.health().data["alert_webhook_error_count"], 1)

    def test_quiet_boundary_503_after_ten_minutes(self):
        state = self.health()
        state.packet_received()
        self.now += timedelta(seconds=599)
        self.assertTrue(state.status()["ok"])
        self.now += timedelta(seconds=1)
        state.tick()
        self.assertFalse(state.status()["ok"])
        self.assertIn("gateway_quiet", state.status()["reasons"])

    def test_alert_once_recovery_once_and_no_duplicates_after_restart(self):
        state = self.health(alert_interval=0)
        state.packet_received()
        self.now += timedelta(minutes=11)
        state.tick()
        state.tick()
        self.health(alert_interval=0).tick()
        self.assertEqual(len(self.messages), 1)
        self.assertEqual(len(self.sends), 1)
        state = self.health(alert_interval=0)
        state.packet_received()
        state.tick()
        state.tick()
        self.assertEqual([m["event"] for m in self.messages], ["alert", "recovery"])
        self.assertEqual(len(self.sends), 2)

    def test_packet_and_per_tent_success_times_persist(self):
        state = self.health()
        state.packet_received()
        state.forward_result("tent-a", True)
        restored = self.health()
        self.assertEqual(restored.data["last_packet_received_at"], self.now.isoformat())
        self.assertEqual(restored.data["tents"]["tent-a"]["last_forward_ok_at"], self.now.isoformat())
        self.assertIsNone(restored.data["tents"]["tent-b"]["last_forward_ok_at"])

    def test_sustained_failure_and_success_recovery_are_per_tent(self):
        state = self.health(alert_interval=0)
        state.packet_received()
        state.forward_result("tent-a", False)
        self.now += timedelta(minutes=11)
        state.packet_received()
        state.tick()
        self.assertIn("forward_failure", state.status()["reasons"])
        state.forward_result("tent-b", True)
        state.tick()
        self.assertEqual(len(self.messages), 1)
        state.forward_result("tent-a", True)
        state.tick()
        self.assertEqual(self.messages[-1]["event"], "recovery")
        self.assertTrue(state.status()["ok"])

    def test_global_webhook_rate_limit_keeps_each_incident_message(self):
        state = self.health(alert_interval=60)
        state.packet_received()
        state.forward_result("tent-a", False)
        state.forward_result("tent-b", False)
        self.now += timedelta(minutes=11)
        state.packet_received()
        state.tick()
        self.assertEqual(len(self.messages), 2)
        self.assertEqual(len(self.sends), 1)
        self.now += timedelta(seconds=60)
        state.tick()
        self.assertEqual(len(self.sends), 2)

    def test_unmapped_counter_log_once_per_key_and_restart(self):
        state = self.health()
        state.unmapped({"unknown_channel": "123"})
        state.unmapped({"unknown_channel": "124"})
        restored = self.health()
        restored.unmapped({"unknown_channel": "125"})
        self.assertEqual(restored.data["unmapped_counts"]["unknown_channel"], 3)
        warnings = [m for m in self.messages if m.get("event") == "unmapped"]
        self.assertEqual(len(warnings), 1)
        rows = (self.root / "unmapped_channels.jsonl").read_text().splitlines()
        self.assertEqual(len(rows), 3)
        self.assertNotIn("tent_id", json.loads(rows[0]))

    def test_unknown_token_strings_never_in_log_state_or_alert(self):
        state = self.health()
        state.unmapped({"TOKEN": "do-not-print", "echo": "Bearer " + "vbt_" + "synthetic-value"})
        text = json.dumps(self.messages) + (self.root / "state.json").read_text() + (self.root / "unmapped_channels.jsonl").read_text()
        self.assertNotIn("do-not-print", text)
        self.assertNotIn("vbt_", text)

    def test_corrupt_health_state_fails_closed_with_sanitized_diagnostic(self):
        original = self.health().data
        for corrupted in (
            {"tents": []},
            {"last_packet_received_at": "do-not-print"},
            {"tents": {"tent-a": {"last_forward_ok_at": True, "first_forward_failure_at": None}}},
            {"unmapped_counts": {"unknown": True}},
            {"incidents": {"gateway_quiet": "do-not-print"}},
            {"pending_alerts": ["do-not-print"]},
            {"spool_drop_recovered_count": -1},
            {"spool_drop_recovered_count": True},
            {"spool_drop_recovered_count": "do-not-print"},
            {"receive_error": "do-not-print"},
            {"receive_error": False},
            {"tents": {"tent-a": {**original["tents"]["tent-a"], "primary_failures": {"unknown": self.now.isoformat()}}}},
            {"tents": {"tent-a": {**original["tents"]["tent-a"], "primary_failures": {"air": True}}}},
        ):
            with self.subTest(corrupted=corrupted):
                (self.root / "state.json").write_text(json.dumps({**original, **corrupted}))
                with self.assertRaises(ValueError) as caught:
                    self.health()
                self.assertNotIn("do-not-print", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
