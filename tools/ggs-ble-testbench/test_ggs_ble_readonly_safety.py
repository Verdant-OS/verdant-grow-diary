"""
Static safety guard for the GGS BLE capture tool.

The single most important property of this testbench is that it is READ-ONLY:
it may subscribe to the status-notify characteristic (ff01) but must NEVER
write any characteristic, and must NEVER use the command-write characteristic
(ff02) for anything but a refusal assertion. These text assertions fail CI-
style if a future edit introduces a write path.

Runs offline:  `pytest test_ggs_ble_readonly_safety.py`
"""

import os
import re

HERE = os.path.dirname(__file__)


def _read(name: str) -> str:
    with open(os.path.join(HERE, name), encoding="utf-8") as fh:
        return fh.read()


CAPTURE = _read("ggs_ble_capture.py")
MAP = _read("ggs_ble_map.py")
FRAME = _read("ggs_ble_frame.py")


def test_never_writes_a_gatt_characteristic():
    for forbidden in ("write_gatt_char", "write_gatt_descriptor", "pair("):
        assert forbidden not in CAPTURE, f"read-only violation: {forbidden}"


def test_command_write_uuid_is_only_ever_referenced_as_forbidden():
    # The ff02 constant must carry the FORBIDDEN marker and never be handed to
    # start_notify or any write call.
    assert "GGS_COMMAND_WRITE_UUID_FORBIDDEN" in CAPTURE
    assert re.search(r"start_notify\(\s*GGS_COMMAND_WRITE_UUID", CAPTURE) is None
    assert re.search(r"start_notify\(\s*GGS_STATUS_NOTIFY_UUID", CAPTURE) is not None


def test_only_the_status_characteristic_is_subscribed():
    # Exactly one start_notify target, and it is the status characteristic.
    targets = re.findall(r"start_notify\(\s*([A-Za-z_][A-Za-z0-9_]*)", CAPTURE)
    assert targets, "expected a start_notify call"
    assert set(targets) == {"GGS_STATUS_NOTIFY_UUID"}


def test_no_actuation_or_setpoint_call_in_the_pipeline():
    # Look for actuation CALL FORMS (with a paren), so the read-only safety
    # PROSE ("no setpoints, no commands") never trips this guard.
    for src in (CAPTURE, MAP, FRAME):
        low = src.lower()
        for call in ("set_fan(", "set_light(", "send_command(", "actuate(",
                     "write_setpoint(", "set_schedule("):
            assert call not in low, f"unexpected control call: {call}"


def test_mapper_never_labels_ble_data_live():
    # BLE-derived data is demo-only until a separately-gated live adapter.
    assert '"_verdant_source": "demo"' in MAP or "_verdant_source" in MAP
    assert '"live"' not in MAP


def test_capture_redacts_device_address():
    assert "def redact_address" in CAPTURE
    # the raw dev.address must not be written into the capture record
    assert '"device": red' in CAPTURE
