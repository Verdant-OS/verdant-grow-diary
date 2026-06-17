# GGS 3-in-1 Soil Sensor Pro — Audit Findings + Minimal Slice Plan

## Audit findings (existing patterns reused, no duplication)

**Sensor normalization & GGS mapping**
- `src/lib/spiderFarmerGgsMappingRules.ts` already normalizes Spider Farmer GGS payloads (the parent product line for the 3-in-1 Soil Sensor Pro). It supports `soil_water_content`, `soil_ec`, `soil_temp_c`, `soil_temp_f`, plus alias tolerance, bounds checks, stale window (`SPIDER_FARMER_GGS_STALE_MS = 15min`), `source ∈ live | stale | invalid`, `raw_payload` preservation, and warnings instead of throws.
- `src/lib/sensors/normalizeSensorReading.ts`, `src/lib/sensorIngestNormalizationRules.ts`, `src/lib/sensorValidation.ts` define the canonical reading shape and metric list.
- DB trigger `public.validate_sensor_reading` already accepts metrics `soil_moisture_pct`, `ec`, plus the canonical source labels (`live | manual | csv | demo | stale | invalid`).

**Ingest paths (no new edge function needed)**
- `supabase/functions/sensor-ingest-webhook/` — generic per-tent bridge webhook.
- `supabase/functions/pi-ingest-readings/` — Pi/local bridge using `pi_ingest_commit_batch` RPC.
- `supabase/functions/ecowitt-ingest/`, `ecowitt-real-ingest/` — vendor adapters.
- The GGS 3-in-1 Soil Sensor Pro is delivered through the same Spider Farmer GGS local bridge (MQTT / Home Assistant / Pi bridge), so it rides the **existing `sensor-ingest-webhook` + Pi bridge** path — no new edge function.

**Provider labels & source badges**
- `src/constants/sensorProviderLabels.ts` already includes `spider_farmer_ggs → "Spider Farmer GGS"`.
- `src/components/TimelineSensorSourceBadge.tsx` + `src/lib/timelineSensorSourceBadgeRules.ts` already render canonical source badges, and Evidence Drawer reuses the same component.

**Quick Log snapshot attach**
- `src/lib/latestSensorSnapshotRules.ts` builds the latest tent snapshot from long-format `sensor_readings`. Quick Log reads it through `src/components/QuickLogSensorSnapshotStrip.tsx` and attaches via existing `quicklog_save_event` / `quicklog_save_manual` RPCs. Quick Log never inserts sensor readings.
- `manualSensorSnapshotQualityRules.ts` already classifies fresh/stale/invalid and blocks bad attachments.

**What is missing (the minimal slice)**
1. A thin GGS-soil-only adapter that converts a normalized `SpiderFarmerGgsDraft` (or raw payload) into canonical long-format `sensor_readings` drafts limited to the soil probe metrics, and asserts tent context.
2. Whitelist `spider_farmer_ggs` in the snapshot/provider trust path so Quick Log shows the correct source chip + Live/stale state.
3. Tests + static-safety guards.

## File-level plan (additive, minimal)

