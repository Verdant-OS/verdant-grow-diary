"""Durable delivery/health proofs; all clocks and network sends are injected."""
from __future__ import annotations

import json
import tempfile
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
    def setUp(self):
        super().setUp()
        self.messages = []
        self.sends = []

    def health(self, **kwargs):
        return HealthState(self.root / "state.json", ["tent-a", "tent-b"], clock=self.clock,
                           log=self.messages.append, send_alert=self.sends.append, **kwargs)

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
        ):
            with self.subTest(corrupted=corrupted):
                (self.root / "state.json").write_text(json.dumps({**original, **corrupted}))
                with self.assertRaises(ValueError) as caught:
                    self.health()
                self.assertNotIn("do-not-print", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
