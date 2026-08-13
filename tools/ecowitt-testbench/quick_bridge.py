"""Verdant EcoWitt quick bridge — raw pass-through to `ecowitt-ingest`.

Why this exists
---------------
The GW1200's "Customized server" upload cannot send an `Authorization`
header, and every Verdant ingest endpoint requires a bearer token. This is
the smallest possible hop that closes that gap: it receives the gateway's
raw POST on the LAN and re-sends it **verbatim** with the bridge token
attached. `ecowitt-ingest` parses the raw EcoWitt fields itself and routes
each channel to the right tent via `tents.hardware_config`, so nothing here
needs to know about tents, metrics, or units.

Contrast with `ecowitt_listener.py`: that one *transforms* payloads into the
`sensor-ingest-webhook` shape and binds everything to a single
`VERDANT_TENT_ID`. Use this script instead when one gateway serves several
tents.

Safety
------
- Never prints, logs, or stores the raw PASSKEY. Only the one-way
  `ewfp_` fingerprint, which is what `hardware_config` stores.
- Masks the bridge token in all output.
- Adds nothing to the payload and removes nothing from it.
- Writes no files. Holds no state beyond a counter.

Usage
-----
    set VERDANT_INGEST_URL=https://<ref>.supabase.co/functions/v1/ecowitt-ingest
    set VERDANT_BRIDGE_TOKEN=vbt_...
    python quick_bridge.py

Then point the gateway at  http://<this-machine-lan-ip>:8788/ecowitt
"""

from __future__ import annotations

import hashlib
import os
import sys
from typing import Any, Dict

try:
    from flask import Flask, request, jsonify
except ImportError:
    sys.exit("flask missing — run .\\setup-windows.ps1 first")

try:
    import requests
except ImportError:
    sys.exit("requests missing — run .\\setup-windows.ps1 first")

try:
    from dotenv import load_dotenv
    from pathlib import Path

    load_dotenv(Path(__file__).with_name(".env"))
except Exception:
    pass

PORT = int(os.environ.get("VERDANT_QUICK_BRIDGE_PORT", "8788"))
INGEST_URL = os.environ.get("VERDANT_INGEST_URL", "")
TOKEN = os.environ.get("VERDANT_BRIDGE_TOKEN", "")

app = Flask(__name__)
_seen_fingerprint: str | None = None
_count = 0


def fingerprint(passkey: str) -> str:
    """Mirror of supabase/functions/_shared/ecowittPasskeyFingerprint.ts."""
    digest = hashlib.sha256(passkey.strip().encode("utf-8")).hexdigest()
    return "ewfp_" + digest[:24]


def mask(token: str) -> str:
    if len(token) < 12:
        return "***"
    return f"{token[:7]}...{token[-4:]}"


def collect(req) -> Dict[str, Any]:
    """Merge query + form + json into one flat dict, exactly as sent."""
    out: Dict[str, Any] = {}
    out.update(req.args.to_dict())
    try:
        out.update(req.form.to_dict())
    except Exception:
        pass
    if req.is_json:
        try:
            body = req.get_json(silent=True)
            if isinstance(body, dict):
                out.update(body)
        except Exception:
            pass
    return out


def channel_report(payload: Dict[str, Any]) -> Dict[str, list]:
    air, soil = set(), set()
    for key in payload:
        k = key.lower()
        if k.startswith("temp") and k.endswith("f") and k[4:-1].isdigit():
            air.add(int(k[4:-1]))
        elif k.startswith("humidity") and k[8:].isdigit():
            air.add(int(k[8:]))
        elif k.startswith("soilmoisture") and k[12:].isdigit():
            soil.add(int(k[12:]))
    return {"air": sorted(air), "soil": sorted(soil)}


@app.get("/health")
def health():
    return jsonify(
        ok=True,
        port=PORT,
        mode="raw pass-through -> ecowitt-ingest",
        ingest_configured=bool(INGEST_URL),
        token_configured=bool(TOKEN),
        token_preview=mask(TOKEN) if TOKEN else None,
        payloads_received=_count,
        gateway_fingerprint=_seen_fingerprint,
    )


@app.route("/ecowitt", methods=["GET", "POST"])
def ecowitt():
    global _seen_fingerprint, _count
    payload = collect(request)
    _count += 1

    passkey = payload.get("PASSKEY") or payload.get("passkey")
    if passkey:
        _seen_fingerprint = fingerprint(str(passkey))

    chans = channel_report(payload)
    print(
        f"[bridge] #{_count} air={chans['air']} soil={chans['soil']} "
        f"fingerprint={_seen_fingerprint}",
        flush=True,
    )

    if not INGEST_URL or not TOKEN:
        print("[bridge]   not forwarding — VERDANT_INGEST_URL / "
              "VERDANT_BRIDGE_TOKEN not set", flush=True)
        return jsonify(ok=True, forwarded=False, reason="not_configured",
                       channels=chans, gateway_fingerprint=_seen_fingerprint)

    try:
        resp = requests.post(
            INGEST_URL,
            data=payload,  # verbatim, form-encoded — ecowitt-ingest parses it
            headers={"Authorization": f"Bearer {TOKEN}"},
            timeout=15,
        )
        body = resp.text[:400]
        print(f"[bridge]   -> {resp.status_code} {body}", flush=True)
        return jsonify(ok=True, forwarded=True, status=resp.status_code,
                       channels=chans, gateway_fingerprint=_seen_fingerprint)
    except Exception as exc:  # never leak the token in an error string
        safe = str(exc).replace(TOKEN, mask(TOKEN)) if TOKEN else str(exc)
        print(f"[bridge]   forward failed: {safe[:200]}", flush=True)
        return jsonify(ok=False, forwarded=False, error=safe[:200]), 502


if __name__ == "__main__":
    print(f"[bridge] listening on http://0.0.0.0:{PORT}/ecowitt")
    print(f"[bridge] forwarding to: {INGEST_URL or '(not set — log only)'}")
    print(f"[bridge] token: {mask(TOKEN) if TOKEN else '(not set — log only)'}")
    print("[bridge] the raw PASSKEY is never printed or stored.\n")
    app.run(host="0.0.0.0", port=PORT, debug=False)
