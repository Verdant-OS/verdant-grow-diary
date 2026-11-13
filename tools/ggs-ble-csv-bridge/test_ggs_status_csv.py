"""Synthetic mapping tests. No controller is contacted."""

import csv
import io
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from ggs_status_csv import (
    SOURCE,
    SOURCE_APP,
    TRANSPORT,
    WARN_DEVICE_CLOCK,
    WARN_EMPTY,
    WARN_NO_AVERAGE,
    WARN_OTHER_ZONE,
    WARN_UNMAPPED,
    StatusCsvSession,
    load_controller_map,
)
from ggs_v1_frame import VERSION_OPAQUE, build_synthetic_frame

FIXTURES = Path(__file__).resolve().parent / "fixtures"
NAME = "SYNTHETIC-CONTROLLER-A"
T0 = datetime(2026, 11, 13, 17, 39, 19, tzinfo=timezone.utc)


def _map(**overrides):
    payload = {
        "timezone": "America/Chicago",
        "stale_after_seconds": 30,
        "trust_device_clock": False,
        "controllers": [
            {
                "advertised_name": NAME,
                "alias": "synthetic-alias-a",
                "tent_id": "synthetic-tent-alpha",
                "zone": "zone1",
            }
        ],
    }
    payload.update(overrides)
    return load_controller_map(payload)


def _status(
    *,
    temp=21.5,
    humi=55,
    vpd=1.25,
    extra=None,
    data=None,
    utc="2023-12-20 08:00:00",
    fan=None,
    light=None,
):
    if data is None:
        average = {"id": "avg1", "temp": temp, "humi": humi, "vpd": vpd}
        sensors = [average]
        if extra is not None:
            sensors.append(extra)
        zone = {"sensor": sensors}
        if fan is not None:
            zone["fan"] = fan
        if light is not None:
            zone["light"] = light
        data = {"zone1": zone}
    return {
        "method": "getDevSta",
        "code": 200,
        "msg": "ok",
        "UTC": utc,
        "data": data,
        "pid": "synthetic-token-a",
        "uid": "synthetic-token-b",
        "wifi": {"ssid": "synthetic-network"},
    }


def _push(session, obj, at, name=NAME, version=1, crc=9):
    body = json.dumps(obj, separators=(",", ":")).encode("utf-8") + b"\x11\x22"
    frame = build_synthetic_frame(body, offset=0, total=len(body), crc=crc, version=version)
    session.feed_notification(name, frame, received_at=at)


def _rows(text: str) -> list[dict[str, str]]:
    return list(csv.DictReader(io.StringIO(text)))


def test_fixture_map_matches_the_golden_row():
    raw = json.loads((FIXTURES / "synthetic-controller-map.json").read_text(encoding="utf-8"))
    session = StatusCsvSession(load_controller_map(raw))
    _push(session, _status(), T0)
    text = session.render_csv()
    expected = (FIXTURES / "synthetic-zone1-snapshot.csv").read_text(encoding="utf-8")
    assert text == expected
    row = _rows(text)[0]
    assert row["source"] == SOURCE
    assert row["source_app"] == SOURCE_APP
    assert row["transport"] == TRANSPORT
    assert row["time_basis"] == "receive"
    assert row["temp_c"] == "21.5"
    assert row["humidity"] == "55"
    assert row["vpd"] == "1.25"
    assert row["timestamp"] == "2026-11-13T11:39:19-06:00"
    assert row["observed_at"] == row["timestamp"]
    assert row["ingested_at"] == row["timestamp"]
    assert "synthetic-token-a" not in text
    assert "synthetic-token-b" not in text
    assert "synthetic-network" not in text


def test_zero_is_kept_and_empty_payload_is_not_zero():
    session = StatusCsvSession(_map())
    _push(session, _status(temp=0, humi=0, vpd=0), T0, crc=1)
    _push(session, _status(data={}), T0 + timedelta(seconds=6), crc=2)
    rows = _rows(session.render_csv())
    assert len(rows) == 1
    assert rows[0]["temp_c"] == "0"
    assert rows[0]["humidity"] == "0"
    assert rows[0]["vpd"] == "0"
    assert WARN_EMPTY in session.warnings


def test_missing_metric_stays_blank_and_does_not_invent_vpd():
    session = StatusCsvSession(_map())
    _push(session, _status(vpd=None), T0)
    # None becomes JSON null, which is missing.
    row = _rows(session.render_csv())[0]
    assert row["temp_c"] == "21.5"
    assert row["humidity"] == "55"
    assert row["vpd"] == ""
    assert row["reading_flags"] == ""


