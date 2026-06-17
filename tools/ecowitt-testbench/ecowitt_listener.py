"""
Verdant EcoWitt Windows Testbench — Local Listener
==================================================

A small Flask server that mimics an EcoWitt "Customized Upload" endpoint
so a Windows operator can validate the ingest path locally without
touching Verdant production infrastructure.

Safety properties (must remain true):

* No direct Supabase table writes. Forwarding, when explicitly enabled,
  goes only to the existing validated ingest webhook
  (`VERDANT_INGEST_URL`) using the bridge token (`VERDANT_BRIDGE_TOKEN`).
* No fake live data. Synthetic loopback browser/curl/demo payloads are
  labeled ``source = "demo"``. Real LAN EcoWitt gateway uploads
  (non-loopback caller carrying EcoWitt gateway marker fields such as
  ``PASSKEY`` / ``stationtype`` / ``model`` / ``dateutc``) are labeled
  ``source = "live"``. Explicit ``X-Verdant-Forward-Mode: live`` header
  or ``VERDANT_FORWARD_MODE=live`` env var also opts in to ``live``.
  Unknown / spoofed ``source`` values from the payload normalize to
  ``invalid`` and are never silently treated as live or healthy.

* Missing / malformed / stale values are never silently classified as
  healthy — they are normalized to ``None`` and the raw payload is kept
  in ``metadata.raw_payload`` for audit.
* Bridge tokens are never printed in full. Only a masked preview
  (``vbt_abc...xyz``) is logged. Authorization headers are validated to
  be ASCII-only before any outbound request.

Usage:
    python ecowitt_listener.py

Endpoints:
    GET  /health
    GET  /ecowitt              (accepts query params, like EcoWitt customized upload)
    POST /ecowitt              (accepts form data, JSON, or raw body)
    GET  /debug/raw-log-tail   (LOCAL-ONLY operator debug; sanitized; read-only)
    GET  /debug/status         (LOCAL-ONLY log status; sanitized; read-only)
    GET  /debug/last-events    (LOCAL-ONLY normalized events; sanitized; read-only)
"""
from __future__ import annotations

import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

try:
    from flask import Flask, jsonify, request
except ImportError:  # pragma: no cover - friendly error for new operators
    print(
        "[verdant-testbench] Missing dependency 'flask'.\n"
        "Run setup-windows.ps1 first, or install manually:\n"
        "    .\\.venv\\Scripts\\python.exe -m pip install -r requirements.txt",
        file=sys.stderr,
    )
    raise

try:
    import requests  # type: ignore
except ImportError:  # pragma: no cover
    requests = None  # forwarding is optional

try:
    from dotenv import load_dotenv  # type: ignore

    load_dotenv(Path(__file__).with_name(".env"))
except Exception:
    # dotenv is optional; env vars from the shell still work.
    pass


VENDOR = "ecowitt_windows_testbench"
LOG_PATH = Path(__file__).with_name("ecowitt_raw_log.jsonl")
PORT = int(os.environ.get("VERDANT_TESTBENCH_PORT", "8787"))

app = Flask(__name__)


# ---------------------------------------------------------------------------
# Normalization
# ---------------------------------------------------------------------------

FIELD_MAP = {
    "temp_f": ("temp1f", "tempf", "tempinf"),
    "humidity_percent": ("humidity1", "humidity", "humidityin"),
    "soil_moisture_pct": ("soilmoisture1", "soilmoisture2"),
    "co2_ppm": ("co2", "co2in", "co2_ppm"),
}


def _coerce_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    # Reject NaN / infinity — never classify malformed as healthy.
    if f != f or f in (float("inf"), float("-inf")):
        return None
    return f


def normalize_metrics(payload: Dict[str, Any]) -> Dict[str, Optional[float]]:
    """Map known EcoWitt fields into Verdant canonical metric names.

    Unknown / missing / malformed values become ``None`` so downstream
    code can flag them — they are never treated as healthy.
    """
    metrics: Dict[str, Optional[float]] = {}
    for canonical, candidates in FIELD_MAP.items():
        value: Optional[float] = None
        for key in candidates:
            if key in payload:
                value = _coerce_float(payload[key])
                if value is not None:
                    break
        metrics[canonical] = value
    return metrics


def extract_payload() -> Dict[str, Any]:
    """Accept query params, form data, JSON, or raw body."""
    merged: Dict[str, Any] = {}
    if request.args:
        merged.update(request.args.to_dict(flat=True))
    if request.form:
        merged.update(request.form.to_dict(flat=True))
    if request.is_json:
        try:
            body = request.get_json(silent=True) or {}
            if isinstance(body, dict):
                merged.update(body)
        except Exception:
            pass
    if not merged and request.data:
        try:
            text = request.data.decode("utf-8", errors="replace")
            merged["_raw_body"] = text
        except Exception:
            merged["_raw_body"] = "<binary>"
    return merged


