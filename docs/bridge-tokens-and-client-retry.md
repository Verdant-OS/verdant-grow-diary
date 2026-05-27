# Bridge Tokens & Client Retry Guidance

**Version:** 1.0.0 · **Status:** Draft · **Owner:** Verdant Platform

---

## 1. Hardware-neutral bridge philosophy

Verdant is a **hardware-neutral intelligence layer**. It does not sell, endorse,
or require any specific hardware. Growers bring their own sensors and choose
their own stack — Raspberry Pi, ESP32, Home Assistant, Node-RED, AC Infinity,
Spider Farmer, AROYA, TrolMaster, CSV imports, MQTT bridges, or custom webhook
scripts.

Verdant's job is to **receive, validate, and contextualize** sensor readings
regardless of origin. The bridge token system exists to make this easy and safe.

```text
┌────────────────────────────────────────────────────────────────────┐
│  Any sensor source                                                 │
│  (ESP32 · Pi · Home Assistant · Node-RED · CSV · MQTT bridge)      │
└──────────────────────────┬─────────────────────────────────────────┘
                           │  HTTPS POST + ******
                           ▼
              ┌─────────────────────────┐
              │  Verdant Webhook Ingest  │
              │  (read-only pipeline)    │
              └─────────────────────────┘
```

> **Out of scope.** Bridge tokens and this ingest path are strictly
> **read-only**. They never trigger device control, automation, alerts,
> the Action Queue, or AI Doctor logic.

---

## 2. Bridge tokens

A **bridge token** is a long-lived credential issued to a sensor ingest client.
It authenticates the client when POSTing readings to Verdant's webhook endpoint.

| Property | Detail |
|----------|--------|
| Format | `vbt_<opaque-string>` (e.g. `vbt_abc123def456…`) |
| Purpose | Authenticate sensor ingest clients |
| Scope | Read-only sensor write (no device control, no user data) |
| Rotation | Revocable by tent owner at any time |

> **Never hardcode real secrets.** All examples in this document use the
> placeholder format `vbt_...`. Replace with your actual token at runtime,
> sourced from environment variables or a secrets manager.

---

## 3. Source transparency

Every reading submitted through the bridge **must** include provenance metadata
so Verdant can display source badges, detect staleness, and compute confidence.

| Field | Required | Description |
|-------|----------|-------------|
| `source` | ✅ | Origin label (e.g. `esp32_dht22`, `pi_bridge`, `home_assistant_bridge`, `node_red_bridge`) |
| `captured_at` | ✅ | ISO 8601 timestamp of when the reading was taken at the sensor |
| `device_id` | Recommended | Unique device identifier (UUID or stable MAC-derived ID) |
| `device_name` | Optional | Human-friendly name for display |

```json
{
  "source": "esp32_sht31",
  "captured_at": "2026-05-27T01:30:00Z",
  "device_id": "esp32-growroom-A1",
  "readings": [
    { "metric": "temperature_c", "value": 24.5 },
    { "metric": "humidity_pct", "value": 62.1 }
  ]
}
```

---

## 4. Client retry guidance — Full Jitter

Sensor clients run unattended on constrained hardware. A naïve retry loop that
fires instantly on failure will:

- Overwhelm the server during outages
- Drain battery / power budget
- Cause thundering-herd spikes when service recovers

### ⚠️ Do NOT retry in tight loops

```python
# ❌ DANGEROUS — never do this
while True:
    response = post(reading)
    if response.ok:
        break
    # Immediate retry with no backoff — hammers the server
```

### Safe defaults

| Parameter | Recommended |
|-----------|-------------|
| Max retries | 4 |
| Base delay | 3–4 seconds |
| Max delay cap | 45–60 seconds |
| Request timeout | 10–15 seconds |

### Full Jitter algorithm

Full Jitter (as described by AWS Architecture Blog) spreads retry attempts
across the full `[0, min(cap, base * 2^attempt)]` window, preventing
synchronized retries from multiple clients.

```
delay = random_between(0, min(max_delay, base_delay * 2^attempt))
```

---

## 5. Python example (Raspberry Pi / generic scripts)

