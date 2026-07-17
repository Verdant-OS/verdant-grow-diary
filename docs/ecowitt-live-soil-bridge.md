# EcoWitt Live Soil Bridge

Local-only bridge that turns real EcoWitt gateway readings into validated
Verdant `sensor-ingest-webhook` payloads.

## Flow

```
EcoWitt soil/environment sensor
  → EcoWitt GW1200 gateway
  → ecowitt2mqtt
  → Mosquitto topic ecowitt/grow
  → scripts/ecowitt-live-soil-bridge.ts (this script)
  → existing sensor-ingest-webhook
  → sensor_readings / latest snapshot / charts
```

The bridge:

- normalizes raw EcoWitt MQTT payloads with the pure rules in
  `src/lib/ecowittLiveSoilIngestRules.ts`
- derives `vpd_kpa` from valid air temperature + RH only
- supports multiple soil channels for one tent via a tent-scoped channel map
- redacts `PASSKEY` / `MAC` / `password` / `token` / private IPs before
  logging and before forwarding inside `raw_payload`
- retries network errors with Full-Jitter exponential backoff
- never writes directly to the database
- never executes device commands
- never marks invalid / stale telemetry as healthy

## Required setup

1. **EcoWitt gateway** — set the custom HTTP target to the host running
   `ecowitt2mqtt`. (See ecowitt2mqtt docs.)
2. **ecowitt2mqtt** — publish to topic `ecowitt/grow` on your local
   Mosquitto broker.
3. **Mosquitto** — run on the LAN. Auth optional but recommended.
4. **bun + this script** — `bun add mqtt` then run the bridge.

## Environment variables

| Var | Purpose |
| --- | --- |
| `ECOWITT_MQTT_URL` | Full URL e.g. `mqtt://127.0.0.1:1883`. Overrides host/port. |
| `ECOWITT_MQTT_HOST` / `ECOWITT_MQTT_PORT` | Used when `*_URL` is unset. |
| `ECOWITT_MQTT_USERNAME` / `ECOWITT_MQTT_PASSWORD` | Optional broker auth. |
| `ECOWITT_MQTT_TOPIC` | Default `ecowitt/grow`. |
| `VERDANT_INGEST_URL` | Verdant `sensor-ingest-webhook` URL. Required unless dry-run. |
| `VERDANT_BRIDGE_TOKEN` | `vbt_…` bridge token, scoped to one tent. Required unless dry-run. Never paste it into chat / logs / commits. |
| `VERDANT_TENT_ID` | Fallback tent UUID for air/CO₂/VPD metrics. When set, it must be the tent scoped to the bridge token. |
| `VERDANT_PLANT_ID` | Optional fallback plant UUID. |
| `ECOWITT_SOIL_CHANNEL_MAP_JSON` | JSON map per soil probe for the same token-scoped tent only (see below). |
| `ECOWITT_BRIDGE_DRY_RUN` | `"1"` to force dry-run. |

### Channel map

```json
{
  "soilmoisture1": { "tent_id": "TENT_UUID", "plant_id": "PLANT_UUID", "label": "front_left_pot" },
  "soilmoisture2": { "tent_id": "TENT_UUID", "label": "front_right_pot" }
}
```

**One `VERDANT_BRIDGE_TOKEN` is tent-scoped.** Every mapped soil channel
must use that one token-bound `tent_id`; a map must never mix tent IDs.
Do not fan a single bridge run out to multiple tents. Configure another
tent separately with its own authorization.

Probes without a mapping are **dropped** (we never invent routing).

## Tonight's one-tent safe path

The fastest safe path tonight is local: EcoWitt gateway → `ecowitt2mqtt`
→ LAN Mosquitto → this bridge → outbound HTTPS to the existing
`sensor-ingest-webhook`. A direct `ecowitt-ingest` call is **not** the
fast path for this rollout; it is a separate, gated ingest route and
does not replace the local bridge proof.

**No public port forwarding.** Keep `ecowitt2mqtt`, Mosquitto, and the
bridge private to the LAN. The bridge makes the only remote connection
as an outbound HTTPS request; it does not need an inbound public port.

## Run modes

### Dry-run first (no network writes)

```bash
ECOWITT_BRIDGE_DRY_RUN=1 \
ECOWITT_MQTT_URL=mqtt://127.0.0.1:1883 \
ECOWITT_MQTT_TOPIC=ecowitt/grow \
VERDANT_TENT_ID=<uuid> \
bun run scripts/ecowitt-live-soil-bridge.ts --dry-run
```

The bridge will log each normalized, redacted payload it *would* POST.

### One-message `--once` proof (no network writes)

After the continuous dry-run looks sensible, use the available `--once`
mode to inspect one real local MQTT message and exit:

