# Verdant Bridge Tokens & Client Retry Guidance

Verdant is a **hardware-neutral grow intelligence layer**. We do not sell hardware, and we do not lock you into any one vendor. This document explains how Verdant accepts sensor data from external sources and how to write a well-behaved ingest client.

> **Scope.** This page covers *sensor ingest only*. Bridge tokens cannot control equipment, change automations, or run actions. Device control is explicitly out of scope.

---

## 1. Hardware-neutral bridge philosophy

Verdant turns logs, photos, and sensor readings into plant memory, cautious AI context, and grower-approved actions. The data layer is intentionally generic so any reasonable source can feed it:

- ESP32 / MicroPython firmware
- Raspberry Pi bridges
- Home Assistant automations / REST commands
- Node-RED flows
- AC Infinity / Spider Farmer / AROYA / TrolMaster exports via a small relay script
- CSV import
- MQTT-to-HTTP relays
- Custom Python / Node / Bash scripts

You bring the hardware. Verdant provides the memory, the alerts, and the cautious AI on top.

---

## 2. What bridge tokens are for

A **bridge token** (prefix `vbt_`) is a tent-scoped, expiring credential designed for headless ingest clients that cannot complete an interactive Supabase login.

Bridge tokens are appropriate for:

- A Raspberry Pi posting readings every minute
- An ESP32 posting temperature/humidity over Wi-Fi
- A Home Assistant `rest_command` shipping a sensor snapshot
- A Node-RED flow forwarding MQTT messages
- A cron job uploading nightly CSV-derived readings

Bridge tokens are **not** for:

- Browser sessions (use normal sign-in)
- Controlling lights, fans, pumps, dosers, or any other equipment
- Reading other users' data
- Anything outside the sensor ingest webhook contract

Each token is scoped to **one tent** and a single user. The plaintext is shown **once** at mint time and is stored only as a hash at rest. If you lose it, mint a new one and revoke the old one.

---

## 3. Source transparency (required)

Every ingested reading must be honest about where it came from. The ingest webhook expects, at minimum:

- `source` — short label identifying the bridge/firmware. Examples:
  - `esp32_diy`
  - `pi_bridge`
  - `home_assistant`
  - `node_red`
  - `mqtt_relay`
  - `csv_import`
- `captured_at` — ISO-8601 timestamp **from the device's clock**, in UTC. Sync via NTP before posting.
- Device / source identity when available:
  - `device_id` — stable hardware ID (MAC, serial, hostname)
  - `firmware_version` — your bridge build identifier
  - `sensor_model` — e.g. `SHT45`, `SCD41`, `BME280`

Verdant uses these fields to label readings in the UI (live / manual / stale / demo / etc.) and to give the AI Doctor honest provenance. **Never** post demo or simulated values with a `source` that implies a live sensor. Use `source: "demo"` for fixtures.

---

## 4. Full-jitter retry strategy

Hobby grow rooms have flaky Wi-Fi, brownouts, and DNS hiccups. Clients that hammer the ingest endpoint in tight loops will burn battery, saturate the AP, and make outages worse. **Always retry with exponential backoff and full jitter.**

### Safe defaults

| Setting        | Recommended value     |
| -------------- | --------------------- |
| Max retries    | **4**                 |
| Base delay     | **3–4 seconds**       |
| Max delay      | **45–60 seconds**     |
| Request timeout| **10–15 seconds**     |

Rules:

- **Never** retry in a `while True:` loop with no sleep.
- **Never** retry faster than the base delay.
- Retry only on transient failures: network errors, timeouts, `HTTP 408 / 429 / 5xx`.
- **Do not** retry on `400 / 401 / 403 / 404 / 422`. Fix the payload or token instead.
- On `429`, honor a `Retry-After` header if present.
- If all retries fail, **buffer locally** (RTC RAM / SD / flatfile) and try again on the next scheduled tick. Do not drop readings silently.

### Why full jitter?

If 20 ESP32s all reboot after a power blip and retry on the same exponential schedule, they DDoS your AP and the ingest endpoint together. Full jitter spreads them out.

The formula (from AWS Architecture Blog, "Exponential Backoff And Jitter"):

```
sleep = random_between(0, min(MAX_DELAY, BASE_DELAY * 2 ** attempt))
```

---

## 5. Python example (Raspberry Pi / generic script)

Placeholder token only. Store the real one in an environment variable or a `0600` file, never in source control.

