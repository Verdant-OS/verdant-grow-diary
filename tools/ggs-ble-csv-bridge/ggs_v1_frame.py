"""Reassemble plaintext status frames for the measured 20-byte header.

The header sketch is magic AA AA, marker 00 03, then the fields in the order
the measurement lists them (payload length, chunk offset, chunk length, header
CRC), with the version word at the end of the 20 bytes. Version 00 01 is
plaintext. Version 00 02 is counted and discarded without inspection. The CRC
is a pairing key only; its polynomial was not measured, so it is not recomputed.

This layout has not been run against a controller. Synthetic tests build frames
with the same layout.
"""

from __future__ import annotations

import json
import struct
from typing import Any

HEADER_LENGTH = 20
MAGIC = b"\xaa\xaa"
MARKER = 0x0003
VERSION_PLAINTEXT = 0x0001
VERSION_OPAQUE = 0x0002
MAX_PAYLOAD_LENGTH = 16 * 1024
MAX_CHUNK_LENGTH = 8 * 1024
_HEADER_STRUCT = struct.Struct(">2sHHHHH6sH")

_NEED_MORE = object()
_CONSUMED = object()


class V1Reassembler:
    """Byte buffer that yields complete JSON objects from version 00 01 frames."""

    def __init__(self) -> None:
        self._buf = bytearray()
        self._groups: dict[tuple[int, int], dict[int, bytes]] = {}
        self.skipped_opaque = 0
        self.stripped_prefix_bytes = 0
        self.unrecognized_headers = 0
        self.rejected_payloads = 0

    def reset(self) -> None:
        """Drop a partial frame. Used when the controller connection ends."""
        self._buf.clear()
        self._groups.clear()

    def feed(self, data: bytes) -> list[dict[str, Any]]:
        if data:
            self._buf.extend(data)
        found: list[dict[str, Any]] = []
        while True:
            step = self._step()
            if step is _NEED_MORE:
                return found
            if isinstance(step, dict):
                found.append(step)

    def _step(self) -> object:
        buf = self._buf
        if not buf:
            return _NEED_MORE
        start = buf.find(MAGIC)
        if start < 0:
            keep = 1 if buf[-1:] == b"\xaa" else 0
            self.stripped_prefix_bytes += len(buf) - keep
            del buf[: len(buf) - keep]
            return _NEED_MORE
        if start > 0:
            self.stripped_prefix_bytes += start
            del buf[:start]
        if len(buf) < HEADER_LENGTH:
            return _NEED_MORE
        magic, marker, total, offset, chunk_len, crc, _unused, version = _HEADER_STRUCT.unpack(
            buf[:HEADER_LENGTH]
        )
        if magic != MAGIC or marker != MARKER or version not in (VERSION_PLAINTEXT, VERSION_OPAQUE):
            self.unrecognized_headers += 1
            del buf[:2]
            return _CONSUMED
        if not _chunk_fits(total, offset, chunk_len):
            self.unrecognized_headers += 1
            del buf[:2]
            return _CONSUMED
        framed = HEADER_LENGTH + chunk_len
        if len(buf) < framed:
            return _NEED_MORE
        body = bytes(buf[HEADER_LENGTH:framed])
        del buf[:framed]
        if version == VERSION_OPAQUE:
            self.skipped_opaque += 1
            return _CONSUMED
        group = self._groups.setdefault((crc, total), {})
        previous = group.get(offset)
        if previous is None:
            group[offset] = body
        elif previous != body:
            self.rejected_payloads += 1
        return self._try_finish(crc, total)

    def _try_finish(self, crc: int, total: int) -> object:
        group = self._groups[(crc, total)]
        cursor = 0
        parts: list[bytes] = []
        while cursor < total:
            part = group.get(cursor)
            if part is None:
                return _CONSUMED
            parts.append(part)
            cursor += len(part)
        if cursor != total:
            return _CONSUMED
        del self._groups[(crc, total)]
        obj = extract_json_object(b"".join(parts))
        if obj is None:
            self.rejected_payloads += 1
            return _CONSUMED
        return obj


def extract_json_object(payload: bytes) -> dict[str, Any] | None:
    """Take the first JSON object. Allow a 0-byte or 2-byte trailer. Nothing else."""
    start = payload.find(b"{")
    if start < 0:
        return None
    depth = 0
    in_string = False
    escaped = False
    end: int | None = None
    for index in range(start, len(payload)):
        byte = payload[index]
        if in_string:
            if escaped:
                escaped = False
            elif byte == 0x5C:
                escaped = True
            elif byte == 0x22:
                in_string = False
            continue
        if byte == 0x22:
            in_string = True
        elif byte == 0x7B:
            depth += 1
        elif byte == 0x7D:
            depth -= 1
            if depth == 0:
                end = index
                break
    if end is None:
        return None
    if len(payload) - (end + 1) not in (0, 2):
        return None
    try:
        parsed = json.loads(payload[start : end + 1])
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    if not isinstance(parsed, dict):
        return None
    return parsed


def build_synthetic_frame(
    body: bytes,
    *,
    offset: int = 0,
    total: int | None = None,
    crc: int = 1,
    version: int = VERSION_PLAINTEXT,
    marker: int = MARKER,
) -> bytes:
    """Build one synthetic frame. Tests use this. It is not a capture."""
    payload_length = len(body) if total is None else total
    header = _HEADER_STRUCT.pack(
        MAGIC,
        marker,
        payload_length,
        offset,
        len(body),
        crc,
        b"\x00" * 6,
        version,
    )
    return header + body


def _chunk_fits(total: int, offset: int, chunk_len: int) -> bool:
    if chunk_len <= 0 or chunk_len > MAX_CHUNK_LENGTH:
        return False
    if total <= 0 or total > MAX_PAYLOAD_LENGTH:
        return False
    if offset < 0 or offset > total:
        return False
    return offset + chunk_len <= total