```bash
ECOWITT_MQTT_URL=mqtt://127.0.0.1:1883 \
ECOWITT_MQTT_TOPIC=ecowitt/grow \
VERDANT_TENT_ID=<token-scoped-tent-uuid> \
bun run scripts/ecowitt-live-soil-bridge.ts --dry-run --once
```

This mode waits for MQTT traffic and exits only after the first fully
accepted MQTT message. Invalid, stale, malformed, or partly rejected
messages do not count toward the proof. In dry-run, “accepted” means
accepted for the redacted local preview — nothing is posted to Verdant.

### Windows PowerShell one-message preview

On the home PC, use the same tent UUID for the fallback and every mapped
soil probe. Replace labels only after physically labeling the probes; do
not paste a bridge token, gateway passkey, MAC, or private IP into this
file or a chat.

```powershell
$env:ECOWITT_MQTT_URL = "mqtt://127.0.0.1:1883"
$env:ECOWITT_MQTT_TOPIC = "ecowitt/grow"
$env:VERDANT_TENT_ID = "<one-tent-uuid>"
$env:ECOWITT_SOIL_CHANNEL_MAP_JSON = '{"soilmoisture1":{"tent_id":"<one-tent-uuid>","label":"front-left"},"soilmoisture2":{"tent_id":"<one-tent-uuid>","label":"front-right"}}'
bun run scripts/ecowitt-live-soil-bridge.ts --dry-run --once
```

Confirm the emitted temperature, humidity, and each mapped soil probe
against the physical labels before moving to a live one-message proof.

### Send one controlled live MQTT message

Only after the one-message dry-run is correct, drop `--dry-run`, set
`VERDANT_INGEST_URL` and the same tent-scoped `VERDANT_BRIDGE_TOKEN`, and
use `--once`. The bridge forwards every canonical payload from the first
fully accepted MQTT message for that tent, then exits. It must not be used
to route another tent.

### Send one invalid reading (safety check)

Publish an MQTT message with `tempf: 9999` and `humidity: 200`. The
bridge MUST reject it (`accepted: 0`). Verify it is **not** visible in
Verdant's live sensor view.

## How to confirm inside Verdant

- Open the affected tent's Sensor Data view.
- A fresh, valid EcoWitt reading appears with source `live`, provider
  `ecowitt`, and transport `mqtt`.
