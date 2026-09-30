"""Pure local routing/configuration. No hardware claims for unverified aliases."""
from __future__ import annotations

import hashlib
import json
import math
import re
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping


# Effective constants are mirrored in TypeScript through Flask-free imports.
FIELD_MAP = {
    "temp_f": ("temp1f", "tempf", "tempinf"),
    "humidity_percent": ("humidity1", "humidity", "humidityin"),
    "soil_moisture_pct": ("soilmoisture1", "soilmoisture2"),
    "co2_ppm": ("co2", "co2in", "co2_ppm"),
}

CHANNEL_FIELD_MAP = {
    "air": {"temp_f": "temp{channel}f", "humidity_percent": "humidity{channel}"},
    "in": {"temp_f": "tempinf", "humidity_percent": "humidityin"},
    "soil": {"soil_moisture_pct": "soilmoisture{channel}"},
    "soil_temp": {"soil_temp_f": "tf_ch{channel}"},
    "co2": {"co2_ppm": "co2", "temp_f": "tf_co2", "humidity_percent": "humi_co2"},
}
COMMON_FIELDS = {"stationtype", "model", "dateutc", "freq", "runtime", "source", "wh65batt", "wh25batt"}
UNITS = {"temp_f": "F", "humidity_percent": "%", "soil_moisture_pct": "%",
         "soil_temp_f": "F", "soil_temp_c": "C", "co2_ppm": "ppm", "ec_ms_cm": "mS/cm"}
SECRET_KEYS = {"passkey", "mac", "authorization", "password", "secret", "api_key",
               "apikey", "service" + "_" + "role"}
# A fixed token boundary prevents retrying at every eyJ inside a long word.
SECRET_PATTERN = re.compile(r"vbt_[A-Za-z0-9_-]+|\bbearer\s+[^\s\"'<>]+|"
                            r"(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", re.I)


class ConfigError(ValueError):
    """Only fixed, sanitized diagnostics may cross the startup boundary."""


def credential_key(key: str) -> bool:
    lower = key.lower().replace("-", "_")
    return lower in SECRET_KEYS or any(word in lower for word in (
        "token", "password", "secret", "api_key", "apikey", "passkey", "authorization"))


def sanitize(value: Any, *, secrets: tuple[str, ...] = ()) -> Any:
    """Remove credential keys and scrub credential values even under other keys."""
    def text(raw: str) -> str:
        for secret in secrets:
            if secret:
                raw = raw.replace(secret, "[REDACTED]")
        return SECRET_PATTERN.sub("[REDACTED]", raw)

    if isinstance(value, dict):
        return {text(str(k)): sanitize(v, secrets=secrets) for k, v in value.items()
                if not credential_key(str(k))}
    if isinstance(value, (tuple, list)):
        return [sanitize(v, secrets=secrets) for v in value]
    if isinstance(value, str):
        return text(value)
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if value is None or isinstance(value, (bool, int, float)):
        return value
    # Unknown leaf types are invalid data, never objects to stringify or persist.
    return None


def valid_token(value: Any) -> bool:
    if not isinstance(value, str) or not value.startswith("vbt_") or len(value) < 12:
        return False
    return bool(re.fullmatch(r"vbt_[A-Za-z0-9_-]+", value)) and not any(
        marker in value.lower() for marker in ("replace", "placeholder", "your_token", "example"))


@dataclass(frozen=True)
class Tent:
    tent_id: str
    label: str
    token_env: str
    air_channels: tuple[int | str, ...] = ()
    soil_channels: tuple[int, ...] = ()
    soil_temp_channels: tuple[int, ...] = ()
    co2: bool = False


@dataclass(frozen=True)
class Alias:
    field: str
    metric: str
    channel: int
    unit: str


