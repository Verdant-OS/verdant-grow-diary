"""
Pure, transport-agnostic reassembly of Spider Farmer GGS BLE notification
frames into JSON objects. No BLE, no I/O, no network — unit-testable in
isolation (`pytest test_ggs_ble_frame.py`).

Why this exists
---------------
The GGS status characteristic (0000ff01-0000-1000-8000-00805f9b34fb) pushes
"plain JSON" telemetry, but the raw byte stream is messy in two documented
ways (see the cr0ssn0tice reverse-engineering notes referenced in README.md):

  * binary/garbage bytes may PRECEDE a valid JSON object, and
  * a single JSON object may SPAN multiple BLE notification packets.

`GgsFrameReassembler.feed(chunk)` accumulates raw notification bytes and
returns each COMPLETE top-level JSON object as soon as it closes, leaving any
trailing partial bytes buffered for the next packet. Brace counting is string-
and escape-aware, so a close-brace inside a JSON string value never closes an
object early. Byte-level scanning is safe because the four structural bytes
(0x7B open, 0x7D close, 0x22 quote, 0x5C backslash) are all ASCII and never
collide with UTF-8 multibyte continuation bytes (>= 0x80).

This module NEVER writes to the controller and NEVER interprets a command
characteristic — it only parses inbound notification bytes.
"""

from __future__ import annotations

import json
from typing import Any

# Guardrails so a pathological / adversarial stream cannot exhaust memory.
DEFAULT_MAX_BUFFER_BYTES = 64 * 1024
DEFAULT_MAX_OBJECT_BYTES = 16 * 1024

_OPEN = 0x7B   # {
_CLOSE = 0x7D  # }
_QUOTE = 0x22  # "
_BACKSLASH = 0x5C  # \


class GgsFrameReassembler:
    """Stateful reassembler. One instance per BLE connection/stream."""

    def __init__(
        self,
        max_buffer_bytes: int = DEFAULT_MAX_BUFFER_BYTES,
        max_object_bytes: int = DEFAULT_MAX_OBJECT_BYTES,
    ) -> None:
        self._buf = bytearray()
        self._max_buffer_bytes = max_buffer_bytes
        self._max_object_bytes = max_object_bytes
        # Diagnostics, surfaced by the capture tool (never raised).
        self.dropped_prefix_bytes = 0
        self.reset_count = 0
        self.parse_error_count = 0

    def feed(self, chunk: bytes) -> list[dict[str, Any]]:
        """Append raw notification bytes; return any objects now complete."""
        if chunk:
            self._buf.extend(chunk)
        # Runaway guard: if we have buffered far more than any real frame and
        # still cannot close an object, the stream is desynced — drop it.
        if len(self._buf) > self._max_buffer_bytes:
            self._buf.clear()
            self.reset_count += 1
            return []
        return self._drain()

    def _drain(self) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        while True:
            obj = self._extract_one()
            if obj is _NOTHING:
                break
            if obj is not _MALFORMED:
                out.append(obj)  # type: ignore[arg-type]
        return out

    def _extract_one(self):
        # 1. Discard any leading garbage before the first '{'.
        start = self._buf.find(_OPEN)
        if start == -1:
            # No object start at all — keep only nothing (all garbage so far).
            if self._buf:
                self.dropped_prefix_bytes += len(self._buf)
                self._buf.clear()
            return _NOTHING
        if start > 0:
            self.dropped_prefix_bytes += start
            del self._buf[:start]

        # 2. Scan for the matching top-level close, string/escape-aware.
        depth = 0
        in_string = False
        escape = False
        for i, b in enumerate(self._buf):
            # Single-object size guard FIRST, so it fires even mid-string: an
            # unclosed object that grows past the cap is desynced garbage —
            # drop the oversized slice and resync on the next '{'.
            if i + 1 > self._max_object_bytes:
                del self._buf[: i + 1]
                self.reset_count += 1
                return _MALFORMED
            if escape:
                escape = False
                continue
            if in_string:
                if b == _BACKSLASH:
                    escape = True
                elif b == _QUOTE:
                    in_string = False
                continue
            if b == _QUOTE:
                in_string = True
            elif b == _OPEN:
                depth += 1
            elif b == _CLOSE:
                depth -= 1
                if depth == 0:
                    raw = bytes(self._buf[: i + 1])
                    del self._buf[: i + 1]
                    return self._parse(raw)
        # Ran out of buffered bytes before closing — wait for more packets.
        return _NOTHING

    def _parse(self, raw: bytes):
        try:
            value = json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            self.parse_error_count += 1
            return _MALFORMED
        if not isinstance(value, dict):
            # Only top-level JSON objects are treated as GGS frames.
            self.parse_error_count += 1
            return _MALFORMED
        return value

    @property
    def buffered_bytes(self) -> int:
        return len(self._buf)


# Sentinels distinguishing "no complete object yet" from "a malformed slice
# was dropped" without allocating.
_NOTHING = object()
_MALFORMED = object()