- VPD is populated from temp + humidity (look for `derived_vpd: true` in
  the row's metadata if you inspect it via diagnostics).
- Invalid readings never appear as healthy live data.

## Safety

- The bridge has **no** Supabase client and uses **no** elevated keys.
- It does **not** create alerts, Action Queue items, or automations.
- It forwards only through the existing authenticated ingest webhook,
  which enforces RLS, source allow-listing, and range validation.
- Bridge tokens are masked in logs (`vbt_…[redacted]`).
- Device control is out of scope for this bridge and will be rejected by
  the upstream sensor-truth contract regardless.

## Rollback

Stop the script. Remove the local `mqtt` dep if installed only for this:

```bash
bun remove mqtt
```

No remote state was changed by adding the bridge — uninstall is
zero-impact.

---

## Official Verdant EcoWitt rollout order

Follow these five steps in order. **Do not skip to the EcoWitt cloud
API.** Local custom-upload / MQTT is preferred because it keeps raw
telemetry on the LAN, avoids vendor cloud secrets, and is fully
auditable from `scripts/ecowitt-live-soil-bridge.ts`.

1. **Stand up the local EcoWitt custom upload / MQTT bridge.**
   EcoWitt gateway → `ecowitt2mqtt` → Mosquitto → bridge script. No
   cloud calls, no API keys.
2. **Dry-run a normalized payload.** Use
   `scripts/ecowitt-live-soil-dry-run.ts` against
   `fixtures/ecowitt-live-soil-sample.json`. Confirm the redacted
   canonical payload, derived `vpd_kpa`, soil channels, and source label
   look correct **before** sending anything to Verdant.
3. **Send to the Verdant ingest webhook with the Verdant bridge token.**
   After the local `--once` dry-run proof, run the bridge without
   `--dry-run` and with `--once` to process exactly one fully accepted MQTT
   message for that token-scoped tent.
4. **Confirm in Verdant.** Open the affected tent and verify: live
   reading appears, source is labeled correctly, charts render, and VPD
   is derived from valid temp + RH.
5. **Only if local bridge cannot meet a real need**, evaluate the
   EcoWitt cloud API. This slice intentionally does **not** add cloud
   API keys, cloud secrets, or cloud polling. Deferred.

### Why local first

- No third-party cloud credentials live in Verdant.
- Bridge owner can inspect / redact every byte before it reaches the
  ingest webhook.
- `ecowitt2mqtt` already speaks the gateway's native custom-upload
  protocol; adding a cloud round-trip would only increase latency and
  blast radius.
- Cloud API would introduce a long-lived API key — out of scope for V0.

### Required local tools

| Tool | Purpose |
| --- | --- |
| EcoWitt gateway (e.g. GW1200/GW2000) | Source of raw soil/environment readings. |
| `ecowitt2mqtt` (or equivalent) | Translates the gateway's custom-upload HTTP push into MQTT JSON. |
| Mosquitto | Local MQTT broker on the LAN. Auth optional but recommended. |
| MQTT Explorer or `mosquitto_sub` | Inspect raw topic traffic during dry-run. |
| `scripts/ecowitt-live-soil-bridge.ts` | Verdant-side normalizer + forwarder. |

### Required Verdant environment variables

| Var | Required | Purpose |
| --- | --- | --- |
| `VERDANT_INGEST_URL` | Required (non dry-run) | Verdant `sensor-ingest-webhook` URL. |
| `VERDANT_BRIDGE_TOKEN` | Required (non dry-run) | `vbt_…` bridge token issued for one tent; do not use it to route another tent. |
| `VERDANT_TENT_ID` | Required for air/env metrics | Fallback tent UUID when no channel map covers a metric; it must match the token-scoped tent. |
| `VERDANT_PLANT_ID` | Optional | Fallback plant UUID. |
| `ECOWITT_SOIL_CHANNEL_MAP_JSON` | Optional | Per-probe plant routing within the one token-scoped tent. Unmapped probes are dropped. |

### Dry-run command (no network, no Supabase)

```bash
VERDANT_TENT_ID=<tent-uuid> \
bun run scripts/ecowitt-live-soil-dry-run.ts \
  --fixture fixtures/ecowitt-live-soil-sample.json --dry-run
```

The script:

- reads a sanitized fixture (or `--stdin`),
- runs it through the pure normalizer,
- prints the redacted canonical payload(s) with derived `vpd_kpa`,
- **never** posts to Verdant, Supabase, or any network endpoint,
- exits non-zero if the payload is invalid or rejected.

### Security warnings — read every time

- **Never** paste bridge tokens, EcoWitt API keys, `PASSKEY`, gateway
  `MAC`, station serials/IDs, private LAN IPs, Wi-Fi passwords, or any
  secret into chat, screenshots, commits, issue trackers, or
  documentation.
- If an EcoWitt cloud API key has ever been exposed (chat, screenshot,
  commit, log), **rotate it immediately** in the EcoWitt account
  dashboard. Verdant cannot rotate vendor keys for you.
- EcoWitt cloud API integration is **deferred** — this slice
  intentionally adds no cloud API keys, no cloud polling, and no cloud
  secrets.
- The bridge performs **no direct Supabase writes** and **never uses
  the service-role key**. All persistence goes through the existing
  `sensor-ingest-webhook` Edge Function.
- The bridge performs **no device control** and **no automation**.
  Invalid telemetry is dropped or labeled invalid — never surfaced as
  healthy live data.

---

## MQTT message → Verdant normalized payload mapping

The bridge converts an `ecowitt2mqtt` JSON message into one or more
canonical Verdant webhook payloads. Raw EcoWitt keys vary slightly by
firmware / gateway / `ecowitt2mqtt` version — **always verify real keys
from MQTT Explorer** before trusting this table. Use sanitized fake
values when sharing examples; never paste a real `PASSKEY`, `MAC`,
station serial, or token.

### Field mapping

| EcoWitt MQTT key(s) | Verdant canonical field |
| --- | --- |
| `tempf`, `temp1f`, `tempinf` | air temperature (°F) |
| `tempc`, `temp1c`, `tempinc` | air temperature (°C) |
| `humidity`, `humidity1`, `humidityin` | `humidity_pct` |
| `soilmoisture1` | soil moisture channel 1 |
| `soilmoisture2` | soil moisture channel 2 (multi-probe) |
| `soiltemp1f` / `soiltemp1c` | soil temperature channel 1 |
| `co2`, `co2in` | `co2_ppm` |
| `dateutc` | `captured_at` (UTC) |
| derived from air temp + RH | `vpd_kpa` (only when both valid) |
| (any) | `metadata.transport = "mqtt"` |
| (any) | `vendor = "ecowitt"` |

### Canonical Verdant source

Verdant's persisted canonical `source` is one of:

```
live | manual | csv | demo | stale | invalid
```

Accepted live MQTT readings are recorded as **`source: "live"`** with
`provider: "ecowitt"` and `transport: "mqtt"`. Do **not** use
`source: "ecowitt"` as the canonical Verdant source label —
`"ecowitt"` is the vendor / provider, not the canonical source. The
dry-run script's `canonicalPreviews[]` output already maps to this
canonical shape for audit purposes.

### Example raw MQTT payload (sanitized)

```json
{
  "dateutc": "2026-06-19 12:00:00",
  "tempf": 75.2,
  "humidity": 55,
  "soilmoisture1": 42,
  "soiltemp1f": 70.5,
  "soilmoisture2": 38
}
```

### Expected dry-run canonical preview (sanitized)

```json
{
  "source": "live",
  "provider": "ecowitt",
  "transport": "mqtt",
  "tent_id": "<tent-uuid>",
  "captured_at": "2026-06-19T12:00:00.000Z",
  "metrics": {
    "temp_f": 75.2,
    "humidity_pct": 55,
    "vpd_kpa": 1.34
  },
  "metadata": { "transport": "mqtt", "derived_vpd": true }
}
```

Run the dry-run script first and confirm this canonical shape **before**
sending anything live to Verdant.

> Reminder: this local path uses zero EcoWitt cloud API keys. The cloud
> API is deferred. Do **not** open router ports for inbound traffic —
> the bridge runs entirely on the LAN.

---

## Rollback

If you need to back out of the local EcoWitt bridge rollout, follow these
steps in order. None of them touch Verdant's database directly.

1. **Stop the bridge process** (Ctrl-C the `bun run scripts/ecowitt-live-soil-bridge.ts` tab, or kill its PID).
2. **Stop `ecowitt2mqtt`** if it was launched only for this rollout.
3. **Stop / disconnect Mosquitto** only if Mosquitto was installed solely
   for Verdant testing. If other devices on your LAN use the same
   broker, leave it running.
4. **Remove or comment out the Verdant env vars** in the shell / .env
   file you used to launch the bridge:
   - `VERDANT_INGEST_URL`
   - `VERDANT_BRIDGE_TOKEN`
   - `VERDANT_TENT_ID`
   - `VERDANT_PLANT_ID`
   - `ECOWITT_SOIL_CHANNEL_MAP_JSON`
5. **Force dry-run mode** for any leftover bridge invocation so a stale
   tab cannot accidentally POST:
   ```bash
   export ECOWITT_BRIDGE_DRY_RUN=true
   ```
6. **Point the EcoWitt gateway custom upload back** to its previous
   destination, or remove the custom upload target entirely. Only do
   this if you changed it for this rollout.
7. **Do not delete existing Verdant readings** as part of rollback.
   Sensor data cleanup is a separate, explicit operation.
8. **Never rotate or expose bridge tokens in docs / chat / screenshots.**
   If a bridge token leaked, mint a new one out-of-band; this doc will
   never include token values.
9. **Do not make direct Supabase table edits** to "undo" readings —
   rollback is a process change, not a database mutation.

If an EcoWitt cloud API key was ever exposed (chat, screenshot, commit,
log), **rotate it immediately** in the EcoWitt account dashboard.

## If VPD or charts do not update

Walk this checklist top-to-bottom. Stop at the first failing step.

1. **Raw MQTT traffic exists.** `mosquitto_sub -t ecowitt/grow -v` or
   MQTT Explorer shows a fresh JSON payload from the gateway.
2. **Dry-run output is valid.** Re-run
   `scripts/ecowitt-live-soil-dry-run.ts --fixture …` with the same
   shape as the live payload. Confirm:
   - `air_temperature_f` (or °C) is present and realistic,
   - `humidity_pct` is present, > 0, and ≤ 100,
   - canonical preview shows `source: "live"`, `provider: "ecowitt"`,
     `transport: "mqtt"`,
   - `vpd_kpa` is present **only** when temp + RH are valid,
   - missing VPD is blank, never `0` (a literal `0` would be a bug).
3. **Webhook accepted the reading.** Bridge logs show
   `forwarded { status: 2xx, tent_id }`. A 4xx means the payload was
   rejected — check `reason` and re-validate dry-run.
4. **Verdant Sensors page shows a fresh timestamp** matching
   `captured_at` (within a few minutes).
5. **Chart range covers `captured_at`.** Older charts may need a
   range/zoom change.
6. **VPD row exists or chart fallback derives it.** A persisted
   `vpd_kpa` row is preferred. If absent for older data, the chart
   falls back to deriving VPD at read-time from the same-timestamp
   temp + RH.
7. **Celsius vs Fahrenheit.** Confirm you're not sending `tempc` while
   the gateway emits `tempf` (or vice-versa). Mis-unit reads turn into
   wildly wrong VPD.
8. **Humidity sanity.** Reject anything missing, `0`, or `> 100`.
9. **Soil moisture key mapping.** Each `soilmoistureN` key must have a
   matching entry in `ECOWITT_SOIL_CHANNEL_MAP_JSON` — unmapped probes
   are intentionally dropped, not auto-routed.
10. **Provenance label.** The persisted source must be `live` for live
    readings. If it shows `demo`, `manual`, `csv`, `stale`, or
    `invalid`, the row will not appear on the live chart — that's
    correct, but it means the bridge isn't doing what you think.
