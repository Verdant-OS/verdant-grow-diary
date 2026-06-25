# EcoWitt GW1200 → MQTT → Verdant (local bridge)

**Status:** Foundation (backend ingest contract + pure normalizer).
**Direction:** EcoWitt-only physical sensor path (see
`docs/ecowitt-only-sensor-direction.md`).

This guide covers running an EcoWitt GW1200 console through
[`ecowitt2mqtt`](https://github.com/bachya/ecowitt2mqtt) and a local
Mosquitto broker so its readings can flow into Verdant's standard
`sensor_readings` pipeline as `source = live`.

It does **not** add device control, automation, or `action_queue` writes.

---

## 1. Topology

```text
EcoWitt GW1200
  └─ DIY custom upload (HTTP POST)
       └─ ecowitt2mqtt (listens on :4199 /data/report)
            └─ Mosquitto MQTT broker (127.0.0.1:1883)
                 └─ Verdant ingest bridge (future)
                      └─ Supabase `sensor_readings`
                           └─ Dashboard / Alerts / AI Doctor
```

Vendor stays `ecowitt`. Transport stays `mqtt`. Verdant labels the
reading `source = live` only when the normalizer's truth guards pass.

---

## 2. Local setup (macOS)

```bash
brew install mosquitto
brew services start mosquitto

pip3 install ecowitt2mqtt
ecowitt2mqtt --mqtt-broker 127.0.0.1 --mqtt-port 1883
```

On the GW1200 console, configure DIY Upload Server:

- Server: laptop LAN IP
- Port: `4199`
- Path: `/data/report`
- Protocol: EcoWitt

Verify the broker sees data:

```bash
mosquitto_sub -t "ecowitt/#" -v
```

---

## 3. Backend ingest contract

`src/lib/ecowittMqttIngestRules.ts` exposes a pure normalizer:

```ts
normalizeEcowittMqttPayload({
  payload,       // raw object decoded from MQTT
  tentId,        // resolved from topic mapping
  plantId,       // optional
  now,           // injectable for tests
});
```

It returns:

```ts
{
  ok: boolean,
  draft: CanonicalSensorReadingDraft | null,
  reasons: EcowittIngestReasonCode[],
  chips: string[],
}
```

### Canonical draft

| Field                    | Type            | Notes                                    |
| ------------------------ | --------------- | ---------------------------------------- |
| `provider`               | `"ecowitt"`     | constant                                 |
| `source`                 | `"live"` / `"invalid"` | downgraded if any guard trips     |
| `captured_at`            | ISO string      | parsed from `dateutc` or `captured_at`   |
| `tent_id`                | uuid \| null    | from caller or payload                   |
| `plant_id`               | uuid \| null    | optional                                 |
| `air_temp_f`             | number \| null  | dropped if outside realism range         |
| `humidity_pct`           | number \| null  | dropped if outside 0–100                 |
| `vpd_kpa`                | number \| null  | derived ONLY when temp + RH valid        |
| `soil_water_content_pct` | number \| null  | dropped if outside 0–100                 |
| `soil_temp_f`            | number \| null  | dropped if outside realism range         |
| `co2_ppm`                | number \| null  | dropped if outside 0–10000               |
| `raw_payload`            | object          | verbatim audit copy                      |
| `confidence`             | number 0–1      | drops per invalid chip                   |

### Reason codes

`invalid_temp`, `invalid_rh`, `invalid_vpd`, `invalid_soil_moisture`,
`invalid_soil_temp`, `invalid_co2`, `stale_reading`,
`missing_captured_at`, `malformed_payload`.

A stale or fully-invalid payload returns `ok: false` and the draft's
`source` is forced to `"invalid"` so callers cannot persist it as a
healthy live reading.

---

## 4. Auth (future bridge wiring)

When an ingest route is added it MUST reuse the existing bridge token
path (`supabase/functions/_shared/sensorIngestAuth.ts`,
`bridge_tokens` table) — **never** `service_role` from client code.
Bridge tokens are scoped to a `tent_id` and validated server-side.

---

## 5. Retry guidance for bridge clients (Full Jitter)

Outbound retries from any future Pi / laptop bridge should use **Full
Jitter** exponential backoff (AWS architecture blog):

```text
delay = random_between(0, min(cap, base * 2^attempt))

base  = 500 ms
cap   = 30_000 ms
attempts = 6
```

Never retry on `4xx` (other than `408` / `429`). Never spin without
jitter — a synchronized fleet hammering the broker is a self-DDoS.

---

## 6. Safety guarantees

- Manual readings are **never** displayed as live.
- Invalid telemetry **never** classifies a tent/plant as healthy.
- No device control. No automation. No alerts auto-created beyond the
  existing alert evaluator. No `action_queue` writes.
- `service_role` is not used in client or normalizer code.
- All sensor truth rules in `docs/sensor-truth-rules.md` apply.

---

## 7. Tests

`src/test/ecowitt-mqtt-ingest-rules.test.ts` covers:

- temp/RH mapping
- VPD derived only when both valid
- soil moisture / soil temp mapping
- CO2 mapping + rejection
- raw_payload preserved
- impossible temp / RH rejected
- stale timestamp not labeled live
- malformed / missing captured_at rejected
- canonical draft has no device-control fields
- module never imports supabase or references `action_queue`

---

## 8. Local test sender (developer loop)

For end-to-end validation against the deployed
`sensor-ingest-webhook` Edge Function without wiring the full MQTT
subscriber yet:

```bash
export VERDANT_INGEST_URL="https://<project-ref>.supabase.co/functions/v1/sensor-ingest-webhook"
export VERDANT_BRIDGE_TOKEN="vbt_..."         # mint via Settings → Bridge Tokens
export VERDANT_TENT_ID="<tent-uuid>"
# optional:
export VERDANT_PLANT_ID="<plant-uuid>"

# Valid EcoWitt-shaped payload (should insert one row per metric):
bun run dev:send-ecowitt

# Intentionally impossible values (should be rejected by the route's
# sensor truth rules; script exits 0 because rejection is expected):
bun run dev:send-ecowitt:invalid
```

What the sender does:

- Builds a canonical webhook payload via
  `src/lib/ecowittLocalTestPayloadRules.ts` with `source: "ecowitt"`,
  `vendor: "ecowitt"`, `transport: "mqtt_local_test"`, and the metric
  aliases (`temp_f`, `humidity_pct`, `vpd_kpa`, `soil_moisture_pct`,
  `co2_ppm`) already accepted by `webhookIngest.ts`.
- Sends `Authorization: Bearer <token>` and an `Idempotency-Key` derived
  from `captured_at` so repeat runs are deduped by the existing
  `sensor_readings_dedupe_uidx` index.
- Prints request target, redacted token (`vbt_…(redacted, len=N)`),
  payload summary, HTTP status, and response body.
- Exits non-zero on unexpected failure.

Safety guarantees (sender):

- Read-only ingest path — no Action Queue, no automation, no device
  control, no `service_role`.
- Bridge token is never logged in plaintext.
- `--invalid` mode is clearly marked (`metadata.invalid_test: true`,
  `metadata.test_sender: true`) so a leaked row can never be mistaken
  for live operator data.

### Local Mosquitto check

You can still verify the broker independently of Verdant:

```bash
mosquitto_sub -t "ecowitt/#" -v
```

A long-running MQTT-to-Verdant subscriber is intentionally out of scope
for this slice — only the single-shot HTTP test sender is provided.

