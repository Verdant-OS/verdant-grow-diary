"""Static checks. The listener module is not imported, so no radio library is required."""

from pathlib import Path

ROOT = Path(__file__).resolve().parent
BRIDGE = (ROOT / "ggs_ble_csv_bridge.py").read_text(encoding="utf-8")
README = (ROOT / "README.md").read_text(encoding="utf-8")
STATUS = (ROOT / "ggs_status_csv.py").read_text(encoding="utf-8")

BANNED_GROWER_WORDS = ("live", "confirmed", "certain", "synced", "guaranteed", "streaming")


def test_listener_has_no_gatt_write_or_request_call():
    lowered = BRIDGE.lower()
    for token in (
        "write_gatt_char",
        "write_gatt_descriptor",
        "read_gatt_char",
        "read_gatt_descriptor",
        ".write(",
        "ff02",
        "mqtt",
        "paho",
        "urllib",
        "requests",
        "socket",
    ):
        assert token not in lowered
    assert BRIDGE.count("start_notify(") == 1
    assert "start_notify(STATUS_NOTIFY" in BRIDGE
    assert "0000ff01-0000-1000-8000-00805f9b34fb" in BRIDGE
    assert "000000ff-0000-1000-8000-00805f9b34fb" in BRIDGE


def test_grower_text_avoids_banned_product_words():
    blob = "\n".join((BRIDGE, README, STATUS))
    for word in BANNED_GROWER_WORDS:
        assert word not in blob.lower()