def load_tent_map(path: Path, env: Mapping[str, str]) -> tuple[tuple[Tent, ...], tuple[Alias, ...]]:
    try:
        value = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, ValueError):
        raise ConfigError("Tent map cannot be read or is not valid JSON") from None
    if isinstance(value, list):
        entries, raw_aliases = value, []
    elif isinstance(value, dict) and set(value) <= {"tents", "aliases"}:
        entries, raw_aliases = value.get("tents"), value.get("aliases", [])
    else:
        raise ConfigError("Tent map must be an array or an object containing tents and aliases")
    if not isinstance(entries, list) or not 1 <= len(entries) <= 8:
        raise ConfigError("Tent map must contain between 1 and 8 tents")
    tents, identities, assigned = [], set(), set()
    token_names, token_values = set(), set()
    allowed = {"tent_id", "label", "token_env", "air_channels", "soil_channels", "soil_temp_channels", "co2"}
    for index, entry in enumerate(entries, 1):
        prefix = f"Tent map entry {index}: "
        if not isinstance(entry, dict) or set(entry) - allowed:
            raise ConfigError(prefix + "invalid keys or shape")
        tent_id = entry.get("tent_id")
        try:
            parsed_id = uuid.UUID(tent_id) if isinstance(tent_id, str) else None
        except ValueError:
            parsed_id = None
        if parsed_id is None or parsed_id.int == 0 or str(parsed_id) != str(tent_id).lower():
            raise ConfigError(prefix + "tent_id must be a non-placeholder UUID")
        tent_id = str(parsed_id)
        if tent_id in identities:
            raise ConfigError(prefix + "duplicate tent_id")
        identities.add(tent_id)
        token_env = entry.get("token_env")
        if not isinstance(token_env, str) or not re.fullmatch(r"[A-Z][A-Z0-9_]{0,63}", token_env):
            raise ConfigError(prefix + "invalid token_env name")
        if not valid_token(env.get(token_env)):
            raise ConfigError(prefix + "bridge token missing, invalid or placeholder")
        if token_env in token_names or env[token_env] in token_values:
            raise ConfigError(prefix + "bridge credentials must be unique per tent")
        token_names.add(token_env)
        token_values.add(env[token_env])
        label = entry.get("label")
        if not isinstance(label, str) or not label.strip() or len(label) > 100:
            raise ConfigError(prefix + "label must contain 1 to 100 characters")
        label = sanitize(label, secrets=tuple(v for k, v in env.items() if credential_key(k)))
        label = " ".join(label.split())
        channels = {}
        for field in ("air_channels", "soil_channels", "soil_temp_channels"):
            sequence = entry.get(field, [])
            if not isinstance(sequence, list) or len(sequence) > 9:
                raise ConfigError(prefix + "invalid channel list")
            for channel in sequence:
                if not ((type(channel) is int and 1 <= channel <= 8) or
                        (field == "air_channels" and channel == "in")):
                    raise ConfigError(prefix + "channels must be 1 through 8 (or in for air)")
                key = (field, channel)
                if key in assigned:
                    raise ConfigError(prefix + "channel assigned more than once")
                assigned.add(key)
            channels[field] = tuple(sequence)
        co2 = entry.get("co2", False)
        if type(co2) is not bool:
            raise ConfigError(prefix + "co2 must be a boolean")
        if co2:
            if ("co2", 1) in assigned:
                raise ConfigError(prefix + "CO2 channel assigned more than once")
            assigned.add(("co2", 1))
        tents.append(Tent(tent_id, label, token_env, co2=co2, **channels))
    if not isinstance(raw_aliases, list):
        raise ConfigError("Alias table must be an array")
    aliases, fields = [], set()
    for entry in raw_aliases:
        if not isinstance(entry, dict) or set(entry) != {"field", "metric", "channel", "unit"}:
            raise ConfigError("Alias requires field, metric, channel and explicit unit")
        field, metric, channel, unit = (entry[k] for k in ("field", "metric", "channel", "unit"))
        if not isinstance(field, str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,63}", field) or credential_key(field):
            raise ConfigError("Alias field is invalid or credential-like")
        field = field.lower()
        if field in fields or builtin_binding(field) is not None or field in COMMON_FIELDS:
            raise ConfigError("Alias duplicates or shadows a verified field")
        fields.add(field)
        allowed_units = {"ec_ms_cm": {"mS/cm", "uS/cm", "µS/cm"}, "soil_temp_f": {"F"}, "soil_temp_c": {"C"}}
        if not isinstance(metric, str) or metric not in allowed_units or not isinstance(unit, str) or unit not in allowed_units[metric] or type(channel) is not int or not 1 <= channel <= 8:
            raise ConfigError("Alias metric, channel or unit is unsupported")
        aliases.append(Alias(field, metric, channel, unit))
    return tuple(tents), tuple(aliases)


def builtin_binding(key: str) -> tuple[str, int | str, str] | None:
    for kind, fields in CHANNEL_FIELD_MAP.items():
        for metric, template in fields.items():
            candidates = range(1, 9) if "{channel}" in template else ("in",) if kind == "in" else (1,)
            for channel in candidates:
                if key == template.format(channel=channel):
                    return ("air" if kind == "in" else kind, channel, metric)
    return None