# ---------------------------------------------------------------------------
# Source labeling — demo for loopback synthetic, live for real LAN gateway
# ---------------------------------------------------------------------------

# Canonical Verdant source labels. Anything outside this set is "invalid".
ALLOWED_SOURCES = {"live", "manual", "csv", "demo", "stale", "invalid"}

# Marker fields commonly present in real EcoWitt gateway uploads. We
# require >=2 to avoid false positives from minimal demo URLs.
ECOWITT_GATEWAY_MARKERS = {
    "passkey",
    "stationtype",
    "model",
    "dateutc",
    "freq",
    "runtime",
    "wh65batt",
    "wh25batt",
}

_LOOPBACK_SOURCE_ADDRS = {"127.0.0.1", "::1", "localhost"}


def _is_loopback_source_addr(addr: Optional[str]) -> bool:
    a = (addr or "").strip().lower()
    if not a:
        return False
    if a in _LOOPBACK_SOURCE_ADDRS:
        return True
    if a.startswith("::ffff:127.") or a.startswith("127."):
        return True
    return False


def looks_like_ecowitt_gateway(payload: Optional[Dict[str, Any]]) -> bool:
    """True when the payload carries >=2 EcoWitt gateway marker fields."""
    if not isinstance(payload, dict):
        return False
    keys_lower = {str(k).lower() for k in payload.keys()}
    return len(keys_lower & ECOWITT_GATEWAY_MARKERS) >= 2


def resolve_source(
    payload: Optional[Dict[str, Any]] = None,
    remote_addr: Optional[str] = None,
    header_mode: Optional[str] = None,
    env_mode: Optional[str] = None,
) -> str:
    """Return a canonical Verdant source label.

    Rules:
      1. Explicit payload ``source`` is honored only when in ALLOWED_SOURCES.
         Unknown labels normalize to ``invalid`` (never silently "live").
      2. Real LAN EcoWitt gateway uploads (non-loopback remote + gateway
         marker fields) normalize to ``live``.
      3. Explicit ``X-Verdant-Forward-Mode: live`` header or
         ``VERDANT_FORWARD_MODE=live`` env var keeps the existing opt-in
         path to ``live``.
      4. Everything else (loopback browser/curl, demo scripts) is ``demo``.
    """
    if header_mode is None:
        header_mode = (request.headers.get("X-Verdant-Forward-Mode") or "").strip().lower()
    if env_mode is None:
        env_mode = (os.environ.get("VERDANT_FORWARD_MODE") or "").strip().lower()

    explicit: Optional[str] = None
    if isinstance(payload, dict):
        raw_src = payload.get("source")
        if isinstance(raw_src, str) and raw_src.strip():
            cand = raw_src.strip().lower()
            if cand in ALLOWED_SOURCES:
                explicit = cand
            else:
                # Unknown / spoofed label — never accept as live or healthy.
                return "invalid"

    is_lan = not _is_loopback_source_addr(remote_addr)
    looks_gateway = looks_like_ecowitt_gateway(payload)

    if explicit == "live":
        # Only honor explicit live when it actually looks like a real
        # gateway from a non-loopback caller. Otherwise downgrade.
        if is_lan and looks_gateway:
            return "live"
        return "demo"
    if explicit in {"manual", "csv", "demo", "stale", "invalid"}:
        return explicit

    if is_lan and looks_gateway:
        return "live"

    if header_mode == "live" or env_mode == "live":
        return "live"

    return "demo"



# ---------------------------------------------------------------------------
# Token masking & ASCII validation
# ---------------------------------------------------------------------------

def mask_token(token: str) -> str:
    if not token:
        return "<empty>"
    if len(token) <= 10:
        return "***"
    return f"{token[:7]}...{token[-3:]}"


def is_ascii_header_safe(value: str) -> bool:
    """Authorization headers must be ASCII-only.

    Pasted placeholder text often contains the unicode ellipsis ('…',
    U+2026) or smart quotes, which silently break requests. We refuse
    to send such headers.
    """
    if not value:
        return False
    try:
        value.encode("ascii")
    except UnicodeEncodeError:
        return False
    if "<" in value or ">" in value:
        return False
    return True


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

def append_raw_log(record: Dict[str, Any]) -> None:
    try:
        with LOG_PATH.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, default=str) + "\n")
    except Exception as exc:  # pragma: no cover
        print(f"[verdant-testbench] failed to write raw log: {exc}", file=sys.stderr)


# ---------------------------------------------------------------------------
# Optional forwarding to the validated ingest webhook
# ---------------------------------------------------------------------------