```python
import os
import time
import random
import requests

VERDANT_URL = os.environ["VERDANT_WEBHOOK_URL"]
TOKEN = os.environ["VERDANT_BRIDGE_TOKEN"]  # vbt_...

MAX_RETRIES = 4
BASE_DELAY = 3.0      # seconds
MAX_DELAY = 60.0      # seconds
TIMEOUT = 12          # seconds


def post_reading(payload: dict) -> bool:
    """Post a sensor reading with exponential backoff + full jitter."""
    headers = {
        "Authorization": f"******",
        "Content-Type": "application/json",
    }

    for attempt in range(MAX_RETRIES + 1):
        try:
            resp = requests.post(
                VERDANT_URL,
                json=payload,
                headers=headers,
                timeout=TIMEOUT,
            )
            if resp.status_code < 500:
                return resp.ok  # 4xx = client error, don't retry
            # 5xx = server error, retry with backoff
        except requests.exceptions.RequestException:
            pass  # Network error — retry

        if attempt < MAX_RETRIES:
            cap = min(MAX_DELAY, BASE_DELAY * (2 ** attempt))
            delay = random.uniform(0, cap)
            time.sleep(delay)

    return False  # All retries exhausted


# Example usage
if __name__ == "__main__":
    reading = {
        "source": "pi_bridge",
        "captured_at": "2026-05-27T01:30:00Z",
        "device_id": "pi-growroom-01",
        "readings": [
            {"metric": "temperature_c", "value": 24.5},
            {"metric": "humidity_pct", "value": 62.1},
        ],
    }
    success = post_reading(reading)
    print("Sent" if success else "Failed after retries")
```

---

## 6. ESP32 / MicroPython pseudocode

MicroPython on ESP32 has limited libraries. Use `urequests` and implement
jitter manually:

```python
# ESP32 MicroPython pseudocode — adapt to your board

import urequests
import time
import os

# Read token from device config (never hardcode)
TOKEN = os.getenv("VERDANT_BRIDGE_TOKEN")  # vbt_...
URL = os.getenv("VERDANT_WEBHOOK_URL")

MAX_RETRIES = 4
BASE_DELAY = 4       # seconds
MAX_DELAY = 45       # seconds
TIMEOUT = 10         # seconds (if supported by your urequests build)


def random_float(low, high):
    """Pseudo-random float using onboard entropy."""
    import urandom
    return low + (urandom.getrandbits(16) / 65535) * (high - low)


def post_reading(payload_json: str) -> bool:
    headers = {
        "Authorization": "Bearer " + TOKEN,
        "Content-Type": "application/json",
    }

    for attempt in range(MAX_RETRIES + 1):
        try:
            resp = urequests.post(URL, data=payload_json, headers=headers)
            status = resp.status_code
            resp.close()
            if status < 500:
                return status < 400
        except Exception:
            pass  # Network error — retry

        if attempt < MAX_RETRIES:
            cap = min(MAX_DELAY, BASE_DELAY * (2 ** attempt))
            delay = random_float(0, cap)
            time.sleep(delay)

    return False
```

> **Tip:** On ESP32, prefer deep-sleep between measurement cycles rather
> than looping with `time.sleep()`. Wake → read → POST → sleep is the most
> power-efficient pattern.

---

## 7. Other client platforms

### Home Assistant (`rest_command`)

```yaml
# configuration.yaml
rest_command:
  verdant_push_reading:
    url: !secret verdant_webhook_url
    method: POST
    headers:
      Authorization: "****** states('input_text.verdant_bridge_token') }}"
      Content-Type: "application/json"
    payload: >
      {
        "source": "home_assistant_bridge",
        "captured_at": "{{ now().isoformat() }}",
        "device_id": "ha-instance-01",
        "readings": [
          {"metric": "temperature_c", "value": {{ states('sensor.grow_temp') }} },
          {"metric": "humidity_pct", "value": {{ states('sensor.grow_humidity') }} }
        ]
      }
    timeout: 12
```

Home Assistant's built-in `rest_command` does not retry. Wrap calls in an
automation with a retry counter or use AppDaemon with the Python pattern above.

### Node-RED

Use the **HTTP Request** node with:

- Method: POST
- URL: `{{env.VERDANT_WEBHOOK_URL}}`
- Headers: `Authorization: ******
- Payload: JSON with `source: "node_red_bridge"`

For retry, wire a **Catch** node back to the HTTP Request node through a
**Delay** node configured with exponential backoff (or use the
`node-red-contrib-exponential-backoff` community node).

---

## 8. Summary of rules

1. **Always** include `source` and `captured_at` in every payload.
2. **Never** hardcode tokens — use environment variables or secrets managers.
3. **Never** retry in a tight loop — use Full Jitter exponential backoff.
4. **Respect** the safe defaults (max 4 retries, 3–4 s base, 45–60 s cap).
5. **Remember** bridge tokens are read-only — device control is out of scope.

---

## Related docs

- [Sensor Webhook Ingest](./sensor-webhook-ingest.md)
- [V1 Sensor Ingest Contract](./v1-sensor-ingest.md)
- [Pi Bridge Contract](./pi-bridge-contract.md)
- [Using ESP32 with Verdant](./using-esp32-with-verdant.md)