def numeric(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        result = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return result if math.isfinite(result) else None


def checked_value(metric: str, value: Any, unit: str) -> float | None:
    result = numeric(value)
    if result is None:
        return None
    if metric == "ec_ms_cm" and unit in {"uS/cm", "µS/cm"}:
        result /= 1000
    bounds = {"temp_f": (14, 140), "soil_temp_f": (-4, 176), "soil_temp_c": (-20, 80),
              "co2_ppm": (250, 5000), "ec_ms_cm": (0, 10),
              "humidity_percent": (0, 100), "soil_moisture_pct": (0, 100)}
    low, high = bounds[metric]
    if not low <= result <= high or metric in {"humidity_percent", "soil_moisture_pct"} and result in {0, 100}:
        return None
    return result


def gateway_secrets(payload: Mapping[str, Any]) -> tuple[str, ...]:
    return tuple(sorted({value for key, value in payload.items()
                         if str(key).lower() == "passkey" and isinstance(value, str) and value}))


def gateway_fingerprint(payload: Mapping[str, Any]) -> str:
    values = gateway_secrets(payload)
    return hashlib.sha256(values[0].encode("utf-8")).hexdigest()[:16] if len(values) == 1 else "unknown"


def route_packet(raw: dict[str, Any], tents: tuple[Tent, ...], aliases: tuple[Alias, ...],
                 *, secrets: tuple[str, ...] = ()) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    fingerprint = gateway_fingerprint(raw)
    safe = sanitize(raw, secrets=secrets + gateway_secrets(raw))
    packets = [{"tent_id": t.tent_id, "metrics": {}, "invalid": False,
                "metadata": {"device_id": f"ecowitt:{fingerprint}:gateway", "primary_channels": {},
                             "channels": [], "raw_payload": {}}} for t in tents]
    grouped: dict[str, list[tuple[str, Any]]] = {}
    for key, value in sorted(safe.items()):
        grouped.setdefault(key.lower(), []).append((key, value))
    configured = {a.field: a for a in aliases}
    unmapped = {}
    for key, values in sorted(grouped.items()):
        if key in COMMON_FIELDS:
            for packet in packets:
                packet["metadata"]["raw_payload"].update(values)
            continue
        alias = configured.get(key)
        binding = (("soil" if alias.metric == "ec_ms_cm" else "soil_temp", alias.channel, alias.metric)
                   if alias else builtin_binding(key))
        if binding is None:
            unmapped.update(values)
            continue
        kind, channel, metric = binding
        owner = next((i for i, t in enumerate(tents) if (t.co2 if kind == "co2" else
                     channel in getattr(t, {"air": "air_channels", "soil": "soil_channels", "soil_temp": "soil_temp_channels"}[kind]))), None)
        if owner is None:
            unmapped.update(values)
            continue
        packet, t = packets[owner], tents[owner]
        packet["metadata"]["raw_payload"].update(values)
        unit = alias.unit if alias else UNITS[metric]
        conflicting = len({json.dumps(v, sort_keys=True) for _, v in values}) > 1
        value = None if conflicting else checked_value(metric, values[0][1], unit)
        packet["invalid"] |= value is None
        descriptor = {"value": value, "unit": UNITS[metric], "channel": channel, "label": t.label,
                      "device_id": f"ecowitt:{fingerprint}:{kind}_ch{channel}", "metric": metric,
                      "field": key, "quality": "invalid" if value is None else "measured"}
        primary_channel = (1 if kind == "co2" else getattr(t, {"air": "air_channels", "soil": "soil_channels", "soil_temp": "soil_temp_channels"}[kind])[0])
        primary = channel == primary_channel and not (kind == "co2" and metric != "co2_ppm")
        if primary:
            # Two aliases targeting one canonical metric are ambiguous. Refuse
            # rather than let dictionary order pick a sensor/value.
            if metric in packet["metadata"]["primary_channels"]:
                packet["metrics"].pop(metric, None)
                packet["invalid"] = True
                packet["metadata"]["channels"].append(descriptor)
            else:
                packet["metadata"]["primary_channels"][metric] = descriptor
                if value is not None:
                    packet["metrics"][metric] = value
        else:
            packet["metadata"]["channels"].append(descriptor)
    for packet in packets:
        metrics = packet["metrics"]
        if "soil_temp_f" in metrics and "soil_temp_c" in metrics:
            # Both normalize to the same stored soil-temperature metric. There
            # is no honest way to choose a probe from conflicting field families.
            del metrics["soil_temp_f"], metrics["soil_temp_c"]
            packet["invalid"] = True
        if "temp_f" in metrics and "humidity_percent" in metrics:
            temp_c = (metrics["temp_f"] - 32) * 5 / 9
            vpd = 0.6108 * math.exp(17.27 * temp_c / (temp_c + 237.3)) * (1 - metrics["humidity_percent"] / 100)
            if 0 <= vpd <= 5:
                metrics["vpd_kpa"] = round(vpd, 6)
            else:
                packet["invalid"] = True
    return packets, unmapped
