"""
Unit tests for the pure GGS BLE frame reassembler (`ggs_ble_frame.py`).

Runs offline with no BLE hardware:  `pytest test_ggs_ble_frame.py`

Covers the two documented stream hazards (leading garbage, multi-packet
spanning) plus brace-in-string safety, multiple frames per chunk, size
guards, and malformed input — so the capture tool can trust reassembly
before any real controller is on the bench.
"""

import json

from ggs_ble_frame import GgsFrameReassembler

SAMPLE = {
    "sensor": {"temp": 23.3, "humi": 37.7, "vpd": 1.78},
    "fan": {"on": 1, "level": 5},
    "light": {"level": 26},
}
SAMPLE_BYTES = json.dumps(SAMPLE, separators=(",", ":")).encode("utf-8")


def test_single_clean_frame():
    r = GgsFrameReassembler()
    out = r.feed(SAMPLE_BYTES)
    assert out == [SAMPLE]
    assert r.buffered_bytes == 0


def test_leading_garbage_is_stripped():
    r = GgsFrameReassembler()
    out = r.feed(b"\x00\x01\xff\xfeGGS" + SAMPLE_BYTES)
    assert out == [SAMPLE]
    assert r.dropped_prefix_bytes == len(b"\x00\x01\xff\xfeGGS")


def test_object_spanning_multiple_packets():
    r = GgsFrameReassembler()
    mid = len(SAMPLE_BYTES) // 2
    assert r.feed(SAMPLE_BYTES[:mid]) == []  # incomplete → nothing yet
    assert r.buffered_bytes > 0
    out = r.feed(SAMPLE_BYTES[mid:])
    assert out == [SAMPLE]
    assert r.buffered_bytes == 0


def test_object_spanning_three_packets_with_garbage():
    r = GgsFrameReassembler()
    a, b = len(SAMPLE_BYTES) // 3, 2 * len(SAMPLE_BYTES) // 3
    assert r.feed(b"\xde\xad" + SAMPLE_BYTES[:a]) == []
    assert r.feed(SAMPLE_BYTES[a:b]) == []
    assert r.feed(SAMPLE_BYTES[b:]) == [SAMPLE]


def test_two_frames_in_one_chunk():
    r = GgsFrameReassembler()
    out = r.feed(SAMPLE_BYTES + SAMPLE_BYTES)
    assert out == [SAMPLE, SAMPLE]


def test_brace_inside_string_does_not_close_early():
    payload = {"note": "a } that must not close {the} frame", "temp": 21.0}
    raw = json.dumps(payload).encode("utf-8")
    r = GgsFrameReassembler()
    assert r.feed(raw) == [payload]


def test_escaped_quote_inside_string():
    payload = {"label": 'say \\"hi\\" }{', "humi": 50}
    raw = json.dumps(payload).encode("utf-8")
    r = GgsFrameReassembler()
    out = r.feed(raw)
    assert out == [json.loads(raw.decode())]


def test_trailing_partial_after_complete_object_is_buffered():
    r = GgsFrameReassembler()
    out = r.feed(SAMPLE_BYTES + b'{"sensor":{"temp":19')
    assert out == [SAMPLE]
    assert r.buffered_bytes > 0  # the partial next frame waits
    # closing the partial completes it
    out2 = r.feed(b".0}}")
    assert out2 == [{"sensor": {"temp": 19.0}}]


def test_non_object_top_level_is_rejected():
    r = GgsFrameReassembler()
    # a bare JSON array is not a GGS frame
    assert r.feed(b"[1,2,3]") == []
    assert r.parse_error_count == 0  # no '{' → treated as garbage, not a parse error


def test_oversized_unclosed_object_is_dropped():
    r = GgsFrameReassembler(max_object_bytes=64)
    # 200 bytes of an object that never closes
    assert r.feed(b"{" + b'"x":"' + b"A" * 200) == []
    assert r.reset_count >= 1


def test_buffer_runaway_guard_resets():
    r = GgsFrameReassembler(max_buffer_bytes=128)
    assert r.feed(b"garbage-with-no-brace" * 20) == []
    # all-garbage (no '{') is dropped as prefix; buffer stays empty
    assert r.buffered_bytes == 0


def test_recovers_after_malformed_frame():
    # cap large enough for the real SAMPLE (~92B) but smaller than the desync.
    r = GgsFrameReassembler(max_object_bytes=256)
    r.feed(b"{" + b"A" * 400)  # desync: unclosed object > cap
    assert r.reset_count >= 1
    out = r.feed(SAMPLE_BYTES)  # clean frame after the mess
    assert out == [SAMPLE]