```python
import os
import random
import time
import requests

VERDANT_URL = "https://<your-project-ref>.functions.supabase.co/sensor-ingest-webhook"
BRIDGE_TOKEN = os.environ["VERDANT_BRIDGE_TOKEN"]  # vbt_...

MAX_RETRIES = 4
BASE_DELAY = 3.0       # seconds
MAX_DELAY = 60.0       # seconds
REQUEST_TIMEOUT = 12.0 # seconds

RETRYABLE_STATUS = {408, 429, 500, 502, 503, 504}


def post_reading(payload: dict) -> bool:
    headers = {
        "Authorization": f"Bearer {BRIDGE_TOKEN}",
        "Content-Type": "application/json",
    }

    for attempt in range(MAX_RETRIES + 1):
        try:
            resp = requests.post(
                VERDANT_URL,
                json=payload,
                headers=headers,
                timeout=REQUEST_TIMEOUT,
            )
            if resp.status_code < 300:
                return True
            if resp.status_code not in RETRYABLE_STATUS:
                # 4xx auth/validation errors — fix the client, do not retry.
                print(f"Non-retryable {resp.status_code}: {resp.text[:200]}")
                return False
        except (requests.ConnectionError, requests.Timeout) as exc:
            print(f"Transient error on attempt {attempt}: {exc}")

        if attempt == MAX_RETRIES:
            break

        cap = min(MAX_DELAY, BASE_DELAY * (2 ** attempt))
        sleep_for = random.uniform(0, cap)  # full jitter
        time.sleep(sleep_for)

    return False  # caller should buffer and try again next tick
```

---

## 6. ESP32 / MicroPython pseudocode

MicroPython's `urequests` is minimal; the same retry shape applies. Use `utime.sleep_ms()` with `urandom.getrandbits()` for jitter.

```text
MAX_RETRIES = 4
BASE_DELAY_MS = 3000
MAX_DELAY_MS  = 60000
TIMEOUT_S     = 12

function post_reading(payload):
    headers = {
        "Authorization": "Bearer " + BRIDGE_TOKEN,   # vbt_...
        "Content-Type":  "application/json"
    }

    for attempt in 0..MAX_RETRIES:
        ensure_wifi_connected()
        ensure_ntp_synced()                          # captured_at must be real

        try:
            resp = http_post(VERDANT_URL, payload, headers, timeout=TIMEOUT_S)
            if resp.status < 300:
                return OK
            if resp.status in {400, 401, 403, 404, 422}:
                log("non-retryable", resp.status)
                return FAIL                          # do not retry
        catch network_error:
            log("transient", attempt)

        if attempt == MAX_RETRIES:
            break

        cap_ms   = min(MAX_DELAY_MS, BASE_DELAY_MS * (1 << attempt))
        sleep_ms = random_uniform(0, cap_ms)         # full jitter
        deep_or_light_sleep(sleep_ms)

    buffer_to_flash(payload)                         # never drop silently
    return FAIL
```

Notes for ESP32 specifically:

- Sync NTP **before** building `captured_at`. A wrong clock makes every reading look stale.
- Prefer `light_sleep` between retries to save power; on battery, `deep_sleep` and resume.
- If Wi-Fi is down for more than one cycle, append to a flash buffer and drain on the next successful POST.
- Do **not** call the ingest endpoint from an ISR or a tight `while True:` loop.

---

## 7. Home Assistant / Node-RED / custom scripts

The same rules apply:

- **Home Assistant** `rest_command`: set a `timeout: 12` and let the automation retry on the next state change rather than looping.
- **Node-RED**: use a `delay` node with a randomized wait, or the `node-red-contrib-retry` pattern with capped exponential backoff.
- **Cron / CSV import**: if the POST fails, exit non-zero and let cron try again next minute — do **not** add an inner retry loop on top of cron.

---

## 8. Security & operational notes

- Bridge tokens grant **ingest only**. They cannot read other tents' data, cannot control devices, and cannot mint other tokens.
- Treat the plaintext token like a password. Store it in an env var, a secret manager, or a `0600` file. Never commit it. Never log it. Never paste it into a screenshot.
- Rotate tokens periodically and on any suspected leak. Revoke from the Tent Settings panel.
- Set a TTL that matches the device's expected lifetime in the room. Short-lived tokens are safer.
- If a token is rejected (`401`), **stop retrying** and surface a clear error — the device is no longer authorized.

---

## 9. What this document explicitly does not cover

- Device control (lights, fans, pumps, dosers, valves) — out of scope.
- Automations and the Action Queue — out of scope.
- AI Doctor behavior — see the AI Doctor docs.
- Changes to the ingest payload contract — see `docs/sensor-webhook-ingest.md`.

If you need any of the above, file it as a separate scoped request. This page is intentionally limited to **bridge tokens and well-behaved ingest clients**.
