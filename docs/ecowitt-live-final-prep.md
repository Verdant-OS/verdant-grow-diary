# EcoWitt Live Sensor Data — Final Prep

Purpose: prepare Verdant for the first real EcoWitt live sensor-data run without pretending anything is live before the grower verifies the physical controller/app readings against backend evidence.

This is an operator runbook. It does not change schema, RLS, auth, alerts, Action Queue, AI behavior, or device control.

## Status rule

Verdant may only call EcoWitt data live when all are true:

1. Mosquitto or the selected bridge is running.
2. EcoWitt DIY/custom upload points to the correct local bridge/listener.
3. Raw EcoWitt payloads are observed arriving.
4. Backend accepts a valid payload.
5. Backend rejects an invalid payload.
6. Backend evidence exists for the reviewed `captured_at` window.
7. Source label is `live` or `ecowitt` as intended for that path.
8. `captured_at`, `tent_id`, and confidence are present.
9. Physical EcoWitt controller/app values match backend normalized values within tolerance.
10. No suspicious telemetry flags are present.

If any item is missing, status is **BLOCKED** or **PARTIAL**, not live.

## Tonight's terminal plan

### 1. Start Mosquitto

PowerShell:

```powershell
& "C:\Program Files\mosquitto\mosquitto.exe" -v
```

Expected evidence:

- Broker starts.
- Listener opens on port `1883`.
- No fatal bind/auth errors.

### 2. Watch EcoWitt MQTT topics

Second terminal:

```bash
mosquitto_sub -t "ecowitt/#" -v
```

Expected evidence:

- At least one EcoWitt payload appears.
- Payload timestamp and metric keys are visible.
- Do not paste raw MAC/PASSKEY/WAN IP into chat or git.

### 3. Start Verdant local bridge/listener

Use the current repo path for your bridge. Known helper scripts include:

```bash
bun run dev:send-ecowitt
bun run dev:send-ecowitt:invalid
```

If running the local HTTP listener, verify health:

```bash
curl http://localhost:8787/health
```

Expected evidence:

- Health endpoint returns success.
- Listener is LAN-local only.
- No public exposure.

### 4. Send a valid test payload

```bash
bun run dev:send-ecowitt
```

Expected evidence:

- Backend accepts payload.
- Required fields are normalized.
- `captured_at` is present.
- Source is not demo/manual/csv.
- No alert or Action Queue row is created from the test alone.

### 5. Send an invalid test payload

```bash
bun run dev:send-ecowitt:invalid
```

Expected evidence:

- Backend rejects payload.
- Bad data is not stored as healthy.
- No alert or Action Queue row is created.

## Real-device comparison

This is the live-proof gate.

Record a small table while physically viewing the EcoWitt controller/app and the backend value for the same `captured_at` window:

| Metric | Controller/app | Backend normalized | Tolerance | Pass? |
|---|---:|---:|---:|---:|
| temperature_c | | | ±0.5 °C | |
| humidity_pct | | | ±2 %RH | |
| vpd_kpa | | | ±0.15 kPa | |
| co2_ppm, if available | | | ±100 ppm | |
| soil_moisture_pct, if available | | | ±5 % | |

Do not call the data live if:

- timestamp is stale
- source label is missing or wrong
- humidity is stuck at 0 or 100
- soil moisture is stuck at 0 or 100
- Celsius/Fahrenheit are swapped
- EC unit is wrong
- pH is outside realistic range
- controller/app and backend disagree beyond tolerance

## GO / NO-GO verdicts

### READY

Use only when real controller/app values match backend values within tolerance and all required metadata is present.

Operator action:

- Record GO with the reviewed `captured_at` window.
- Keep the live claim scoped to that evidence window.
- Do not create actions automatically.

### PARTIAL

Use when the local sender/backend path works but real controller/app comparison is missing.

Operator action:

- Continue bring-up.
- Do not call telemetry live yet.

### MISMATCH

Use when real device values disagree with backend values or suspicious telemetry is present.

Operator action:

- Record NO-GO.
- Investigate units, timestamp source, channel mapping, normalization, and source labels.

### BLOCKED

Use when required evidence is missing.

Operator action:

- Stop.
- Complete missing evidence before retrying.

## Product safety constraints

- No fake live data.
- Demo/manual/csv/local sender evidence is not live proof.
- Bad or unknown telemetry must never be classified as healthy.
- No alerts from unverified telemetry.
- No Action Queue writes from ingest alone.
- No device control.
- Grower approval remains required for any future action.

## Validation commands

```bash
bunx vitest run src/test/ecowitt-live-bringup-view-model.test.ts src/test/ecowitt-live-readiness-rules.test.ts
bunx tsc --noEmit
```

## Related files

- `src/lib/ecowittLiveBringupViewModel.ts`
- `src/lib/ecowittLiveReadinessRules.ts`
- `src/test/ecowitt-live-bringup-view-model.test.ts`
- `src/test/ecowitt-live-readiness-rules.test.ts`
- `docs/ecowitt-live-canary-runbook.md`