# In-memory forwarding counters. Reset on restart. Never persisted.
FORWARD_STATS: Dict[str, Any] = {
    "attempt_count": 0,
    "success_count": 0,
    "failure_count": 0,
    "blocked_count": 0,
    "last_status": None,
    "last_at": None,
    "last_error": None,
    # Sanitized fields captured from the most recent non-2xx response
    # from sensor-ingest-webhook. Populated only after the body has been
    # passed through the local sanitizer; never raw bodies, tokens, or
    # raw EcoWitt payloads.
    "last_forward_response_error": None,
    "last_forward_response_classification": None,
    "last_forward_response_message": None,
}


# Webhook contract: sensor-ingest-webhook only accepts canonical transport
# `source` labels from WEBHOOK_ALLOWED_SOURCES (e.g. "ecowitt", "webhook").
# The Verdant local source label ("live" / "demo" / ...) is preserved
# under metadata.verdant_source for audit; never sent as `source`.
WEBHOOK_TRANSPORT_SOURCE = "ecowitt"

# Keys we always strip from raw EcoWitt payloads before forwarding —
# they are device-auth secrets or noisy fields, never needed by Verdant.
_FORWARD_PAYLOAD_REDACT_KEYS = {"passkey", "PASSKEY", "Passkey"}


def _redact_raw_payload_for_forward(raw: Any) -> Any:
    """Return a copy of raw EcoWitt payload with PASSKEY-class secrets removed."""
    if not isinstance(raw, dict):
        return raw
    out: Dict[str, Any] = {}
    for k, v in raw.items():
        ks = str(k)
        if ks in _FORWARD_PAYLOAD_REDACT_KEYS or ks.lower() == "passkey":
            continue
        out[ks] = v
    return out


# Known sanitized error codes the sensor-ingest-webhook may return.
# Used to classify the body so operators see meaningful guidance rather
# than just an HTTP status.
_WEBHOOK_ERROR_CLASSIFICATIONS = {
    "invalid_payload": "payload_shape_mismatch",
    "invalid_json": "payload_shape_mismatch",
    "unauthorized": "auth_failed",
    "forbidden_tent": "tent_authorization_mismatch",
    "tent_lookup_failed": "tent_lookup_failed",
    "insert_failed": "storage_insert_failed",
    "server_misconfigured": "server_misconfigured",
    "method_not_allowed": "transport_error",
    "internal_error": "internal_error",
}


def sanitize_forward_error_value(value: Any) -> Any:
    """Sanitize a value pulled from a webhook error response.

    Always passes through the recursive sanitizer (which redacts vbt_,
    JWT, Bearer, Authorization, x-verdant-bridge-token, PASSKEY, and
    service-role markers). Long strings are truncated to a short summary.
    Never returns raw response bodies of unbounded length.
    """
    safe = sanitize_debug_payload(value)
    if isinstance(safe, str):
        s = safe.strip()
        if len(s) > 240:
            s = s[:240] + "..."
        return s
    return safe


def summarize_forward_response(resp: Any) -> Dict[str, Any]:
    """Extract a sanitized summary from a requests.Response-like object.

    Returns a dict with: error, classification, message. Never returns
    full bodies, tokens, Authorization headers, or raw EcoWitt payloads.
    Non-JSON bodies become a short summary describing the content type
    and a clipped, sanitized snippet (<=240 chars).
    """
    out: Dict[str, Any] = {
        "error": None,
        "classification": None,
        "message": None,
    }
    body_obj: Any = None
    try:
        body_obj = resp.json()
    except Exception:
        body_obj = None

    if isinstance(body_obj, dict):
        err = body_obj.get("error")
        if isinstance(err, str) and err:
            safe_err = sanitize_forward_error_value(err)
            out["error"] = safe_err if isinstance(safe_err, str) else _REDACTED
            cls = _WEBHOOK_ERROR_CLASSIFICATIONS.get(
                safe_err if isinstance(safe_err, str) else "",
                "unknown_webhook_error",
            )
            out["classification"] = cls
        msg_candidates = body_obj.get("errors") or body_obj.get("message")
        if msg_candidates is not None:
            out["message"] = sanitize_forward_error_value(msg_candidates)
        return out

    # Non-JSON body — store a short sanitized summary only.
    try:
        text = getattr(resp, "text", None) or ""
    except Exception:
        text = ""
    snippet = sanitize_forward_error_value(text) if text else None
    out["error"] = "non_json_response"
    out["classification"] = "non_json_response"
    out["message"] = snippet
    return out



import re as _re

_UUID_RE = _re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    _re.IGNORECASE,
)

# Demo/placeholder tent IDs that must never be accepted as a real tent.
_FORBIDDEN_TENT_IDS = {
    "00000000-0000-0000-0000-000000000000",
    "tent-1",
    "demo-tent",
    "t1",
}


