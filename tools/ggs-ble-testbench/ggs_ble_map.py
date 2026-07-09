"""
Pure mapping from an observed Spider Farmer GGS BLE notification object to a
Verdant sensor-draft INPUT. No BLE, no I/O — unit-testable in isolation.

The BLE status frame is NESTED, e.g.
    {"sensor":{"temp":23.3,"humi":37.7,"vpd":1.78},
     "fan":{"on":1,"level":5},"light":{"level":26}}

Verdant's normalizer (`src/lib/spiderFarmerGgsMappingRules.ts`) reads a FLAT
draft input: numeric `temp_c` / `humidity` / `vpd_kpa`, and STRING
`fan_state` / `light_state` context. This module bridges the two.

TRANSPORT-LADDER DISCIPLINE (docs/integrations/spider-farmer-ggs-transport-ladder.md)
-------------------------------------------------------------------------------------
BLE-derived payloads are labeled **source=demo** — ALWAYS, no exceptions here.
Rung 1 is capture-only; rung 3 (`source=live`) is a separately-gated slice that
must validate the controller model, units, and freshness first. This mapper
therefore:
  * stamps `_verdant_source = "demo"`, and
  * deliberately emits NO timestamp, so Verdant's freshness rules can never
    mistake a captured frame for current live telemetry.

Unit note: the observed `sensor.temp` example (23.3) is in the controller's
CONFIGURED display unit. Pass units="F" if your controller/app displays
Fahrenheit; the value is mapped to `temp_f` instead of `temp_c` and Verdant
converts. Default assumes Celsius — VERIFY against the app display before
trusting either (rung-3 validation requirement).
"""

from __future__ import annotations

from typing import Any

PROVIDER = "spider_farmer_ggs"


def _num(o: Any, key: str):
    if isinstance(o, dict) and isinstance(o.get(key), (int, float)):
        return o[key]
    return None


def _fan_state(fan: Any) -> str | None:
    if not isinstance(fan, dict):
        return None
    on = fan.get("on")
    level = fan.get("level")
    if on in (0, False):
        return "off"
    parts = []
    if on in (1, True):
        parts.append("on")
    if isinstance(level, (int, float)):
        parts.append(f"level {level}")
    return ", ".join(parts) if parts else None


def _light_state(light: Any) -> str | None:
    if not isinstance(light, dict):
        return None
    level = light.get("level")
    if isinstance(level, (int, float)):
        return f"level {level}"
    return None


def map_ble_frame_to_verdant_demo(
    frame: dict[str, Any],
    units: str = "C",
    controller_id: str | None = None,
) -> dict[str, Any]:
    """Flatten one GGS BLE frame into a demo-labeled Verdant draft input."""
    sensor = frame.get("sensor") if isinstance(frame, dict) else None
    out: dict[str, Any] = {
        "provider": PROVIDER,
        "transport": "bridge",
        # Never 'live'. See module docstring / transport-ladder ADR.
        "_verdant_source": "demo",
        "_verdant_note": (
            "GGS BLE capture — demo-labeled. Not validated live telemetry."
        ),
    }

    temp = _num(sensor, "temp")
    if temp is not None:
        out["temp_f" if units.upper() == "F" else "temp_c"] = temp
    humi = _num(sensor, "humi")
    if humi is not None:
        out["humidity"] = humi
    vpd = _num(sensor, "vpd")
    if vpd is not None:
        out["vpd_kpa"] = vpd

    fan = _fan_state(frame.get("fan"))
    if fan is not None:
        out["fan_state"] = fan
    light = _light_state(frame.get("light"))
    if light is not None:
        out["light_state"] = light

    if controller_id:
        out["controller_id"] = controller_id

    return out
