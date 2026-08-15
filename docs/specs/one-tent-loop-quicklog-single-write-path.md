# Spec — One-Tent Loop Quick Log single write path

**Author:** Grok (in-session implementation of `ONE_TENT_LOOP_OPERATING_ORDER` Slice 3; Claude-shaped contract so Codex does not guess which writer to keep)
**Date:** 2026-08-15
**Slice name:** `ONE_TENT_LOOP_OPERATING_ORDER` / Slice 3
**Status:** IMPLEMENT — one persist path through existing `quicklog_save_manual`. No RPC allow-list expansion. No schema change. No alert-persistence rewrite.

Every claim below is labeled per the Sentinel evidence discipline:
`established fact`, `source claim`, `practical observation`, `inference`,
`uncertainty`, `missing evidence`.

---

## 1. Verdict

Canonical persist is already `quicklog_save_manual` via `useQuickLogV2Save`
(`established fact`: `src/hooks/useQuickLogV2Save.ts`,
`.agents/skills/verdant-grow-diary-core/SKILL.md`).

Plant Detail `PlantQuickLog` was the remaining third writer: a client
`diary_entries.insert` (`established fact`: `src/components/PlantQuickLog.tsx`
before this slice). Route that sheet through the same RPC adapter. Keep
public `/quick-log` as a local draft + signup CTA. Do not expand the RPC
action enum beyond `water` | `note`.

---

## 2. Writers in scope

| Surface | Persist today | This slice |
| --- | --- | --- |
| `QuickLogV2Sheet` | `useQuickLogV2Save` → `quicklog_save_manual` | Unchanged |
| AppShell legacy `QuickLog` | `legacyQuickLogUnifiedSave` → same RPC | Unchanged |
| `PlantQuickLog` | direct `diary_entries.insert` | Route through `buildPlantQuickLogV2SavePayload` + `useQuickLogV2Save` |
| Public `/quick-log` | local draft only | Unchanged; not a loop participant |

`established fact` for the V2 / legacy RPC path. `established fact` for the
pre-slice PlantQuickLog insert.

---

## 3. Adapter contract

`src/lib/plantQuickLogV2SaveAdapter.ts` is pure.

- `p_target_type: "plant"`, `p_target_id: plantId`
- `p_action: "note"` always — this sheet has no volume, so it cannot emit `water`
- `p_note` is the timeline note (including the existing photo-only /
  readings-only fallback copy)
- Typed temperature is °F in the sheet; convert once with
  `fahrenheitToCelsius` for `p_temperature_c`
- Humidity → `p_humidity_pct`; VPD stays null
- `p_details` reuses `buildQuickLogDetails` (`event_type: "quick_log"`,
  `manual_sensor_snapshot.source: "manual"`) plus `grow_id` and optional
  `photo_url`
- `p_idempotency_key` from `newQuickLogSaveKey()`: mint on sheet open,
  reuse on retry, refresh after success / close
- No `p_photo_url` (that argument does not exist on the deployed RPC)
- No `user_id` in the payload — `auth.uid()` stays server-derived

Photo storage upload to `diary-photos` stays in the presenter. After a
successful RPC that returned `grow_event_id`, the presenter may
`UPDATE diary_entries.photo_url` on the companion whose
`details.linked_grow_event_id` matches. That is not a second insert path.
The RPC does not set the `photo_url` column (`established fact`: payload
type in `src/lib/quickLogV2SavePayload.ts` has no photo column; Timeline
reads the column, `practical observation` from
`src/lib/quickLogDiaryCompanionRules.ts`).

---

## 4. Env-check → alert remeasure (do not change alerts)

`legacyQuickLogUnifiedSave.ts` still documents that env-check air metrics
ride `p_temperature_c` / `p_humidity_pct` / `p_vpd_kpa` and that
`quicklog_save_manual` writes `environment_events`, while alert evaluation
reads `sensor_readings` then diary `details.sensor_snapshot`
(`established fact`: file header in `src/lib/legacyQuickLogUnifiedSave.ts`;
`src/lib/environmentAlerts.ts` source tag `sensor_snapshot`).

`snapshotFromEnvironmentCheck` exists as a **read** adapter from a diary
env-check blob (`established fact`: `src/lib/sensorSnapshot.ts`). It is
not a write into `sensor_readings`.

**Decision for this slice:** document the gap; leave alert persistence
alone. Closing env-check → alert is a later named slice.

---

## 5. Out of scope

- RPC allow-list expansion (`photo`, `feed`, pH/EC first-class params)
- Public `/quick-log` becoming a signed-in persist path
- Second FAB on plant/tent (keep `mobile-quick-log-single-fab`)
- Alert auto-persist redesign
- Schema / RLS / published migrations
- Auto-created Action Queue items

---

## 6. Validation

```text
bunx vitest run src/test/plant-quick-log-v2-save-adapter.test.ts src/test/plant-quick-log.test.ts src/test/plant-quick-log-static-safety.test.ts src/test/plant-quick-log-photo-source-picker.integration.test.tsx src/test/funnel-events-wiring.test.ts src/test/quick-log-v2-save-payload.test.ts
```

No schema change. Safety: source label stays `manual`; no live fabrication;
no Action Queue / alert writes from this sheet.