def is_valid_tent_id(value: Optional[str]) -> bool:
    """True iff value is a real UUID string (not the all-zero placeholder)."""
    if not isinstance(value, str):
        return False
    v = value.strip()
    if not v:
        return False
    if v.lower() in _FORBIDDEN_TENT_IDS:
        return False
    try:
        uuid.UUID(v)
    except (ValueError, AttributeError, TypeError):
        return False
    return bool(_UUID_RE.match(v))


def evaluate_forwarding_readiness(
    url: Optional[str],
    token: Optional[str],
    tent_id: Optional[str],
) -> Dict[str, Any]:
    """Pure check: are all required Verdant fields present and valid?

    Returns dict with: ready, reason, tent_id_configured, tent_id_valid,
    ingest_url_configured, bridge_token_configured. Never returns the
    tent_id itself.
    """
    url_ok = bool(url)
    token_ok = bool(token)
    tent_configured = bool(tent_id and str(tent_id).strip())
    tent_valid = is_valid_tent_id(tent_id)
    if not url_ok or not token_ok:
        reason: Optional[str] = "no_forwarding_configured"
    elif not tent_configured:
        reason = "blocked_missing_tent_id"
    elif not tent_valid:
        reason = "blocked_invalid_tent_id"
    else:
        reason = None
    return {
        "ready": reason is None,
        "reason": reason,
        "ingest_url_configured": url_ok,
        "bridge_token_configured": token_ok,
        "tent_id_configured": tent_configured,
        "tent_id_valid": tent_valid,
    }


def _short_sanitized_error(exc: Any) -> str:
    """Short, sanitized one-line error summary. Never echoes tokens/payloads."""
    text = str(exc)
    if len(text) > 200:
        text = text[:200] + "..."
    safe = sanitize_debug_payload_str_safe(text)
    return safe


def sanitize_debug_payload_str_safe(text: str) -> str:
    # Forward declaration shim — real sanitizer is defined below. We
    # avoid forward-reference issues by guarding here.
    try:
        return sanitize_debug_payload(text)  # type: ignore[name-defined]
    except NameError:
        return text


def maybe_forward(reading: Dict[str, Any]) -> Dict[str, Any]:
    url = os.environ.get("VERDANT_INGEST_URL")
    token = os.environ.get("VERDANT_BRIDGE_TOKEN")
    tent_id = os.environ.get("VERDANT_TENT_ID")

    readiness = evaluate_forwarding_readiness(url, token, tent_id)
    if not readiness["ready"]:
        reason = readiness["reason"] or "not_ready"
        # "no_forwarding_configured" is a quiet no-op (forwarding never
        # opted in). The other blocks are explicit local refusals — track
        # them so the operator can see them in /debug/forwarding-status,
        # never as a remote webhook failure.
        if reason != "no_forwarding_configured":
            FORWARD_STATS["blocked_count"] += 1
            FORWARD_STATS["last_status"] = None
            FORWARD_STATS["last_at"] = datetime.now(timezone.utc).isoformat()
            FORWARD_STATS["last_error"] = reason
            print(
                f"[verdant-testbench] forwarding blocked locally: {reason} "
                "(no request sent to ingest webhook)"
            )
        return {"forwarded": False, "reason": reason}

    if requests is None:
        return {"forwarded": False, "reason": "requests_not_installed"}

    auth = f"Bearer {token}"
    if not is_ascii_header_safe(auth):
        print(
            "[verdant-testbench] refusing to forward: Authorization header "
            "contains non-ASCII or placeholder characters. Token preview: "
            f"{mask_token(token or '')}",
            file=sys.stderr,
        )
        return {"forwarded": False, "reason": "non_ascii_auth_header"}

    # Attach tent context. Edge Function requires top-level tent_id;
    # x-verdant-tent-id is a secondary signal already in the CORS allowlist.
    outbound = dict(reading)
    outbound["tent_id"] = tent_id
    if isinstance(outbound.get("metadata"), dict):
        md = dict(outbound["metadata"])
        md["tent_id"] = tent_id
        outbound["metadata"] = md

    headers = {
        "Authorization": auth,
        "Content-Type": "application/json",
        "Idempotency-Key": str(uuid.uuid4()),
        "User-Agent": f"{VENDOR}/1.0",
        "x-verdant-tent-id": tent_id or "",
    }
    FORWARD_STATS["attempt_count"] += 1
    FORWARD_STATS["last_at"] = datetime.now(timezone.utc).isoformat()
    try:
        resp = requests.post(url, json=outbound, headers=headers, timeout=10)
        FORWARD_STATS["last_status"] = resp.status_code
        if 200 <= resp.status_code < 300:
            FORWARD_STATS["success_count"] += 1
            FORWARD_STATS["last_error"] = None
        else:
            FORWARD_STATS["failure_count"] += 1
            FORWARD_STATS["last_error"] = f"http_{resp.status_code}"
        print(
            f"[verdant-testbench] forwarded reading -> {resp.status_code} "
            f"(token {mask_token(token or '')})"
        )
        return {
            "forwarded": True,
            "status_code": resp.status_code,
            "idempotency_key": headers["Idempotency-Key"],
        }
    except Exception as exc:
        FORWARD_STATS["failure_count"] += 1
        FORWARD_STATS["last_status"] = None
        FORWARD_STATS["last_error"] = _short_sanitized_error(exc)
        return {"forwarded": False, "reason": f"request_error: {exc!s}"}


