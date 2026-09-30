"""Local, bounded write-ahead delivery and incident state. No network or Flask."""
from __future__ import annotations

import json
import os
import threading
from collections import OrderedDict
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

from ecowitt_multitent import sanitize


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def parse_time(value: str) -> datetime:
    if not isinstance(value, str):
        raise ValueError("Local state timestamp is invalid; no payload echoed")
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError("Local state timestamp must contain UTC offset")
    return result.astimezone(timezone.utc)


def atomic_json(path: Path, value: Any) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        handle.write(json.dumps(value, separators=(",", ":"), allow_nan=False))
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


def append_jsonl(path: Path, value: Any, *, cache: dict | None = None) -> None:
    append_jsonl_many(path, [value], cache=cache)


def append_jsonl_many(path: Path, values: list, *, cache: dict | None = None) -> None:
    if cache is not None and path in cache:
        stat = path.stat() if path.exists() else None
        signature = (stat.st_size, stat.st_mtime_ns) if stat else None
        if cache[path][0] != signature:
            del cache[path]
    with path.open("a", encoding="utf-8") as handle:
        for value in values:
            handle.write(json.dumps(value, separators=(",", ":"), allow_nan=False) + "\n")
        handle.flush()
        os.fsync(handle.fileno())
    if cache is not None and path in cache:
        _, earliest = cache[path]
        stamps = [parse_time(value["recorded_at"]) for value in values]
        earliest = min(stamps + ([earliest] if earliest is not None else []))
        stat = path.stat()
        cache[path] = ((stat.st_size, stat.st_mtime_ns), earliest)


def trim_jsonl(path: Path, max_bytes: int, max_days: float, now: datetime, *, cache: dict | None = None) -> int:
    """Bound auxiliary logs independently; report every oldest-record removal."""
    if not path.exists():
        return 0
    cutoff = now - timedelta(days=max_days)
    stat = path.stat()
    signature = (stat.st_size, stat.st_mtime_ns)
    if cache is not None and path in cache:
        previous, earliest = cache[path]
        if previous == signature and stat.st_size <= max_bytes and (earliest is None or earliest >= cutoff):
            return 0
    lines = path.read_bytes().splitlines(keepends=True)
    original_count = len(lines)
    kept = []
    stamps = []
    for line in lines:
        try:
            item = json.loads(line)
            if parse_time(item["recorded_at"]) >= cutoff:
                kept.append(line)
                stamps.append(parse_time(item["recorded_at"]))
        except (ValueError, KeyError, TypeError):
            continue
    total = sum(map(len, kept))
    start = 0
    while start < len(kept) and total > max_bytes:
        total -= len(kept[start])
        start += 1
    kept, stamps = kept[start:], stamps[start:]
    if len(kept) != original_count:
        temporary = path.with_suffix(".jsonl.tmp")
        with temporary.open("wb") as handle:
            handle.writelines(kept)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    if cache is not None:
        stat = path.stat()
        cache[path] = ((stat.st_size, stat.st_mtime_ns), min(stamps) if stamps else None)
    return original_count - len(kept)

def validate_health_data(data: dict) -> None:
    """Reject malformed local state before it can disable incident reporting."""
    for key in ("tents", "unmapped_counts", "incidents"):
        if not isinstance(data[key], dict):
            raise ValueError()
    if any(type(count) is not int or count < 0 for count in data["unmapped_counts"].values()):
        raise ValueError()
    if any(type(active) is not bool for active in data["incidents"].values()):
        raise ValueError()
    for key in ("unmapped_log_dropped_count", "unmapped_overflow_count", "alert_webhook_error_count", "spool_drop_recovered_count"):
        if type(data[key]) is not int or data[key] < 0:
            raise ValueError()
    stamps = [data["started_at"], data["last_packet_received_at"], data["last_alert_webhook_at"]]
    if not isinstance(data["started_at"], str):
        raise ValueError()
    for state in data["tents"].values():
        if not isinstance(state, dict):
            raise ValueError()
        stamps.extend((state["last_forward_ok_at"], state["first_forward_failure_at"]))
    for stamp in stamps:
        if stamp is not None:
            if not isinstance(stamp, str):
                raise ValueError()
            parse_time(stamp)
    if not isinstance(data["pending_alerts"], list):
        raise ValueError()
    for message in data["pending_alerts"]:
        if not isinstance(message, dict) or set(message) != {"event", "reason", "incident", "message"}:
            raise ValueError()
        if not all(isinstance(value, str) for value in message.values()):
            raise ValueError()
        if message["event"] not in {"alert", "recovery"}:
            raise ValueError()


