"""Map a getDevSta JSON object onto one CSV row for the existing importer.

One snapshot row per getDevSta per tent. The zone average (id avg1) is the
only sensor value. Zero is a value. An empty data object is missing, not zero.
Fan level and light level are not columns on the existing path, so they are
not emitted. The source cell is always csv.
"""

from __future__ import annotations

import csv
import io
import json
import math
import re
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from ggs_v1_frame import V1Reassembler

SOURCE = "csv"
SOURCE_APP = "spider_farmer_ggs"
TRANSPORT = "ble"
ZONE = "zone1"
AVERAGE_ID = "avg1"
TIME_BASIS_RECEIVE = "receive"
TIME_BASIS_DEVICE = "device"

COLUMNS = (
    "timestamp",
    "temp_c",
    "humidity",
    "vpd",
    "source",
    "tent_id",
    "timezone",
    "observed_at",
    "ingested_at",
    "device_alias",
    "time_basis",
    "source_app",
    "transport",
    "reading_flags",
    "raw_payload",
)

TEMP_MIN_C = -40.0
TEMP_MAX_C = 90.0
HUMIDITY_MIN = 0.0
HUMIDITY_MAX = 100.0
VPD_MIN_KPA = 0.0
VPD_MAX_KPA = 15.0
DEFAULT_STALE_SECONDS = 30.0

_MAC_RE = re.compile(r"^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$")
_DROPPED_KEYS = frozenset(
    {
        "pid",
        "uid",
        "mac",
        "wifi",
        "ssid",
        "bssid",
        "password",
        "passwd",
        "productcode",
        "product_code",
        "label",
    }
)

WARN_UNMAPPED = "unmapped controller skipped"
WARN_EMPTY = "empty sensor payload; no row written"
WARN_NO_AVERAGE = "zone1 had no average reading; no row written"
WARN_OTHER_ZONE = "a zone other than zone1 was ignored"
WARN_DEVICE_CLOCK = "device clock was not usable; observation time is receive time"


@dataclass(frozen=True)
class ControllerMapEntry:
    advertised_name: str
    alias: str
    tent_id: str
    zone: str = ZONE


@dataclass(frozen=True)
class ControllerMap:
    timezone_name: str
    stale_after_seconds: float
    trust_device_clock: bool
    entries: tuple[ControllerMapEntry, ...]

    def match(self, advertised_name: str) -> ControllerMapEntry | None:
        hits = [entry for entry in self.entries if entry.advertised_name == advertised_name]
        if len(hits) != 1:
            return None
        return hits[0]


def load_controller_map(payload: dict[str, Any]) -> ControllerMap:
    """Load a grower-supplied map. Unknown zones and duplicate names are errors."""
    if not isinstance(payload, dict):
        raise ValueError("controller map must be an object")
    timezone_name = payload.get("timezone")
    if not isinstance(timezone_name, str) or not timezone_name.strip():
        raise ValueError("controller map needs a timezone")
    try:
        ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError as exc:
        raise ValueError("controller map timezone is not usable") from exc
    stale = payload.get("stale_after_seconds", DEFAULT_STALE_SECONDS)
    if isinstance(stale, bool) or not isinstance(stale, (int, float)) or not math.isfinite(stale):
        raise ValueError("stale_after_seconds must be a positive number")
    if stale <= 0:
        raise ValueError("stale_after_seconds must be a positive number")
    trust = payload.get("trust_device_clock", False)
    if not isinstance(trust, bool):
        raise ValueError("trust_device_clock must be true or false")
    raw_entries = payload.get("controllers")
    if not isinstance(raw_entries, list) or not raw_entries:
        raise ValueError("controller map needs at least one controller")
    entries: list[ControllerMapEntry] = []
    seen_names: set[str] = set()
    for raw in raw_entries:
        entry = _entry_from_object(raw)
        if entry.advertised_name in seen_names:
            raise ValueError("each advertised name may map to one tent")
        seen_names.add(entry.advertised_name)
        entries.append(entry)
    return ControllerMap(
        timezone_name=timezone_name,
        stale_after_seconds=float(stale),
        trust_device_clock=trust,
        entries=tuple(entries),
    )


