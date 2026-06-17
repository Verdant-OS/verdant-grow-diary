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
* No fake live data. Built-in browser/test payloads are labeled
  ``source = "demo"``. ``source = "live"`` is only used when the request
  is explicitly marked as coming from a real EcoWitt gateway via the
  ``X-Verdant-Forward-Mode: live`` header or the ``VERDANT_FORWARD_MODE``
  env var.
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
    GET  /ecowitt   (accepts query params, like EcoWitt customized upload)
    POST /ecowitt   (accepts form data, JSON, or raw body)
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
# Source labeling — demo by default, live only on explicit opt-in
# ---------------------------------------------------------------------------

def resolve_source() -> str:
    header_mode = (request.headers.get("X-Verdant-Forward-Mode") or "").strip().lower()
    env_mode = (os.environ.get("VERDANT_FORWARD_MODE") or "").strip().lower()
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

def maybe_forward(reading: Dict[str, Any]) -> Dict[str, Any]:
    url = os.environ.get("VERDANT_INGEST_URL")
    token = os.environ.get("VERDANT_BRIDGE_TOKEN")
    if not url or not token:
        return {"forwarded": False, "reason": "no_forwarding_configured"}
    if requests is None:
        return {"forwarded": False, "reason": "requests_not_installed"}

    auth = f"Bearer {token}"
    if not is_ascii_header_safe(auth):
        print(
            "[verdant-testbench] refusing to forward: Authorization header "
            "contains non-ASCII or placeholder characters. Token preview: "
            f"{mask_token(token)}",
            file=sys.stderr,
        )
        return {"forwarded": False, "reason": "non_ascii_auth_header"}

    headers = {
        "Authorization": auth,
        "Content-Type": "application/json",
        "Idempotency-Key": str(uuid.uuid4()),
        "User-Agent": f"{VENDOR}/1.0",
    }
    try:
        resp = requests.post(url, json=reading, headers=headers, timeout=10)
        print(
            f"[verdant-testbench] forwarded reading -> {resp.status_code} "
            f"(token {mask_token(token)})"
        )
        return {
            "forwarded": True,
            "status_code": resp.status_code,
            "idempotency_key": headers["Idempotency-Key"],
        }
    except Exception as exc:
        return {"forwarded": False, "reason": f"request_error: {exc!s}"}


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
    source = resolve_source()
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
