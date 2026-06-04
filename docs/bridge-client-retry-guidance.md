# Verdant Bridge Client Retry & Backoff Guidance

> **Scope:** This document describes safe client behavior for Raspberry Pi,
> ESP32/MicroPython, Home Assistant, Node-RED, MQTT/webhook bridges, and
> custom scripts that send sensor readings into Verdant.
>
> **Status:** Documentation only. No schema, webhook, auth, or runtime
> behavior changes ship alongside this doc.

## 1. Verdant bridge philosophy

Verdant is a **hardware-neutral Grow OS**. Bridge clients exist for one
purpose:

- **Sensor ingest only.** Bring readings from EcoWitt, MQTT, Home
  Assistant, Raspberry Pi, ESP32, CSV, webhook sources, or custom scripts
  into Verdant as labeled sensor truth.

Hard rules for every bridge client:

- **Device control is out of scope.** Bridge clients must never send fan,
  light, irrigation, dosing, humidifier, dehumidifier, heater, or any
  other equipment command.
- **No automation side-effects.** Bridge clients do not create alerts,
  Action Queue items, or AI Doctor sessions.
- **Source transparency is preserved on every reading.** A reading must
  carry a `source` label that matches how it actually arrived.
- **Bad or stale telemetry must never be treated as healthy.** When a
  reading fails validation or is stuck/old, Verdant labels it
  `invalid` / `stale` — bridge clients must not relabel it as `live`.

## 2. `source` vs `vendor`

Verdant validates `source` against an allow-list. `vendor` is **lineage
only** and is never used for authorization, ownership, routing, or
permissions.

| Example | Meaning |
|---|---|
| `source: "ecowitt"` | Reading arrived via an EcoWitt-shaped transport (gateway/station bridge). |
| `source: "mqtt"`, `vendor: "ecowitt"` | Reading was carried over MQTT; the originating ecosystem was EcoWitt. |
| `source: "webhook"`, `vendor: "home_assistant"` | Generic webhook POST originating from a Home Assistant flow. |
| `source: "csv"` | Bulk historical CSV import. |

Rules:

- `source` identifies the **transport/origin category Verdant validates**.
- `vendor` is **lineage only** — a non-empty string preserved in
  `raw_payload` for analytics and debugging.
- `vendor` must **never** be used for auth, ownership, routing, or
  permissions. Authorization is decided server-side by the JWT or bridge
  token.
- Empty / non-string `vendor` values are dropped.

## 3. Required payload shape

```json
{
  "tent_id": "tent_123",
  "source": "mqtt",
  "vendor": "ecowitt",
  "captured_at": "2026-06-04T15:30:00Z",
  "readings": {
    "temp_f": 77.4,
    "humidity": 58,
    "co2_ppm": 721,
    "soil_water_content": 33
  },
  "raw_payload": {
    "temp1f": "77.4",
    "humidity1": "58",
    "co2": "721",
    "soilmoisture1": "33"
  }
}
```

Required / recommended:

- ISO 8601 timestamps **with timezone** for `captured_at`.
- Include `source` (allow-listed).
- Include `captured_at`.
- Include `tent_id`.
- Include `raw_payload` when available (original vendor keys, untransformed).

Forbidden:

- Do **not** send `service_role` keys from a bridge client.
- Do **not** send `user_id` from a bridge client unless the existing
  contract explicitly requires it. Verdant derives ownership from the
  authenticated principal (JWT / bridge token), not the body.
- Do **not** send device commands. Verdant ingest is read-only.

## 4. Full Jitter retry guidance

Bridge clients must use **Full Jitter exponential backoff** so that
Pi/ESP32 scripts do not hammer the webhook during outages.

Algorithm:

```
delay = random(0, min(maxDelay, baseDelay * 2 ** attempt))
```

Safe defaults:

- **Max retries:** 4
- **Base delay:** 3–4 seconds
- **Max delay:** 45–60 seconds
- **Request timeout:** 10–15 seconds
- **Never** retry in a tight loop.
- **Never** retry forever.

Retry **only** for:

