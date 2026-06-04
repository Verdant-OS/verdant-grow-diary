# Verdant Sensor Intelligence Safety Scanner

Defensive static guardrails for the VPD + drift slice and any future
sensor-intelligence work. The scanner adds **no features** — it refuses
to let unsafe patterns land.

## What it checks

1. Frontend code (`src/**`, excluding tests) must not reference
   `service_role`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, or
   bridge-token secrets.
2. AI Doctor / drift-only code must not auto-insert into `action_queue`
   (Action Queue items require explicit grower approval).
3. Scheduled-analysis code must not create rows with status
   `approved`, `applied`, or `executed`.
4. Device-control payload terms (`execute_device`, `setpoint_write`,
   `irrigation_control`, `light_control`, `fan_control`) must not appear
   in shipped code.
5. Peer-distribution surfaces must not synthesize fake fallback data
   (`Math.random`, `mockPeerDistribution`, `// fake peer …`).
6. Reserved future-subsystem names — `scheduled-plant-analysis`,
   `sensor_calibrations`, `CalibrationApprovalCard`,
   `unified_plant_analysis`, `detect_sensor_outliers`,
   `suggest_peer_calibration`, `statistical_process_control` — may only
   appear in files that also contain the literal marker
   `SAFETY-CONTRACT: APPROVAL-REQUIRED`.

## How to run

```sh
# CLI scan
node scripts/assert-sensor-intelligence-safety.mjs

# Vitest wrapper (runs both real-repo scan + fixture rules)
bunx vitest run src/test/sensor-intelligence-safety.test.ts

# Combined npm script
npm run test:sensor-intelligence-safety
```

## CI requirement

This scanner **must run before publishing any sensor-intelligence
change**. Add it to your pre-publish checklist alongside the existing
EcoWitt-only scan. If the scanner fails, do not ship the change — fix
the violation or add the explicit safety-contract marker if (and only
if) the code actually honors the approval-required contract.

## Rollback

The scanner and its tests are pure additions. To roll back, delete:

- `scripts/assert-sensor-intelligence-safety.mjs`
- `src/test/sensor-intelligence-safety.test.ts`
- the `test:sensor-intelligence-safety` script in `package.json`
- `supabase/tests/vpd_targets_global_defaults.sql`
- the seed migration that inserted the six canonical VPD defaults

No application behavior depends on these files.
