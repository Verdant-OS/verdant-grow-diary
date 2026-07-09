"""
Unit tests for the pure GGS BLE -> Verdant demo mapper (`ggs_ble_map.py`).
Runs offline:  `pytest test_ggs_ble_map.py`
"""

import json
import os

from ggs_ble_map import map_ble_frame_to_verdant_demo

HERE = os.path.dirname(__file__)
with open(os.path.join(HERE, "fixtures", "ggs_ble_sample_notification.json")) as fh:
    SAMPLE = json.load(fh)


def test_maps_sample_to_flat_celsius_draft():
    out = map_ble_frame_to_verdant_demo(SAMPLE)
    assert out["temp_c"] == 23.3
    assert out["humidity"] == 37.7
    assert out["vpd_kpa"] == 1.78
    assert "temp_f" not in out


def test_always_labeled_demo_never_live():
    out = map_ble_frame_to_verdant_demo(SAMPLE)
    assert out["_verdant_source"] == "demo"
    # No timestamp is emitted, so Verdant freshness can't read it as live.
    for k in ("captured_at", "timestamp", "ts", "time"):
        assert k not in out


def test_fan_and_light_flattened_to_strings():
    out = map_ble_frame_to_verdant_demo(SAMPLE)
    assert out["fan_state"] == "on, level 5"
    assert out["light_state"] == "level 26"


def test_fan_off_reads_off():
    out = map_ble_frame_to_verdant_demo({"fan": {"on": 0, "level": 0}})
    assert out["fan_state"] == "off"


def test_fahrenheit_units_route_to_temp_f():
    out = map_ble_frame_to_verdant_demo({"sensor": {"temp": 74.0}}, units="F")
    assert out["temp_f"] == 74.0
    assert "temp_c" not in out


def test_missing_sensor_fields_are_simply_absent():
    out = map_ble_frame_to_verdant_demo({"sensor": {"temp": 20.0}})
    assert out["temp_c"] == 20.0
    assert "humidity" not in out
    assert "vpd_kpa" not in out


def test_controller_id_passthrough():
    out = map_ble_frame_to_verdant_demo(SAMPLE, controller_id="ggs-abc123")
    assert out["controller_id"] == "ggs-abc123"


def test_provider_and_transport_are_stamped():
    out = map_ble_frame_to_verdant_demo(SAMPLE)
    assert out["provider"] == "spider_farmer_ggs"
    assert out["transport"] == "bridge"


def test_non_numeric_sensor_values_are_dropped():
    out = map_ble_frame_to_verdant_demo({"sensor": {"temp": "N/A", "humi": None}})
    assert "temp_c" not in out
    assert "humidity" not in out