def test_non_finite_and_out_of_range_are_flagged():
    session = StatusCsvSession(_map())
    _push(session, _status(temp=float("nan"), humi=101, vpd=15.1), T0, crc=3)
    row = _rows(session.render_csv())[0]
    assert row["temp_c"] == ""
    assert row["humidity"] == "101"
    assert row["vpd"] == "15.1"
    assert row["reading_flags"].split(";") == [
        "humidity_out_of_range",
        "temp_non_finite",
        "vpd_out_of_range",
    ]


def test_stale_gap_flags_the_later_row_without_filling():
    session = StatusCsvSession(_map())
    _push(session, _status(temp=21.5), T0, crc=1)
    _push(session, _status(temp=22), T0 + timedelta(seconds=31), crc=2)
    rows = _rows(session.render_csv())
    assert len(rows) == 2
    assert rows[0]["reading_flags"] == ""
    assert rows[1]["reading_flags"] == "stale"
    assert rows[1]["temp_c"] == "22"


def test_duplicate_replay_is_idempotent():
    session = StatusCsvSession(_map())
    _push(session, _status(), T0, crc=1)
    once = session.render_csv()
    _push(session, _status(), T0, crc=1)
    assert session.render_csv() == once


def test_out_of_order_readings_sort_by_observation_time():
    ordered = StatusCsvSession(_map())
    _push(ordered, _status(temp=21), T0, crc=1)
    _push(ordered, _status(temp=22), T0 + timedelta(seconds=6), crc=2)
    reversed_feed = StatusCsvSession(_map())
    _push(reversed_feed, _status(temp=22), T0 + timedelta(seconds=6), crc=2)
    _push(reversed_feed, _status(temp=21), T0, crc=1)
    assert reversed_feed.render_csv() == ordered.render_csv()


def test_reconnect_drops_a_partial_frame_and_replay_stays_one_row():
    session = StatusCsvSession(_map())
    body = json.dumps(_status(), separators=(",", ":")).encode("utf-8") + b"\x11\x22"
    full = build_synthetic_frame(body, offset=0, total=len(body), crc=4)
    session.feed_notification(NAME, full[:24], received_at=T0)
    session.note_reconnect("synthetic-alias-a")
    session.feed_notification(NAME, full, received_at=T0 + timedelta(seconds=6))
    session.feed_notification(NAME, full, received_at=T0 + timedelta(seconds=6))
    rows = _rows(session.render_csv())
    assert len(rows) == 1
    assert rows[0]["temp_c"] == "21.5"


def test_two_controllers_map_to_two_tents():
    mapping = load_controller_map(
        {
            "timezone": "America/Chicago",
            "controllers": [
                {
                    "advertised_name": "SYNTHETIC-CONTROLLER-A",
                    "alias": "synthetic-alias-a",
                    "tent_id": "synthetic-tent-alpha",
                },
                {
                    "advertised_name": "SYNTHETIC-CONTROLLER-B",
                    "alias": "synthetic-alias-b",
                    "tent_id": "synthetic-tent-beta",
                },
            ],
        }
    )
    session = StatusCsvSession(mapping)
    _push(session, _status(temp=21), T0 + timedelta(seconds=6), name="SYNTHETIC-CONTROLLER-B", crc=2)
    _push(session, _status(temp=19), T0, name="SYNTHETIC-CONTROLLER-A", crc=1)
    rows = _rows(session.render_csv())
    assert [(row["device_alias"], row["tent_id"], row["temp_c"]) for row in rows] == [
        ("synthetic-alias-a", "synthetic-tent-alpha", "19"),
        ("synthetic-alias-b", "synthetic-tent-beta", "21"),
    ]


def test_unmapped_controller_is_skipped():
    session = StatusCsvSession(_map())
    _push(session, _status(), T0, name="SYNTHETIC-CONTROLLER-UNKNOWN")
    assert session.render_csv().strip().count("\n") == 0
    assert session.warnings == (WARN_UNMAPPED,)


def test_opaque_frame_is_counted_and_writes_no_row():
    session = StatusCsvSession(_map())
    _push(session, _status(), T0, version=VERSION_OPAQUE)
    assert session.render_csv().strip().count("\n") == 0
    assert session.skipped_opaque == 1