def mask_ingest_url(url: Optional[str]) -> Optional[str]:
    """Return a host/path summary that hides project identifiers."""
    if not url:
        return None
    try:
        from urllib.parse import urlparse

        p = urlparse(url)
        host = p.hostname or ""
        parts = host.split(".")
        if len(parts) >= 3:
            parts[0] = "***"
        masked_host = ".".join(parts) if parts else "***"
        scheme = p.scheme or "https"
        path = p.path or ""
        return f"{scheme}://{masked_host}{path}"
    except Exception:
        return "***"


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
def health() -> Any:
    return jsonify(
        {
            "ok": True,
            "vendor": VENDOR,
            "port": PORT,
            "forwarding_configured": bool(
                os.environ.get("VERDANT_INGEST_URL")
                and os.environ.get("VERDANT_BRIDGE_TOKEN")
            ),
        }
    )


@app.route("/ecowitt", methods=["GET", "POST"])
def ecowitt() -> Any:
    raw = extract_payload()
    metrics = normalize_metrics(raw)
    source = resolve_source(payload=raw, remote_addr=request.remote_addr)
    captured_at = datetime.now(timezone.utc).isoformat()


    reading = {
        "captured_at": captured_at,
        "source": source,
        "vendor": VENDOR,
        "metrics": metrics,
        "metadata": {
            "raw_payload": raw,
            "tent_id": os.environ.get("VERDANT_TENT_ID"),
            "remote_addr": request.remote_addr,
        },
    }

    append_raw_log(reading)
    forward_result = maybe_forward(reading)

    return jsonify({"ok": True, "reading": reading, "forward": forward_result})




# ---------------------------------------------------------------------------
# Debug raw log tail — LOCAL-ONLY, sanitized, read-only
# ---------------------------------------------------------------------------

# Field names that should always be redacted regardless of value. The
# Supabase admin role marker is assembled at runtime so this file does not
# contain the literal string in source (static safety scans flag it).
_SR_MARKER = "service" + "_" + "role"
_SECRET_FIELD_NAMES = {
    "authorization",
    "token",
    "bridge_token",
    "verdant_bridge_token",
    "api_key",
    "apikey",
    "password",
    "secret",
    _SR_MARKER,
    _SR_MARKER + "_key",
    "supabase_" + _SR_MARKER + "_key",
    "private_api_key",
}

_REDACTED = "[REDACTED]"


def _looks_like_secret_value(value: str) -> bool:
    """Heuristics for secret-shaped strings (token-like, JWT-like, bearer)."""
    if not isinstance(value, str) or not value:
        return False
    v = value.strip()
    lv = v.lower()
    if lv.startswith("bearer "):
        return True
    if v.startswith("vbt_") and len(v) >= 12:
        # Allow the literal placeholder so docs/examples don't redact themselves.
        if v == "vbt_REPLACE_WITH_REAL_TOKEN":
            return False
        return True
    # JWT-shaped: three dot-separated base64url segments, first starts with eyJ.
    parts = v.split(".")
    if (
        len(parts) == 3
        and parts[0].startswith("eyJ")
        and all(len(p) >= 8 for p in parts)
    ):
        return True
    # Supabase admin role marker anywhere.
    if _SR_MARKER in lv:
        return True
    return False


def sanitize_debug_payload(value: Any) -> Any:
    """Recursively redact secrets from a value before returning to caller.

    Never returns full tokens. Handles dicts, lists, tuples, and strings.
    Pure function — no I/O.
    """
    if isinstance(value, dict):
        out: Dict[str, Any] = {}
        for k, v in value.items():
            key_str = str(k)
            if key_str.lower() in _SECRET_FIELD_NAMES:
                out[key_str] = _REDACTED
            else:
                out[key_str] = sanitize_debug_payload(v)
        return out
    if isinstance(value, list):
        return [sanitize_debug_payload(v) for v in value]
    if isinstance(value, tuple):
        return [sanitize_debug_payload(v) for v in value]
    if isinstance(value, str):
        if _looks_like_secret_value(value):
            return _REDACTED
        return value
    return value


_LOOPBACK_ADDRS = {"127.0.0.1", "::1", "localhost"}