class JsonlSpool:
    """Append + fsync before send. Terminal transitions also survive restart."""
    def __init__(self, root: Path, *, clock: Callable = utc_now,
                 max_days: float = 7, max_bytes: int = 50 * 1024 * 1024,
                 warn: Callable = print, cleaner: Callable = sanitize, lock: Any = None):
        if max_days <= 0 or max_bytes <= 0:
            raise ValueError("Spool limits must be positive")
        self.root, self.clock, self.max_days, self.max_bytes = root, clock, max_days, max_bytes
        self.warn, self.cleaner = warn, cleaner
        self.lock = lock or threading.RLock()
        root.mkdir(parents=True, exist_ok=True)
        self.path, self.dead_path, self.stats_path = root / "queue.jsonl", root / "dead-letter.jsonl", root / "spool-stats.json"
        self.entries: OrderedDict[str, dict] = OrderedDict()
        self._done_records = 0
        self._log_cache: dict = {}
        self.stats = {"dropped_count": 0, "dead_letter_count": 0, "dead_letter_dropped_count": 0,
                      "aux_log_dropped_count": 0, "torn_tail_count": 0}
        if self.stats_path.exists():
            try:
                old = json.loads(self.stats_path.read_text(encoding="utf-8"))
                for key in self.stats:
                    if type(old.get(key)) is int and old[key] >= 0:
                        self.stats[key] = old[key]
            except (ValueError, AttributeError):
                raise ValueError("Spool statistics are invalid; no payload echoed") from None
        self._restore()
        self.enforce_limits()

    @property
    def pending_count(self) -> int:
        with self.lock:
            return len(self.entries)

    def _save_stats(self) -> None:
        atomic_json(self.stats_path, self.stats)

    def _restore(self) -> None:
        if not self.path.exists():
            return
        data = self.path.read_bytes()
        # Only an incomplete final append may be discarded. A corrupt complete
        # record fails closed instead of silently losing acknowledged packets.
        if data and not data.endswith(b"\n"):
            data = data[:data.rfind(b"\n") + 1]
            with self.path.open("wb") as handle:
                handle.write(data)
                handle.flush()
                os.fsync(handle.fileno())
            self.stats["torn_tail_count"] += 1
            self.warn("spool: incomplete final append discarded")
        for line in data.splitlines():
            try:
                record = json.loads(line)
                if record["op"] == "put":
                    entry = self.cleaner(record["entry"])
                    if not isinstance(entry["id"], str) or not isinstance(entry["reading"], dict):
                        raise ValueError()
                    parse_time(entry["created_at"])
                    parse_time(entry["next_attempt_at"])
                    if type(entry["attempts"]) is not int or entry["attempts"] < 0:
                        raise ValueError()
                    self.entries[entry["id"]] = entry
                elif record["op"] == "done":
                    self.entries.pop(record["id"], None)
                else:
                    raise ValueError()
            except (ValueError, KeyError, TypeError):
                raise ValueError("Spool contains an invalid complete record; no payload echoed") from None
        self._compact()
        self._save_stats()

    def _compact(self) -> dict[str, int]:
        temporary = self.path.with_suffix(".jsonl.tmp")
        record_sizes = {}
        # Fixed LF bytes make the budget match the file on Windows too.
        with temporary.open("w", encoding="utf-8", newline="\n") as handle:
            for entry_id, entry in self.entries.items():
                line = json.dumps({"op": "put", "entry": entry}, separators=(",", ":"), allow_nan=False) + "\n"
                handle.write(line)
                record_sizes[entry_id] = len(line.encode("utf-8"))
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, self.path)
        self._done_records = 0
        return record_sizes

    def enforce_limits(self) -> None:
        with self.lock:
            cutoff = self.clock() - timedelta(days=self.max_days)
            dropped = 0
            for entry_id, entry in list(self.entries.items()):
                if parse_time(entry["created_at"]) < cutoff:
                    del self.entries[entry_id]
                    dropped += 1
            # Diagnostics get at most one tenth of the combined cap each.
            # Reclaim their space before deciding which pending readings fit.
            for path in (self.dead_path, self.root / "unmapped_channels.jsonl"):
                removed = trim_jsonl(path, self.max_bytes // 10, self.max_days, self.clock(), cache=self._log_cache)
                if removed:
                    self.stats["aux_log_dropped_count"] += removed
                    if path == self.dead_path:
                        self.stats["dead_letter_dropped_count"] += removed
                    self.warn(f"spool: dropped {removed} oldest auxiliary log records at retention/size limit")
            disk_bytes = self._disk_bytes()
            if dropped or disk_bytes > self.max_bytes:
                # Select survivors in memory so size eviction needs one durable
                # rewrite. Include auxiliary files and the growing drop counter.
                record_sizes = {
                    entry_id: len((json.dumps({"op": "put", "entry": entry}, separators=(",", ":"), allow_nan=False) + "\n").encode("utf-8"))
                    for entry_id, entry in self.entries.items()
                }
                queue_bytes = sum(record_sizes.values())
                previous_queue_bytes = self.path.stat().st_size if self.path.exists() else 0
                previous_stats_bytes = self.stats_path.stat().st_size if self.stats_path.exists() else 0
                other_bytes = disk_bytes - previous_queue_bytes - previous_stats_bytes
                for entry_id, record_bytes in record_sizes.items():
                    updated_stats = {**self.stats, "dropped_count": self.stats["dropped_count"] + dropped}
                    updated_stats_bytes = len(json.dumps(updated_stats, separators=(",", ":"), allow_nan=False).encode("utf-8"))
                    if other_bytes + queue_bytes + updated_stats_bytes <= self.max_bytes:
                        break
                    del self.entries[entry_id]
                    queue_bytes -= record_bytes
                    dropped += 1
                self._compact()
            if dropped:
                self.stats["dropped_count"] += dropped
                self.warn(f"spool: dropped {dropped} oldest entries at retention/size limit")
            self._save_stats()
            # The cap includes auxiliary logs/state, not just pending payloads.
            for path in (self.dead_path, self.root / "unmapped_channels.jsonl"):
                if path.exists() and self._disk_bytes() > self.max_bytes:
                    budget = max(0, self.max_bytes - (self._disk_bytes() - path.stat().st_size))
                    removed = trim_jsonl(path, budget, self.max_days, self.clock(), cache=self._log_cache)
                    if removed:
                        self.stats["aux_log_dropped_count"] += removed
                        if path == self.dead_path:
                            self.stats["dead_letter_dropped_count"] += removed
                        self.warn(f"spool: dropped {removed} oldest auxiliary log records at size limit")
                        self._save_stats()
            if self._disk_bytes() > self.max_bytes:
                raise ValueError("Spool state exceeds size cap; refusing further delivery")

    def _disk_bytes(self) -> int:
        return sum(path.stat().st_size for path in self.root.iterdir() if path.is_file())

    def enqueue(self, entry_id: str, reading: dict, *, idempotency_key: str | None = None) -> dict:
        with self.lock:
            if entry_id in self.entries:
                return deepcopy(self.entries[entry_id])
            stamp = self.clock().isoformat()
            entry = {"id": entry_id, "created_at": stamp, "next_attempt_at": stamp,
                     "attempts": 0, "reading": self.cleaner(reading)}
            if idempotency_key is not None:
                entry["idempotency_key"] = idempotency_key
            append_jsonl(self.path, {"op": "put", "entry": entry})
            self.entries[entry_id] = entry
            self.enforce_limits()
            return deepcopy(entry)

    def due_entries(self, limit: int = 8) -> list[dict]:
        with self.lock:
            self.enforce_limits()
            return [deepcopy(e) for e in self.entries.values()
                    if parse_time(e["next_attempt_at"]) <= self.clock()][:limit]

    def finish(self, entry_id: str, status: int | None) -> None:
        with self.lock:
            entry = self.entries.get(entry_id)
            if entry is None:
                return
            success = status is not None and 200 <= status < 300
            terminal = status is not None and 400 <= status < 500 and status not in {408, 425, 429}
            if success or terminal:
                if terminal:
                    append_jsonl(self.dead_path, {"recorded_at": self.clock().isoformat(), "reason": f"http_{status}", "entry": entry}, cache=self._log_cache)
                    self.stats["dead_letter_count"] += 1
                append_jsonl(self.path, {"op": "done", "id": entry_id})
                del self.entries[entry_id]
                self._done_records += 1
                if not self.entries or self._done_records >= max(64, len(self.entries)):
                    self._compact()
            else:
                entry["attempts"] += 1
                delay = min(300, 5 * 2 ** min(entry["attempts"] - 1, 10))
                entry["next_attempt_at"] = (self.clock() + timedelta(seconds=delay)).isoformat()
                append_jsonl(self.path, {"op": "put", "entry": entry})
            self.enforce_limits()


class HealthState:
    """Persist quiet/failure incidents before emitting one alert/recovery."""
    def __init__(self, path: Path, tent_ids: list[str], *, clock: Callable = utc_now,
                 quiet_seconds: float = 600, failure_seconds: float = 600,
                 alert_interval: float = 60, log: Callable = print,
                 send_alert: Callable | None = None, cleaner: Callable = sanitize,
                 max_log_bytes: int = 5 * 1024 * 1024, max_days: float = 7, lock: Any = None,
                 spool_drops: Callable[[], int] | None = None):
        self.path, self.clock, self.log, self.send_alert, self.cleaner = path, clock, log, send_alert, cleaner
        self.quiet_seconds, self.failure_seconds, self.alert_interval = quiet_seconds, failure_seconds, alert_interval
        self.max_log_bytes, self.max_days = max_log_bytes, max_days
        self.lock = lock or threading.RLock()
        self.spool_drops = spool_drops
        self._log_cache: dict = {}
        path.parent.mkdir(parents=True, exist_ok=True)
        self.data = {"started_at": clock().isoformat(), "last_packet_received_at": None,
                     "tents": {}, "unmapped_counts": {}, "unmapped_log_dropped_count": 0, "unmapped_overflow_count": 0,
                     "incidents": {}, "pending_alerts": [], "last_alert_webhook_at": None,
                     "alert_webhook_error_count": 0, "spool_drop_recovered_count": 0}
        if path.exists():
            try:
                old = json.loads(path.read_text(encoding="utf-8"))
                if not isinstance(old, dict):
                    raise ValueError()
                self.data.update(cleaner(old))
                validate_health_data(self.data)
            except (ValueError, TypeError, KeyError):
                raise ValueError("Listener health state is invalid; no payload echoed") from None
        self.tent_ids = tuple(tent_ids)
        for tent_id in tent_ids:
            self.data["tents"].setdefault(tent_id, {"last_forward_ok_at": None, "first_forward_failure_at": None})
        self._bound_unmapped_counts()
        self._save()

    def _bound_unmapped_counts(self) -> None:
        kept = {}
        # Bound both cardinality and bytes: even one untrusted key can be huge.
        for key, count in self.data["unmapped_counts"].items():
            candidate = {**kept, key: count}
            if len(candidate) <= 256 and len(json.dumps(candidate, separators=(",", ":")).encode("utf-8")) <= self.max_log_bytes // 4:
                kept = candidate
            else:
                self.data["unmapped_overflow_count"] += count
        self.data["unmapped_counts"] = kept

    def _save(self) -> None:
        safe = self.cleaner(self.data)
        if len(json.dumps(safe, separators=(",", ":")).encode("utf-8")) > self.max_log_bytes:
            raise ValueError("Listener state exceeds local size cap")
        atomic_json(self.path, safe)

    def packet_received(self) -> None:
        with self.lock:
            self.data["last_packet_received_at"] = self.clock().isoformat()
            self._save()

    def forward_result(self, tent_id: str, success: bool, *, outstanding_failure: bool = False,
                       recovered_spool_drop_count: int | None = None) -> None:
        with self.lock:
            state = self.data["tents"].setdefault(tent_id, {"last_forward_ok_at": None, "first_forward_failure_at": None})
            if success:
                state["last_forward_ok_at"] = self.clock().isoformat()
                if recovered_spool_drop_count is not None:
                    self.data["spool_drop_recovered_count"] = recovered_spool_drop_count
                if not outstanding_failure:
                    state["first_forward_failure_at"] = None
            if (not success or outstanding_failure) and state["first_forward_failure_at"] is None:
                state["first_forward_failure_at"] = self.clock().isoformat()
            self._save()

    def _active_incidents(self) -> set[str]:
        now = self.clock()
        active = set()
        if self.spool_drops is not None and self.spool_drops() != self.data["spool_drop_recovered_count"]:
            active.add("spool_data_drop")
        last_packet = self.data["last_packet_received_at"] or self.data["started_at"]
        if (now - parse_time(last_packet)).total_seconds() >= self.quiet_seconds:
            active.add("gateway_quiet")
        for tent_id in self.tent_ids:
            failed_at = self.data["tents"][tent_id]["first_forward_failure_at"]
            if failed_at and (now - parse_time(failed_at)).total_seconds() >= self.failure_seconds:
                active.add("forward:" + tent_id)
        return active

    def status(self) -> dict:
        with self.lock:
            active = self._active_incidents()
            reasons = sorted({"forward_failure" if key.startswith("forward:") else key for key in active})
            return {"ok": not reasons, "reasons": reasons, "last_packet_received_at": self.data["last_packet_received_at"],
                    "tents": {tid: deepcopy(self.data["tents"][tid]) for tid in self.tent_ids}}

    def unmapped(self, fields: dict) -> bool:
        with self.lock:
            safe = self.cleaner(fields)
            rows = []
            overflowed = 0
            for key, value in safe.items():
                # Every sanitized unowned field needs local evidence, even
                # after the bounded per-key counter reaches its limit.
                rows.append({"recorded_at": self.clock().isoformat(), "key": key, "value": value})
                first = key not in self.data["unmapped_counts"]
                counts = self.data["unmapped_counts"]
                candidate = {**counts, key: counts.get(key, 0) + 1}
                if len(candidate) > 256 or len(json.dumps(candidate, separators=(",", ":")).encode("utf-8")) > self.max_log_bytes // 4:
                    self.data["unmapped_overflow_count"] += 1
                    overflowed += 1
                    continue
                self.data["unmapped_counts"] = candidate
                if first:
                    self.log({"event": "unmapped", "key": key,
                              "message": "seen but not mapped to any tent"})
            if overflowed:
                self.log({"event": "unmapped_counter_limit", "count": overflowed})
            path = self.path.parent / "unmapped_channels.jsonl"
            if rows:
                append_jsonl_many(path, rows, cache=self._log_cache)
            dropped = trim_jsonl(path, self.max_log_bytes, self.max_days, self.clock(), cache=self._log_cache)
            if dropped:
                self.data["unmapped_log_dropped_count"] += dropped
                self.log({"event": "unmapped_log_limit", "count": dropped})
            self._save()

            return bool(rows)

    def tick(self) -> None:
        message = None
        with self.lock:
            active = self._active_incidents()
            for key in sorted(active | set(self.data["incidents"])):
                was_active = self.data["incidents"].get(key, False)
                is_active = key in active
                if was_active == is_active:
                    continue
                self.data["incidents"][key] = is_active
                kind = "alert" if is_active else "recovery"
                reason = ("forward_failure" if key.startswith("forward:") else
                          "spool_data_drop" if key == "spool_data_drop" else "gateway_quiet")
                transition = {"event": kind, "reason": reason, "incident": key,
                           "message": f"Ecowitt listener {kind}: {reason}"}
                self.log(transition)
                if self.send_alert is not None:
                    self.data["pending_alerts"].append(transition)
            self._save()
            last = self.data["last_alert_webhook_at"]
            due = last is None or (self.clock() - parse_time(last)).total_seconds() >= self.alert_interval
            if due and self.data["pending_alerts"] and self.send_alert is not None:
                message = self.data["pending_alerts"].pop(0)
                self.data["last_alert_webhook_at"] = self.clock().isoformat()
                # At most one webhook attempt per message, recorded before I/O.
                # A timeout cannot prove the receiver did not accept the alert.
                self._save()
        if message is not None:
            try:
                failed = self.send_alert(message) is False
            except Exception:
                failed = True
            if failed:
                with self.lock:
                    self.data["alert_webhook_error_count"] += 1
                    self._save()