- Network timeout
- Temporary DNS / network failure
- HTTP `408` Request Timeout
- HTTP `429` Too Many Requests
- HTTP `500`–`599` server errors

Do **not** retry automatically for:

- HTTP `400` bad payload
- HTTP `401` / `403` auth problems
- HTTP `404` wrong endpoint
- Validation errors (`invalid source`, `invalid metrics`, …)
- Unsupported source

## 5. Python example (Raspberry Pi / generic)

```python
import os
import random
import time
import requests

VERDANT_URL = os.environ["VERDANT_URL"]          # e.g. https://<project>.functions.supabase.co/sensor-ingest-webhook
VERDANT_TOKEN = os.environ["VERDANT_TOKEN"]      # e.g. vbt_xxxxxxxxxxxxxxxx
TENT_ID = os.environ["VERDANT_TENT_ID"]

MAX_RETRIES = 4
BASE_DELAY = 3.0
MAX_DELAY = 60.0
TIMEOUT = 15.0

RETRYABLE_STATUS = {408, 429}

def is_retryable(status: int | None) -> bool:
    if status is None:
        return True  # network/timeout
    if status in RETRYABLE_STATUS:
        return True
    return 500 <= status <= 599

def full_jitter_delay(attempt: int) -> float:
    cap = min(MAX_DELAY, BASE_DELAY * (2 ** attempt))
    return random.uniform(0, cap)

def post_reading(payload: dict) -> bool:
    for attempt in range(MAX_RETRIES + 1):
        status = None
        try:
            r = requests.post(
                VERDANT_URL,
                json=payload,
                headers={
                    "Authorization": f"Bearer {VERDANT_TOKEN}",
                    "Content-Type": "application/json",
                },
                timeout=TIMEOUT,
            )
            status = r.status_code
            if 200 <= status < 300:
                return True
            if not is_retryable(status):
                # 400/401/403/404/validation — do not retry.
                log_failure(payload, status, attempt, r.text[:200])
                return False
        except requests.RequestException as e:
            log_failure(payload, None, attempt, str(e))

        if attempt >= MAX_RETRIES:
            break
        time.sleep(full_jitter_delay(attempt))
    return False

def log_failure(payload, status, attempt, reason):
    tok = VERDANT_TOKEN[:4] + "…" + VERDANT_TOKEN[-3:]
    print({
        "captured_at": payload.get("captured_at"),
        "source": payload.get("source"),
        "vendor": payload.get("vendor"),
        "http_status": status,
        "attempt": attempt,
        "reason": reason,
        "token": tok,
    })

if __name__ == "__main__":
    post_reading({
        "tent_id": TENT_ID,
        "source": "mqtt",
        "vendor": "ecowitt",
        "captured_at": "2026-06-04T15:30:00Z",
        "readings": {"temp_f": 77.4, "humidity": 58},
    })
```

Notes: no real secrets, no device control, placeholder token format
`vbt_...`. Replace placeholders before running.

## 6. ESP32 / MicroPython pseudocode

```python
# Pseudocode — adapt to your board / HTTP library.
import urequests, ujson, utime, urandom

URL = "https://<project>.functions.supabase.co/sensor-ingest-webhook"
TOKEN = "vbt_xxxxxxxxxxxxxxxx"   # placeholder, load from secure storage
MAX_RETRIES = 4
BASE = 3
CAP = 45
TIMEOUT_S = 10

def retryable(status):
    if status is None: return True
    if status in (408, 429): return True
    return 500 <= status <= 599

def jitter(attempt):
    bound = min(CAP, BASE * (1 << attempt))
    return urandom.getrandbits(16) / 65535.0 * bound

def send(payload):
    for attempt in range(MAX_RETRIES + 1):
        status = None
        try:
            r = urequests.post(
                URL,
                data=ujson.dumps(payload),
                headers={
                    "Authorization": "Bearer " + TOKEN,
                    "Content-Type": "application/json",
                },
                timeout=TIMEOUT_S,
            )
            status = r.status_code
            r.close()
            if 200 <= status < 300:
                return True
            if not retryable(status):
                return False  # 400/401/403/404 — do not retry
        except Exception:
            pass  # network/timeout — retry
        if attempt >= MAX_RETRIES:
            return False
        utime.sleep(jitter(attempt))
    return False
```