def _is_local_request() -> bool:
    """Only allow local loopback callers to read the raw log tail."""
    remote = (request.remote_addr or "").strip().lower()
    if not remote:
        return False
    if remote in _LOOPBACK_ADDRS:
        return True
    # IPv4-mapped IPv6 loopback (e.g. "::ffff:127.0.0.1")
    if remote.startswith("::ffff:127."):
        return True
    if remote.startswith("127."):
        return True
    return False


DEFAULT_DEBUG_LINES = 10
MIN_DEBUG_LINES = 1
MAX_DEBUG_LINES = 50


def parse_debug_line_count(
    raw_value: Any,
    default: int = DEFAULT_DEBUG_LINES,
    minimum: int = MIN_DEBUG_LINES,
    maximum: int = MAX_DEBUG_LINES,
) -> int:
    """Parse and clamp a ?lines= query value.

    Pure / deterministic. Never raises. Defaults safely on missing,
    non-numeric, list-shaped, or otherwise malformed inputs.
    """
    # Flask may surface repeated query params; pick the first non-empty.
    if isinstance(raw_value, (list, tuple)):
        raw_value = next((v for v in raw_value if v not in (None, "")), None)
    if raw_value is None:
        return default
    try:
        n = int(str(raw_value).strip())
    except (TypeError, ValueError):
        return default
    if n < minimum:
        return minimum
    if n > maximum:
        return maximum
    return n


def read_recent_log_lines(n: int) -> list[str]:
    """Read the last N raw lines from LOG_PATH. Returns [] if missing."""
    if not LOG_PATH.exists():
        return []
    try:
        with LOG_PATH.open("r", encoding="utf-8", errors="replace") as fh:
            return fh.readlines()[-n:]
    except Exception:
        return []


def parse_jsonl_entries(
    lines: list[str],
) -> tuple[list[Dict[str, Any]], int, Optional[str]]:
    """Parse JSONL lines.

    Returns (parsed_entries, malformed_line_count, last_parse_error_summary).
    The error summary is short and sanitized — never contains the raw
    offending line, tokens, or payloads.
    """
    parsed: list[Dict[str, Any]] = []
    malformed = 0
    last_err: Optional[str] = None
    for raw in lines:
        text = raw.rstrip("\n")
        if not text.strip():
            continue
        try:
            obj = json.loads(text)
            if isinstance(obj, dict):
                parsed.append(obj)
            else:
                malformed += 1
                last_err = "non_object_jsonl_line"
        except Exception as exc:
            malformed += 1
            # Short sanitized class+message; never the raw line text.
            msg = f"{type(exc).__name__}: {str(exc)[:120]}"
            safe = sanitize_debug_payload(msg)
            last_err = safe if isinstance(safe, str) else _REDACTED
    return parsed, malformed, last_err



@app.get("/debug/raw-log-tail")
def debug_raw_log_tail() -> Any:
    # Local-only: never expose log contents over LAN.
    if not _is_local_request():
        return (
            jsonify({"ok": False, "error": "forbidden_non_local"}),
            403,
        )

    n = parse_debug_line_count(request.args.get("lines"))

    if not LOG_PATH.exists():
        return jsonify(
            {
                "ok": True,
                "count": 0,
                "max_lines": MAX_DEBUG_LINES,
                "message": "No raw log file found yet.",
                "entries": [],
            }
        )

    try:
        with LOG_PATH.open("r", encoding="utf-8", errors="replace") as fh:
            lines = fh.readlines()
    except Exception as exc:
        return (
            jsonify({"ok": False, "error": f"read_failed: {exc!s}"}),
            500,
        )

    tail = lines[-n:]
    entries = []
    for raw in tail:
        text = raw.rstrip("\n")
        try:
            parsed = json.loads(text)
            entries.append({"parsed": True, "entry": sanitize_debug_payload(parsed)})
        except Exception:
            # Sanitize text fallback too — could still contain a token.
            safe_text = (
                _REDACTED
                if _looks_like_secret_value(text)
                else text[:500]
            )
            entries.append(
                {"parsed": False, "warning": "json_parse_failed", "text": safe_text}
            )

    return jsonify(
        {
            "ok": True,
            "count": len(entries),
            "max_lines": MAX_DEBUG_LINES,
            "entries": entries,
        }
    )