def test_other_sensor_entry_and_fan_and_light_are_not_emitted():
    session = StatusCsvSession(_map())
    _push(
        session,
        _status(extra={"id": "ignored-entry", "temp": 99, "humi": 1, "vpd": 9}, fan=3, light=4),
        T0,
    )
    text = session.render_csv()
    rows = _rows(text)
    assert len(rows) == 1
    assert rows[0]["temp_c"] == "21.5"
    assert "99" not in text
    assert "fan" not in text
    assert "light" not in text
    assert "ignored-entry" not in text


def test_other_zone_is_not_emitted():
    session = StatusCsvSession(_map())
    _push(
        session,
        _status(data={"zone2": {"sensor": [{"id": "avg1", "temp": 30, "humi": 40, "vpd": 1}]}}),
        T0,
    )
    assert session.render_csv().strip().count("\n") == 0
    assert WARN_OTHER_ZONE in session.warnings


def test_missing_average_does_not_use_the_other_entry():
    session = StatusCsvSession(_map())
    _push(
        session,
        _status(data={"zone1": {"sensor": [{"id": "ignored-entry", "temp": 99, "humi": 1, "vpd": 1}]}}),
        T0,
    )
    assert session.render_csv().strip().count("\n") == 0
    assert WARN_NO_AVERAGE in session.warnings


def test_device_clock_is_ignored_unless_the_map_opts_in():
    ignored = StatusCsvSession(_map())
    _push(ignored, _status(utc="2023-12-20 08:00:00"), T0)
    assert _rows(ignored.render_csv())[0]["time_basis"] == "receive"
    assert _rows(ignored.render_csv())[0]["timestamp"].startswith("2026-11-13T")

    trusted = StatusCsvSession(_map(trust_device_clock=True))
    _push(trusted, _status(utc="2023-12-20 08:00:00"), T0)
    row = _rows(trusted.render_csv())[0]
    assert row["time_basis"] == "device"
    assert row["timestamp"] == "2023-12-20T02:00:00-06:00"
    assert row["ingested_at"] == "2026-11-13T11:39:19-06:00"

    unusable = StatusCsvSession(_map(trust_device_clock=True))
    _push(unusable, _status(utc="not-a-time"), T0)
    assert _rows(unusable.render_csv())[0]["time_basis"] == "receive"
    assert WARN_DEVICE_CLOCK in unusable.warnings


def test_map_rejects_unknown_zone_duplicate_name_and_hardware_address():
    with pytest.raises(ValueError):
        load_controller_map(
            {
                "timezone": "America/Chicago",
                "controllers": [
                    {
                        "advertised_name": "SYNTHETIC-CONTROLLER-A",
                        "alias": "synthetic-alias-a",
                        "tent_id": "synthetic-tent-alpha",
                        "zone": "zone2",
                    }
                ],
            }
        )
    with pytest.raises(ValueError):
        load_controller_map(
            {
                "timezone": "America/Chicago",
                "controllers": [
                    {
                        "advertised_name": "SYNTHETIC-CONTROLLER-A",
                        "alias": "synthetic-alias-a",
                        "tent_id": "synthetic-tent-alpha",
                    },
                    {
                        "advertised_name": "SYNTHETIC-CONTROLLER-A",
                        "alias": "synthetic-alias-b",
                        "tent_id": "synthetic-tent-beta",
                    },
                ],
            }
        )
    address = ":".join(["aa"] * 6)
    with pytest.raises(ValueError):
        load_controller_map(
            {
                "timezone": "America/Chicago",
                "controllers": [
                    {
                        "advertised_name": "SYNTHETIC-CONTROLLER-A",
                        "alias": address,
                        "tent_id": "synthetic-tent-alpha",
                    }
                ],
            }
        )


def test_system_status_does_not_become_a_row():
    session = StatusCsvSession(_map())
    _push(session, {"method": "getSysSta", "data": {"zone1": {"sensor": []}}}, T0, crc=12)
    assert session.render_csv().strip().count("\n") == 0


def test_fragmented_notification_becomes_one_row():
    session = StatusCsvSession(_map())
    body = json.dumps(_status(), separators=(",", ":")).encode("utf-8") + b"\x11\x22"
    mid = 20
    session.feed_notification(
        NAME,
        b"\x00\xff" + build_synthetic_frame(body[:mid], offset=0, total=len(body), crc=11),
        received_at=T0,
    )
    session.feed_notification(
        NAME,
        build_synthetic_frame(body[mid:], offset=mid, total=len(body), crc=11),
        received_at=T0,
    )
    assert len(_rows(session.render_csv())) == 1