**New**
- `src/lib/ggsSoilSensorReadingNormalizer.ts` — pure helper. Input: unknown payload. Output: `{ status: "accepted" | "degraded" | "invalid", source: "live"|"stale"|"invalid", provider: "spider_farmer_ggs", tent_id, plant_id?, captured_at, confidence: "high"|"medium"|"low", readings: { soil_moisture_pct?, soil_temp_c?, ec? }, raw_payload, warnings[] }`. Internally delegates to `normalizeSpiderFarmerGgsPayload` for parsing/bounds and adds soil-only canonical mapping (incl. EC unit-mismatch heuristic, missing-tent rejection, manual-vs-live source rules, NaN/Infinity rejection).
- `src/lib/ggsSoilSensorSnapshotAttach.ts` — pure adapter that takes the latest validated GGS soil readings for a tent/plant and produces a Quick Log snapshot draft compatible with the existing snapshot attach contract. Never writes.
- `src/test/ggs-soil-sensor-reading-normalizer.test.ts` — alias coverage (snake + camelCase), missing tent rejection, missing source ≠ live, NaN/Infinity, EC unit-mismatch flag, stale classification, raw_payload preserved but never rendered.
- `src/test/ggs-soil-sensor-snapshot-attach.test.ts` — latest valid GGS attaches with `source: live`; stale → blocked or visibly marked stale; invalid → blocked; no sensor_readings insert.
- `src/test/ggs-soil-sensor-ingest-wiring-safety.test.ts` — static safety: no new edge function, no UI `.insert/.update/.delete/.upsert/.rpc/functions.invoke`, no service role / bridge token literal, no XLSX import surface reintroduced, no `raw_payload` rendered, no AI/alert/action-queue writes, no device-control verbs.
- `src/test/ggs-soil-sensor-timeline-badge.test.tsx` — Timeline + Evidence Drawer render the `spider_farmer_ggs` provider chip with the correct canonical source badge.

**Edited (presenters only, no logic duplication)**
- `src/components/QuickLogSensorSnapshotStrip.tsx` — recognize `provider === "spider_farmer_ggs"` for the soil probe so the provider chip + freshness reuse the existing rules. (Likely already works through `deriveProviderLabel`; will only edit if a test exposes a gap.)

**Not touched**
- No schema/RLS/Edge changes.
- No new edge function.
- No UI rewrites.
- No XLSX/import surfaces.
- No AI/alerts/action-queue/device-control code.

## Source & provenance behavior

| Condition | source | confidence |
|---|---|---|
| Fresh (<15 min) payload via bridge, tent valid, values in bounds | `live` | `high` |
| Some metrics valid, others out of bounds/missing | `live` | `medium` (warnings recorded) |
| Captured_at older than stale window | `stale` | `low` |
| Malformed / NaN / impossible values / missing tent / unknown source / EC unit mismatch | `invalid` | `low` |
| Manually entered GGS values | `manual` | per existing manual rules |

`raw_payload` is preserved on the reading draft; UI guard tests assert it is never rendered.

## Current grow E2E smoke

- Confirm via `supabase--read_query` whether the signed-in test grow has any `sensor_readings` rows with `source = 'spider_farmer_ggs'`.
- If yes: run the read-only Quick Log attach path against the latest soil reading and verify Timeline + Evidence Drawer badges.
- If no: use an explicitly labeled fixture (`source: 'demo'` or test fixture passed directly to the normalizer), and report Sentinel sign-off blocked on a real bridge reading.

## Validation commands

- `bunx vitest run src/test/ggs-soil-sensor-reading-normalizer.test.ts src/test/ggs-soil-sensor-snapshot-attach.test.ts src/test/ggs-soil-sensor-ingest-wiring-safety.test.ts src/test/ggs-soil-sensor-timeline-badge.test.tsx`
- `bunx vitest run src/test/spider-farmer-ggs-mapping-rules.test.ts src/test/timeline-sensor-source-badge-component.test.tsx src/test/sensor-source-summary-rules.test.ts`
- `bun run typecheck` (3 pre-existing ecowitt errors expected, unrelated)

## Safety verdict (pre-commit, will re-state post-implementation)

- New write path: **no** — normalizer + snapshot adapter are pure.
- Bypasses ingest validation: **no** — payloads still flow through `validate_sensor_reading` + existing webhook auth.
- Quick Log inserts sensor readings: **no** — attach only.
- Alerts / Action Queue / AI / device control: **no**.
- GGS data clearly labeled `live | manual | stale | invalid`: **yes**.

## Risk / rollback

- Risk: low — additive pure helpers + tests, no schema or edge changes.
- Rollback: delete the new files and revert any minor `QuickLogSensorSnapshotStrip.tsx` edit.
