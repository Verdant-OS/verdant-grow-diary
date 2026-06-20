# Local EcoWitt MQTT → Verdant Ingest Bridge

A safe developer/operator setup for piping a local EcoWitt gateway
(GW1100/GW1200/etc.) into Verdant through the **existing validated
`sensor-ingest-webhook` Edge Function**.

> Local scripts post only to Verdant's validated ingest route. They must
> never insert directly into database tables, never use `service_role`,
> never use auth-admin, never execute device commands, and never write
> to the Action Queue.

---

## What this bridge does

```
EcoWitt gateway ──HTTP/UDP──► ecowitt2mqtt ──MQTT──► Mosquitto
                                                       │
                                  ecowitt/grow topic ──┘
                                       │
                  scripts/dev/ecowitt-mqtt-runner.ts (this repo)
                                       │
                       normalize (ecowittMqttIngestRules)
                                       │
                       POST  VERDANT_INGEST_URL  (Edge Function)
                                       │
                       accepted / rejected report (redacted)
```

The runner **never** opens a database connection. All persistence is the
Edge Function's responsibility, which enforces sensor truth rules, RLS,
and bridge-token auth.

---

## Required local tools

| Tool                                         | Purpose                                             |
| -------------------------------------------- | --------------------------------------------------- |
| **Mosquitto** (or any MQTT broker)           | Local broker on `127.0.0.1:1883`                    |
| **ecowitt2mqtt** (or equivalent publisher)   | Publishes GW1200 packets to MQTT                    |
| **MQTT Explorer** *(optional)*               | Inspect the `ecowitt/grow` topic                    |
| **Verdant repo scripts** (this repo)         | Normalize + POST to the validated ingest webhook    |
| **`mqtt` npm package** *(only for live mode)* | `bun add mqtt` — not needed for `--dry-run --sample` |

---

## Topic convention

| Item   | Default          |
| ------ | ---------------- |
| Topic  | `ecowitt/grow`   |
| Broker | `mqtt://127.0.0.1:1883` |

---

## Required env vars

| Var                    | Meaning                                                  |
| ---------------------- | -------------------------------------------------------- |
| `VERDANT_INGEST_URL`   | Full ingest URL, `https://<ref>.supabase.co/functions/v1/sensor-ingest-webhook` |
| `VERDANT_BRIDGE_TOKEN` | Bridge token (`vbt_...`) — keep secret                   |
| `VERDANT_TENT_ID`      | Target tent UUID                                         |

## Optional env vars

| Var                     | Default                  | Notes                                |
| ----------------------- | ------------------------ | ------------------------------------ |
| `VERDANT_PLANT_ID`      | *(none)*                 | Metadata only                        |
| `ECOWITT_MQTT_URL`      | `mqtt://127.0.0.1:1883`  | Local broker URL                     |
| `ECOWITT_MQTT_TOPIC`    | `ecowitt/grow`           | Topic the runner subscribes to       |
| `ECOWITT_MQTT_USERNAME` | *(none)*                 | If broker requires auth              |
| `ECOWITT_MQTT_PASSWORD` | *(none)*                 | If broker requires auth              |

---

## Secret handling

- **Never** paste bridge tokens or service-role keys into chat, logs,
  screenshots, screen recordings, or commit history.
- The runner and `send-ecowitt-test-payload.ts` always log tokens as
  `vbt_…(redacted, len=NN)` via `redactBridgeToken()`.
- **No `service_role` key is required.** A bridge token is enough — the
  Edge Function resolves ownership server-side.
- The local bridge does **not** need Supabase DB credentials.

---

## Usage

### Dry run — preview the normalized payload, no network call

```bash
bun run dev:ecowitt-mqtt:dry-run -- --sample --once
bun run dev:ecowitt-mqtt:dry-run -- --invalid --once
bun run scripts/send-ecowitt-test-payload.ts --dry-run
```

Dry-run mode:

- Normalizes the payload through `ecowittMqttIngestRules`.
- Prints a **redacted** request preview (URL, redacted token, header
  set, payload summary, trust classification).
- **Performs no network call and creates no DB rows.**

### Live (subscribe to local MQTT, POST to ingest webhook)

```bash
export VERDANT_INGEST_URL=https://<ref>.supabase.co/functions/v1/sensor-ingest-webhook
export VERDANT_BRIDGE_TOKEN=vbt_xxxxxxxxxxxxxxxx
export VERDANT_TENT_ID=00000000-0000-4000-8000-000000000000
bun add mqtt
bun run dev:ecowitt-mqtt
```

