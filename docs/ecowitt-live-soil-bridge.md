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
- supports multi-channel soil probes via a channel map
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
| `VERDANT_BRIDGE_TOKEN` | `vbt_…` bridge token. Required unless dry-run. Never paste it into chat / logs / commits. |
| `VERDANT_TENT_ID` | Fallback tent UUID for air/CO₂/VPD metrics. |
| `VERDANT_PLANT_ID` | Optional fallback plant UUID. |
| `ECOWITT_SOIL_CHANNEL_MAP_JSON` | JSON map per soil probe (see below). |
| `ECOWITT_BRIDGE_DRY_RUN` | `"1"` to force dry-run. |

### Channel map

```json
{
  "soilmoisture1": { "tent_id": "TENT_UUID_A", "plant_id": "PLANT_UUID", "label": "front_left_pot" },
  "soilmoisture2": { "tent_id": "TENT_UUID_B", "label": "front_right_pot" }
}
```

Probes without a mapping are **dropped** (we never invent routing).

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

### Send one valid reading

Once dry-run looks correct, drop the `--dry-run` flag and start the bridge
with `VERDANT_INGEST_URL` and `VERDANT_BRIDGE_TOKEN` set. The first valid
MQTT message will be forwarded once.

### Send one invalid reading (safety check)

Publish an MQTT message with `tempf: 9999` and `humidity: 200`. The
bridge MUST reject it (`accepted: 0`). Verify it is **not** visible in
Verdant's live sensor view.

## How to confirm inside Verdant

- Open the affected tent's Sensor Data view.
- A fresh, valid EcoWitt reading appears with source `ecowitt` /
  transport `mqtt`.
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
   Run the bridge without `--dry-run` and post exactly one reading.
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
| `VERDANT_BRIDGE_TOKEN` | Required (non dry-run) | `vbt_…` bridge token issued for this bridge. |
| `VERDANT_TENT_ID` | Required for air/env metrics | Fallback tent UUID when no channel map covers a metric. |
| `VERDANT_PLANT_ID` | Optional | Fallback plant UUID. |
| `ECOWITT_SOIL_CHANNEL_MAP_JSON` | Optional | Per-probe tent/plant routing. Unmapped probes are dropped. |

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