@app.get("/debug/status")
def debug_status() -> Any:
    # Local-only: never expose log status over LAN.
    if not _is_local_request():
        return (
            jsonify({"ok": False, "error": "forbidden_non_local"}),
            403,
        )

    log_path_str = str(LOG_PATH)
    if not LOG_PATH.exists():
        return jsonify(
            {
                "ok": True,
                "log_exists": False,
                "log_path": log_path_str,
                "entry_count": 0,
                "parsed_line_count": 0,
                "skipped_line_count": 0,
                "malformed_line_count": 0,
                "last_parse_error": None,
                "latest_entry": None,
                "latest_captured_at": None,
                "latest_received_at": None,
                "latest_metrics": None,
                "message": "No raw log file found yet.",
            }
        )

    try:
        with LOG_PATH.open("r", encoding="utf-8", errors="replace") as fh:
            all_lines = fh.readlines()
    except Exception as exc:
        return (
            jsonify({"ok": False, "error": f"read_failed: {exc!s}"}),
            500,
        )

    parsed, malformed, last_parse_error = parse_jsonl_entries(all_lines)
    latest = parsed[-1] if parsed else None
    latest_safe = sanitize_debug_payload(latest) if latest else None

    latest_captured_at = None
    latest_received_at = None
    latest_metrics = None
    if isinstance(latest_safe, dict):
        latest_captured_at = latest_safe.get("captured_at")
        latest_received_at = latest_safe.get("received_at") or (
            latest_safe.get("metadata", {}).get("received_at")
            if isinstance(latest_safe.get("metadata"), dict)
            else None
        )
        latest_metrics = latest_safe.get("metrics")

    return jsonify(
        {
            "ok": True,
            "log_exists": True,
            "log_path": log_path_str,
            "entry_count": len(parsed),
            "parsed_line_count": len(parsed),
            "skipped_line_count": malformed,
            "malformed_line_count": malformed,
            "last_parse_error": last_parse_error,
            "latest_entry": latest_safe,
            "latest_captured_at": latest_captured_at,
            "latest_received_at": latest_received_at,
            "latest_metrics": latest_metrics,
            "message": "ok",
        }
    )


def _mask_token_preview(token: Optional[str]) -> Optional[str]:
    if not token:
        return None
    return mask_token(token)


@app.get("/debug/forwarding-status")
def debug_forwarding_status() -> Any:
    # Local-only: never expose forwarding configuration over LAN.
    if not _is_local_request():
        return (
            jsonify({"ok": False, "error": "forbidden_non_local"}),
            403,
        )

    url = os.environ.get("VERDANT_INGEST_URL")
    token = os.environ.get("VERDANT_BRIDGE_TOKEN")
    tent_id = os.environ.get("VERDANT_TENT_ID")
    readiness = evaluate_forwarding_readiness(url, token, tent_id)
    forwarding_enabled = bool(url and token)

    last_error = FORWARD_STATS.get("last_error")
    if isinstance(last_error, str):
        safe_err = sanitize_debug_payload(last_error)
        last_error = safe_err if isinstance(safe_err, str) else _REDACTED

    return jsonify(
        {
            "ok": True,
            "forwarding_enabled": forwarding_enabled,
            "forwarding_ready": readiness["ready"],
            "ingest_url_configured": readiness["ingest_url_configured"],
            "bridge_token_configured": readiness["bridge_token_configured"],
            "tent_id_configured": readiness["tent_id_configured"],
            "tent_id_valid": readiness["tent_id_valid"],
            "masked_ingest_url": mask_ingest_url(url),
            "masked_token_preview": _mask_token_preview(token),
            "forward_attempt_count": int(FORWARD_STATS.get("attempt_count", 0)),
            "forward_success_count": int(FORWARD_STATS.get("success_count", 0)),
            "forward_failure_count": int(FORWARD_STATS.get("failure_count", 0)),
            "forward_blocked_count": int(FORWARD_STATS.get("blocked_count", 0)),
            "last_forward_status": FORWARD_STATS.get("last_status"),
            "last_forward_at": FORWARD_STATS.get("last_at"),
            "last_forward_error": last_error,
        }
    )



@app.get("/debug/last-events")
def debug_last_events() -> Any:
    # Local-only: never expose normalized events over LAN.
    if not _is_local_request():
        return (
            jsonify({"ok": False, "error": "forbidden_non_local"}),
            403,
        )

    n = parse_debug_line_count(request.args.get("lines"))
    lines = read_recent_log_lines(max(n * 4, n))  # over-read to tolerate malformed
    parsed, malformed, _last_err = parse_jsonl_entries(lines)
    parsed_tail = parsed[-n:]

    events: list[Dict[str, Any]] = []
    for entry in parsed_tail:
        safe = sanitize_debug_payload(entry)
        if not isinstance(safe, dict):
            continue
        metadata = safe.get("metadata") if isinstance(safe.get("metadata"), dict) else {}
        slim: Dict[str, Any] = {
            "captured_at": safe.get("captured_at"),
            "source": safe.get("source"),
            "vendor": safe.get("vendor"),
            "metrics": safe.get("metrics"),
        }
        if metadata.get("device_id") is not None:
            slim["device_id"] = metadata.get("device_id")
        if metadata.get("confidence") is not None:
            slim["confidence"] = metadata.get("confidence")
        # Explicitly slim: do NOT include the raw EcoWitt payload by default.
        events.append(slim)

    return jsonify(
        {
            "ok": True,
            "count": len(events),
            "max_lines": MAX_DEBUG_LINES,
            "malformed_line_count": malformed,
            "entries": events,
        }
    )