Cap retries. **Never** wrap this in an infinite loop. Only use a
placeholder token.

## 7. Home Assistant `rest_command` example

```yaml
# configuration.yaml
rest_command:
  verdant_post_reading:
    url: "https://<project>.functions.supabase.co/sensor-ingest-webhook"
    method: POST
    timeout: 15
    headers:
      Authorization: !secret verdant_bridge_token   # vbt_... in secrets.yaml
      Content-Type: application/json
    payload: >
      {
        "tent_id": "tent_123",
        "source": "webhook",
        "vendor": "home_assistant",
        "captured_at": "{{ now().isoformat() }}",
        "readings": {
          "temp_f": {{ states('sensor.tent_temp_f') | float(0) }},
          "humidity": {{ states('sensor.tent_humidity') | float(0) }}
        }
      }
```

`!secret verdant_bridge_token` lives in `secrets.yaml`. Do not inline
the token. Home Assistant automations may call `rest_command`; if the
call fails, schedule a retry via a delay/template rather than tight loops.

## 8. Node-RED guidance

Suggested flow:

1. **Inject / sensor node** — produce a reading on a cadence or change.
2. **Function node** — build the JSON payload, set `source`, `vendor`,
   `captured_at`, `tent_id`, and `readings`.
3. **HTTP request node** — POST to the Verdant webhook URL with
   `Authorization: Bearer vbt_...` from environment / credentials.
4. **Catch / status node** — on failure, branch by HTTP status:
   - `400 / 401 / 403 / 404` → log and stop (do not retry).
   - `408 / 429 / 5xx` / network error → schedule a Full Jitter retry,
     capped at 4 attempts.
5. Do **not** retry in tight loops. Use a delay node seeded with a
   jittered value.
6. Keep any **device-control flows separate** from the ingest flow. They
   are out of scope for Verdant ingest and must remain disabled in
   anything that talks to Verdant.

## 9. MQTT bridge guidance

- The MQTT broker / client collects readings.
- A local **bridge script** (Pi / Node-RED / small daemon) subscribes
  and normalizes payloads.
- The bridge POSTs into Verdant with `source: "mqtt"`. `vendor` may
  identify the original device ecosystem, e.g. `"ecowitt"`.
- MQTT **topic names are not auth.** Do not treat topic paths as
  ownership. Authorization is the JWT / bridge token only.
- Apply the same Full Jitter retry policy as HTTP clients. Do not
  republish to MQTT on Verdant failure unless you also dedupe by
  `captured_at`.

## 10. Failure logging

Every failed POST should log:

- `captured_at`
- `source`
- `vendor` (if present)
- HTTP status (or `null` for network/timeout)
- Retry attempt number
- Final failure reason

Never log full tokens. If a token must appear for debugging, redact to
the first 4 and last 3 characters (e.g. `vbt_…abc`).

## 11. Security notes

- Bridge tokens are **secrets**. Treat them like passwords.
- **Never commit tokens** to git or container images.
- **Never put bridge tokens in frontend code.** They belong on the
  device / server only.
- **Never paste the `service_role` key into a bridge client.** Bridge
  clients use a bridge token (`vbt_…`) or a user JWT — nothing else.
- **Rotate compromised tokens immediately** via the Tent Bridge Tokens
  panel.
- Prefer environment variables or local secret files
  (`/etc/verdant/bridge.env`, HA `secrets.yaml`, ESP32 secure storage).
- Do not expose local bridge endpoints publicly unless they are
  intentionally secured (TLS + auth).

## 12. What bridge clients still must not do

- No device control (fans, lights, pumps, heaters, humidifiers,
  dehumidifiers, irrigation, dosing).
- No alert creation.
- No Action Queue writes.
- No AI Doctor invocation.
- No relabeling of `invalid` / `stale` / `unknown` readings as `live`.
