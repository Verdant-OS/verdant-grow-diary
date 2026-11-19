"""Synthetic frame tests. These bytes were built in the test, not captured."""

import json

from ggs_v1_frame import (
    VERSION_OPAQUE,
    VERSION_PLAINTEXT,
    V1Reassembler,
    build_synthetic_frame,
)


def _body(obj: dict) -> bytes:
    return json.dumps(obj).encode("utf-8") + b"\xab\xcd"


def test_garbage_prefix_and_two_chunks_yield_one_object():
    payload = _body({"method": "getDevSta", "data": {"zone1": {"sensor": [{"id": "avg1"}]}}})
    first, second = payload[:12], payload[12:]
    frame_one = build_synthetic_frame(first, offset=0, total=len(payload), crc=4)
    frame_two = build_synthetic_frame(second, offset=12, total=len(payload), crc=4)
    assembler = V1Reassembler()
    assert assembler.feed(b"\x00\xffgarbage" + frame_one) == []
    found = assembler.feed(frame_two)
    assert len(found) == 1
    assert found[0]["method"] == "getDevSta"
    assert assembler.stripped_prefix_bytes >= len(b"\x00\xffgarbage")


def test_duplicate_chunk_is_idempotent():
    payload = _body({"method": "getDevSta", "n": 1})
    first, second = payload[:8], payload[8:]
    frame_one = build_synthetic_frame(first, offset=0, total=len(payload), crc=5)
    frame_two = build_synthetic_frame(second, offset=8, total=len(payload), crc=5)
    assembler = V1Reassembler()
    assembler.feed(frame_one)
    assembler.feed(frame_one)
    found = assembler.feed(frame_two)
    assert len(found) == 1
    assert found[0]["n"] == 1


def test_chunks_out_of_order_still_assemble():
    payload = _body({"method": "getDevSta", "n": 2})
    first, second = payload[:8], payload[8:]
    frame_one = build_synthetic_frame(first, offset=0, total=len(payload), crc=6)
    frame_two = build_synthetic_frame(second, offset=8, total=len(payload), crc=6)
    assembler = V1Reassembler()
    assert assembler.feed(frame_two) == []
    found = assembler.feed(frame_one)
    assert found[0]["n"] == 2


def test_opaque_version_is_skipped_and_not_parsed():
    secret = _body({"method": "getDevSta", "data": {"zone1": {"sensor": [{"id": "avg1", "temp": 1}]}}})
    opaque = build_synthetic_frame(secret, offset=0, total=len(secret), crc=8, version=VERSION_OPAQUE)
    assembler = V1Reassembler()
    assert assembler.feed(opaque) == []
    assert assembler.skipped_opaque == 1
    plain = build_synthetic_frame(
        _body({"method": "getDevSta", "n": 3}),
        offset=0,
        total=len(_body({"method": "getDevSta", "n": 3})),
        crc=9,
        version=VERSION_PLAINTEXT,
    )
    found = assembler.feed(plain)
    assert [item["n"] for item in found] == [3]


def test_unframed_json_is_not_accepted():
    assembler = V1Reassembler()
    raw = json.dumps({"method": "getDevSta"}).encode("utf-8")
    assert assembler.feed(raw) == []


def test_reset_drops_a_partial_frame():
    payload = _body({"method": "getDevSta", "n": 4})
    first, second = payload[:8], payload[8:]
    assembler = V1Reassembler()
    assembler.feed(build_synthetic_frame(first, offset=0, total=len(payload), crc=3))
    assembler.reset()
    found = assembler.feed(build_synthetic_frame(second, offset=8, total=len(payload), crc=3))
    assert found == []