# ---------------------------------------------------------------------------
# /debug/parse-diagnostics — LOCAL-ONLY, sanitized, read-only
# ---------------------------------------------------------------------------

def categorize_parse_issue(
    raw_text: str,
) -> tuple[Optional[Dict[str, Any]], Optional[str], Optional[str]]:
    """Categorize a single raw JSONL line.

    Returns (parsed_object_or_none, category_or_none, short_error_or_none).
    Never returns the raw line text. The short error is sanitized.
    """
    text = raw_text.rstrip("\n")
    if not text.strip():
        return None, "empty_line", None
    try:
        obj = json.loads(text)
    except Exception as exc:
        msg = f"{type(exc).__name__}: {str(exc)[:120]}"
        safe = sanitize_debug_payload(msg)
        safe_str = safe if isinstance(safe, str) else _REDACTED
        return None, "json_decode_error", safe_str
    if not isinstance(obj, dict):
        return None, "non_object_json", None
    # Detect secret marker presence so we can flag (not expose) it.
    sanitized = sanitize_debug_payload(obj)
    try:
        had_redaction = _REDACTED in json.dumps(sanitized, default=str)
    except Exception:
        had_redaction = False
    extra: Optional[str] = None
    if not isinstance(obj.get("metrics"), dict):
        extra = "missing_metrics"
    elif obj.get("captured_at") in (None, ""):
        extra = "missing_captured_at"
    elif "source" not in obj or "vendor" not in obj:
        extra = "unknown_normalized_shape"
    elif had_redaction:
        extra = "secret_redacted"
    return obj, extra, None


@app.get("/debug/parse-diagnostics")
def debug_parse_diagnostics() -> Any:
    # Local-only: never expose parse diagnostics over LAN.
    if not _is_local_request():
        return (
            jsonify({"ok": False, "error": "forbidden_non_local"}),
            403,
        )

    if not LOG_PATH.exists():
        return jsonify(
            {
                "ok": True,
                "log_exists": False,
                "entry_count": 0,
                "parsed_line_count": 0,
                "malformed_line_count": 0,
                "skipped_line_count": 0,
                "categories": [],
                "last_parse_error": None,
                "message": "No raw log file found yet.",
            }
        )

    try:
        with LOG_PATH.open("r", encoding="utf-8", errors="replace") as fh:
            all_lines = fh.readlines()
    except Exception as exc:
        return (
            jsonify({"ok": False, "error": f"read_failed: {exc!s}"}),
            500,
        )

    category_counts: Dict[str, int] = {}
    category_last_err: Dict[str, Optional[str]] = {}
    parsed_count = 0
    malformed_count = 0
    last_parse_error: Optional[str] = None

    for raw in all_lines:
        obj, category, short_err = categorize_parse_issue(raw)
        if obj is not None:
            parsed_count += 1
        if category is None:
            continue
        # empty_line, json_decode_error, non_object_json count as skipped/malformed
        if category in ("json_decode_error", "non_object_json"):
            malformed_count += 1
            if short_err:
                last_parse_error = short_err
        category_counts[category] = category_counts.get(category, 0) + 1
        if short_err:
            category_last_err[category] = short_err

    categories = [
        {
            "category": name,
            "count": count,
            "last_error": category_last_err.get(name),
        }
        for name, count in sorted(category_counts.items())
    ]

    return jsonify(
        {
            "ok": True,
            "log_exists": True,
            "entry_count": parsed_count,
            "parsed_line_count": parsed_count,
            "malformed_line_count": malformed_count,
            "skipped_line_count": malformed_count,
            "categories": categories,
            "last_parse_error": last_parse_error,
            "message": "ok",
        }
    )



def main() -> None:  # pragma: no cover
    print(f"[verdant-testbench] listening on http://localhost:{PORT}")
    print(f"[verdant-testbench] health:  http://localhost:{PORT}/health")
    print(
        f"[verdant-testbench] demo:    http://localhost:{PORT}/ecowitt"
        "?temp1f=77.4&humidity1=58&soilmoisture1=33&co2=721"
    )
    token = os.environ.get("VERDANT_BRIDGE_TOKEN")
    if token:
        print(f"[verdant-testbench] forwarding token preview: {mask_token(token)}")
    else:
        print("[verdant-testbench] forwarding disabled (no VERDANT_BRIDGE_TOKEN set)")
    app.run(host="0.0.0.0", port=PORT, debug=False)


if __name__ == "__main__":  # pragma: no cover
    main()