Each accepted MQTT packet:

1. Is parsed as JSON.
2. Is normalized through `ecowittMqttIngestRules`.
3. **Stale or invalid** payloads are reported and **not** POSTed as live.
4. Valid payloads are POSTed to `VERDANT_INGEST_URL` with
   `Authorization: Bearer <redacted>` + `Idempotency-Key` headers.
5. The accepted/rejected report is printed (token redacted).

---

## Sample payloads

### Valid

```json
{
  "dateutc": "2026-06-09 12:25:00",
  "tempf": 78.6,
  "humidity": 56,
  "soilmoisture1": 45,
  "co2": 720,
  "stationtype": "GW1200"
}
```

Expected: webhook **accepted**, snapshot trust shows **Live** (Ecowitt).

### Invalid / stale

```json
{
  "dateutc": "2025-01-01 00:00:00",
  "tempf": 7431,
  "humidity": 250,
  "co2": 99999
}
```

Expected: normalizer drops impossible metrics, marks reading **invalid**
and/or **stale**; webhook **rejected**; snapshot trust **never** Live.

---

## Expected webhook results

| Payload                       | Webhook            | Verdant trust badge   |
| ----------------------------- | ------------------ | --------------------- |
| Valid fresh                   | 200 accepted       | **Live** + Ecowitt    |
| Valid older than 15 minutes   | 4xx stale_reading  | **Stale**             |
| Impossible temp/RH/CO2 only   | 4xx invalid_metric | **Invalid**           |
| Malformed JSON / missing tent | 4xx invalid_payload | **Invalid**           |
| Bad bridge token              | 401 auth_failed    | **Invalid**           |

Stale or invalid telemetry is **never** promoted to Live.

---

## Troubleshooting

| Symptom                            | Likely cause / fix                                       |
| ---------------------------------- | -------------------------------------------------------- |
| `missing VERDANT_INGEST_URL`       | Export the env var. Use `--dry-run` to verify shape.     |
| HTTP 401 / `auth_failed`           | Bridge token rejected — rotate via `mint-bridge-token`.  |
| HTTP 403 / `forbidden`             | Token not authorized for this tent. Check `VERDANT_TENT_ID`. |
| `invalid tent id`                  | Tent UUID does not exist or token cannot see it.         |
| `malformed_payload`                | EcoWitt JSON missing `dateutc` / `tempf` / `humidity`.   |
| `invalid_temp` / `invalid_rh` / `invalid_co2` | Sensor reporting impossible values — check unit settings (F vs C, % vs raw). |
| `stale_reading`                    | Captured >15 min ago. Verdant will not promote to Live.  |
| Network timeout                    | Retry; the runner does not tight-loop on failure.        |

---

## Safety summary

- ✅ Posts only to the existing validated ingest webhook.
- ✅ Bridge token redacted in every log line.
- ✅ `--dry-run` performs zero network calls and zero DB writes.
- ✅ Stale / invalid payloads are reported, never marked Live.
- ❌ No `service_role`. No `auth-admin`. No device control.
- ❌ No Action Queue writes. No alerts. No automation.
- ❌ No direct `sensor_readings` / `public.*` inserts.

---

## Operator UI: /operator/ecowitt-bridge-status

Read-only operator diagnostics for local Ecowitt bridge runs. Stores
**only redacted JSON in this browser's localStorage** — never in Supabase.

### Generate a redacted report

```bash
bun run dev:ecowitt-mqtt:dry-run -- --sample --once --write-report
# writes ./tmp/ecowitt-last-ingest-report.json
```

The runner re-redacts the bridge token before writing and prints a
"paste into /operator/ecowitt-bridge-status" hint.

### View / import in the UI

1. Open `/operator/ecowitt-bridge-status`.
2. Paste the JSON from `./tmp/ecowitt-last-ingest-report.json` into the
   "Paste redacted report JSON" textarea.
3. Click **Import report**. Counts and the latest classification update.
4. **View latest report** opens a drawer with `IngestAttemptReportPanel`.
5. **Copy redacted report** copies the redacted JSON only.
6. **Clear local diagnostics** removes locally-stored attempts.

### Safety

- Imports defensively re-redact `vbt_…` / `sk_…` / JWT-looking tokens
  anywhere except the dedicated `auth` preview field, and **block**
  pastes that still carry token-shaped values outside it.
- Stale / invalid / unknown attempts **never** render as Live.
- Provider chip (Ecowitt) is rendered separately from the trust badge.
- No DB writes. No Edge Function calls from the page.