class StatusCsvSession:
    """Collect notifications and render one idempotent CSV."""

    def __init__(self, mapping: ControllerMap) -> None:
        self.mapping = mapping
        self._lock = threading.Lock()
        self._assemblers: dict[str, V1Reassembler] = {}
        self._events: dict[tuple[Any, ...], _Event] = {}
        self._warnings: list[str] = []
        self._warning_seen: set[str] = set()

    @property
    def warnings(self) -> tuple[str, ...]:
        with self._lock:
            return tuple(self._warnings)

    @property
    def skipped_opaque(self) -> int:
        with self._lock:
            return sum(item.skipped_opaque for item in self._assemblers.values())

    def note_reconnect(self, alias: str | None = None) -> None:
        """Clear a partial frame after the radio connection ends. Rows already kept stay."""
        with self._lock:
            if alias is None:
                for assembler in self._assemblers.values():
                    assembler.reset()
                return
            assembler = self._assemblers.get(alias)
            if assembler is not None:
                assembler.reset()

    def feed_notification(
        self,
        advertised_name: str,
        payload: bytes,
        *,
        received_at: datetime,
    ) -> None:
        if received_at.tzinfo is None:
            raise ValueError("received_at needs a timezone")
        received = received_at.astimezone(timezone.utc)
        entry = self.mapping.match(advertised_name)
        if entry is None:
            self._warn(WARN_UNMAPPED)
            return
        with self._lock:
            assembler = self._assemblers.setdefault(entry.alias, V1Reassembler())
            objects = assembler.feed(payload)
        for obj in objects:
            self._accept(entry, obj, received)

    def render_csv(self) -> str:
        with self._lock:
            events = list(self._events.values())
        rows = _rows_from_events(events, self.mapping)
        buffer = io.StringIO(newline="")
        writer = csv.DictWriter(buffer, fieldnames=COLUMNS, lineterminator="\n", extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
        return buffer.getvalue()

    def _accept(self, entry: ControllerMapEntry, obj: dict[str, Any], received: datetime) -> None:
        method = obj.get("method")
        if method != "getDevSta":
            return
        data = obj.get("data")
        if data == {} or data is None:
            self._warn(WARN_EMPTY)
            self._store(
                _Event(
                    alias=entry.alias,
                    tent_id=entry.tent_id,
                    received_at=received,
                    snapshot=None,
                    device_time=_device_time(obj, self.mapping.trust_device_clock),
                )
            )
            return
        if not isinstance(data, dict):
            return
        other_zones = [
            key for key in data if isinstance(key, str) and key.startswith("zone") and key != ZONE
        ]
        if other_zones:
            self._warn(WARN_OTHER_ZONE)
        zone = data.get(ZONE)
        if not isinstance(zone, dict):
            return
        average = _average_sensor(zone.get("sensor"))
        if average is None:
            self._warn(WARN_NO_AVERAGE)
            return
        snapshot = _snapshot_from_average(average)
        if snapshot is None:
            self._warn(WARN_EMPTY)
            return
        device_time = _device_time(obj, self.mapping.trust_device_clock)
        if self.mapping.trust_device_clock and device_time is None:
            self._warn(WARN_DEVICE_CLOCK)
        self._store(
            _Event(
                alias=entry.alias,
                tent_id=entry.tent_id,
                received_at=received,
                snapshot=snapshot,
                device_time=device_time,
            )
        )

    def _store(self, event: "_Event") -> None:
        key = event.identity()
        with self._lock:
            self._events[key] = event

    def _warn(self, message: str) -> None:
        with self._lock:
            if message in self._warning_seen:
                return
            self._warning_seen.add(message)
            self._warnings.append(message)


@dataclass(frozen=True)
class _Snapshot:
    temp: float | None
    humidity: float | None
    vpd: float | None
    flags: tuple[str, ...]


@dataclass(frozen=True)
class _Event:
    alias: str
    tent_id: str
    received_at: datetime
    snapshot: _Snapshot | None
    device_time: datetime | None

    def identity(self) -> tuple[Any, ...]:
        if self.snapshot is None:
            metrics: tuple[Any, ...] = ("empty",)
        else:
            metrics = (
                self.snapshot.temp,
                self.snapshot.humidity,
                self.snapshot.vpd,
                self.snapshot.flags,
            )
        return (
            self.alias,
            self.tent_id,
            self.received_at.isoformat(),
            self.device_time.isoformat() if self.device_time else "",
            metrics,
        )


def _rows_from_events(events: list[_Event], mapping: ControllerMap) -> list[dict[str, str]]:
    by_alias: dict[str, list[_Event]] = {}
    for event in events:
        by_alias.setdefault(event.alias, []).append(event)
    stale_ids: set[int] = set()
    for group in by_alias.values():
        ordered = sorted(group, key=lambda item: item.received_at)
        previous: datetime | None = None
        for event in ordered:
            if previous is not None:
                gap = (event.received_at - previous).total_seconds()
                if gap > mapping.stale_after_seconds:
                    stale_ids.add(id(event))
            previous = event.received_at
    rows: list[dict[str, str]] = []
    for event in events:
        if event.snapshot is None:
            continue
        rows.append(_row(event, mapping, stale=id(event) in stale_ids))
    rows.sort(key=lambda row: (row["observed_at"], row["device_alias"], row["tent_id"]))
    return rows


def _row(event: _Event, mapping: ControllerMap, *, stale: bool) -> dict[str, str]:
    assert event.snapshot is not None
    if mapping.trust_device_clock and event.device_time is not None:
        observed = event.device_time
        basis = TIME_BASIS_DEVICE
    else:
        observed = event.received_at
        basis = TIME_BASIS_RECEIVE
    flags = list(event.snapshot.flags)
    if stale:
        flags.append("stale")
    flags.sort()
    observed_text = _format_instant(observed, mapping.timezone_name)
    ingested_text = _format_instant(event.received_at, mapping.timezone_name)
    redacted = {
        "method": "getDevSta",
        "zone": ZONE,
        "sensor_id": AVERAGE_ID,
        "time_basis": basis,
        "source_app": SOURCE_APP,
        "transport": TRANSPORT,
    }
    return {
        "timestamp": observed_text,
        "temp_c": _format_number(event.snapshot.temp),
        "humidity": _format_number(event.snapshot.humidity),
        "vpd": _format_number(event.snapshot.vpd),
        "source": SOURCE,
        "tent_id": event.tent_id,
        "timezone": mapping.timezone_name,
        "observed_at": observed_text,
        "ingested_at": ingested_text,
        "device_alias": event.alias,
        "time_basis": basis,
        "source_app": SOURCE_APP,
        "transport": TRANSPORT,
        "reading_flags": ";".join(flags),
        "raw_payload": json.dumps(redacted, separators=(",", ":"), sort_keys=True),
    }


def _snapshot_from_average(average: dict[str, Any]) -> _Snapshot | None:
    temp, temp_flags = _metric(average, "temp", TEMP_MIN_C, TEMP_MAX_C, "temp")
    humidity, humidity_flags = _metric(average, "humi", HUMIDITY_MIN, HUMIDITY_MAX, "humidity")
    vpd, vpd_flags = _metric(average, "vpd", VPD_MIN_KPA, VPD_MAX_KPA, "vpd")
    if temp is None and humidity is None and vpd is None and not (temp_flags or humidity_flags or vpd_flags):
        return None
    flags = tuple(temp_flags + humidity_flags + vpd_flags)
    return _Snapshot(temp=temp, humidity=humidity, vpd=vpd, flags=flags)


def _metric(
    average: dict[str, Any],
    key: str,
    low: float,
    high: float,
    flag_name: str,
) -> tuple[float | None, list[str]]:
    if key not in average:
        return None, []
    value = average[key]
    if value is None or value == "":
        return None, []
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None, [f"{flag_name}_non_finite"]
    number = float(value)
    if not math.isfinite(number):
        return None, [f"{flag_name}_non_finite"]
    if number < low or number > high:
        return number, [f"{flag_name}_out_of_range"]
    return number, []


def _average_sensor(sensor: Any) -> dict[str, Any] | None:
    if not isinstance(sensor, list):
        return None
    for item in sensor:
        if isinstance(item, dict) and item.get("id") == AVERAGE_ID:
            return item
    return None


def _device_time(obj: dict[str, Any], trust: bool) -> datetime | None:
    if not trust:
        return None
    return parse_device_utc(obj.get("UTC"))


def parse_device_utc(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    parsed: datetime | None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        parsed = None
    if parsed is None:
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
            try:
                parsed = datetime.strptime(text, fmt).replace(tzinfo=timezone.utc)
                break
            except ValueError:
                continue
    if parsed is None:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _format_instant(moment: datetime, timezone_name: str) -> str:
    local = moment.astimezone(ZoneInfo(timezone_name)).replace(microsecond=0)
    return local.isoformat()


def _format_number(value: float | None) -> str:
    if value is None:
        return ""
    text = f"{value:.4f}".rstrip("0").rstrip(".")
    if text in {"", "-", "-0"}:
        return "0"
    return text


def _entry_from_object(raw: Any) -> ControllerMapEntry:
    if not isinstance(raw, dict):
        raise ValueError("each controller must be an object")
    name = raw.get("advertised_name")
    alias = raw.get("alias")
    tent_id = raw.get("tent_id")
    zone = raw.get("zone", ZONE)
    if not isinstance(name, str) or not name.strip() or _MAC_RE.match(name):
        raise ValueError("advertised name is not usable")
    if not isinstance(alias, str) or not alias.strip() or _MAC_RE.match(alias):
        raise ValueError("device alias must be a local name, not a hardware address")
    if not isinstance(tent_id, str) or not tent_id.strip():
        raise ValueError("each controller needs a tent_id")
    if zone != ZONE:
        raise ValueError("only zone1 is accepted")
    return ControllerMapEntry(
        advertised_name=name.strip(),
        alias=alias.strip(),
        tent_id=tent_id.strip(),
        zone=ZONE,
    )


def save_csv(path: str, text: str) -> None:
    with open(path, "w", encoding="utf-8", newline="") as handle:
        handle.write(text)
