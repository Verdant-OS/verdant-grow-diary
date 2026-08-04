# Phase A — Freshness alignment checklist

**Program:** Bridge Sensor Trust Chain  
**Phase:** A — Current-state freshness (Sensor Truth Canon)  
**Goal:** Grower-facing “current / live / stale” matches
[`docs/data-labeling-spec.md`](./data-labeling-spec.md) and
[`docs/sensor-truth-rules.md`](./sensor-truth-rules.md)
(**live 15m / manual 24h**), without weakening ingest write safety or inventing
live labels.

**Non-goals (later phases):** EC tiers / realism bands / live membership residual
([#692](https://github.com/Verdant-OS/verdant-grow-diary/pull/692)); Biome; SEO;
device control; Action Queue / AI side effects from sensor ingest.

**Authority:** Product base = `verdant-grow-diary`. Prefer landing as a **focused
PR** (may absorb the clean product core of
[#691](https://github.com/Verdant-OS/verdant-grow-diary/pull/691) after rebase —
do **not** merge stack-chore / #690 / SSR probe noise).

**Related:**

- Bridge audit checklist §**7 — Freshness and sensor-truth gating** in
  [`bridge-sensor-ingest-security-audit-checklist.md`](./bridge-sensor-ingest-security-audit-checklist.md)
  (on base since #707, `45a3f831a`). Its evidence check **E25** pins
  `LIVE_INGEST_FRESHNESS_WINDOW_MS` at 30m — §4.1 below is the same decision
  from the write side, and Phase A2 must update that evidence lane + audit
  checklist in the same PR or the `Security regression` gate fails. Gap
  **G5** there records the dual-authority this phase closes on the display
  side.
- General security gate: [`security-checklist.md`](./security-checklist.md)
- Timing home: `src/constants/sensorTiming.ts`
- Target canon module: `src/lib/sensorTruthCanon.ts` (not on base until Phase A lands)

**Stack note:** “#690 lands first” is **void**. Close/ignore superseded stack
prerequisites. [#703](https://github.com/Verdant-OS/verdant-grow-diary/pull/703)
must never target product base.

---

## 0. Preflight (fail closed)

| #   | Check                              | Pass criteria                                                                               |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------- |
| 0.1 | Branch from current base           | `git fetch && git checkout -B … origin/verdant-grow-diary`                                  |
| 0.2 | Spec frozen                        | Spec still states live **15m** / manual current-context **24h**                             |
| 0.3 | No merge of #703 into product base | Maintenance-only                                                                            |
| 0.4 | #690-first void                    | No SSR / vitest plugin stack prerequisites required                                         |
| 0.5 | Domain sign-off                    | Product accepts **manual 6h → 24h** and **dashboard/AI 30m → 15m** as intentional UX change |

**Stop if 0.5 is no** — document an exception; do not half-ship canon copy that
lies about windows.

- [ ] 0.1
- [ ] 0.2
- [ ] 0.3
- [ ] 0.4
- [x] 0.5 (owner / product) — signed off by Cheek 2026-08-04: issued this
      checklist with the 15m/24h goal line and §2 value table, then merged
      it via #709. The A1 implementer cites this line instead of
      re-litigating the windows.

---

## 1. Canon module (must land together with timing)

| #   | Check                             | Pass criteria                                                                                                              |
| --- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | Add `src/lib/sensorTruthCanon.ts` | Pure; no I/O; no React; injectable `now`                                                                                   |
| 1.2 | API surface                       | `classifyCurrentStateSource`, `resolveCurrentStateStaleWindowMs`, `isCurrentStateStale`, `describeCurrentStateStaleWindow` |
| 1.3 | Live window                       | **15 × 60 × 1000** ms for live + live transport aliases                                                                    |
| 1.4 | Manual window                     | **24 × 60 × 60 × 1000** ms for manual / diary / quick_log aliases                                                          |
| 1.5 | Strict default                    | csv / demo / sim / invalid / unverified / unknown / missing source → **live (short) window**, never long manual linger     |
| 1.6 | No unknown→live upgrade           | Classification never promotes vendor garbage to live                                                                       |
| 1.7 | Timestamp rules                   | null/NaN → not “stale by age” (invalid handled elsewhere); future not stale by age alone                                   |
| 1.8 | Unit tests                        | `src/test/sensor-truth-canon.test.ts` covers live/manual/strict-default/alias/future/missing                               |

**Remediate if copy/logic skew:** `LIVE_*_MS` and `LIVE_*_MINUTES` must both
describe the **same** live window (do not leave MS=30m while label says 15).

- [ ] 1.1–1.8 complete

### Intended decision flow

```text
captured_at + source
        │
        ▼
classifyCurrentStateSource(source)
        │
        ├─ manual | diary ──► 24h window
        └─ live aliases | csv | demo | unknown | … ──► 15m live window
        │
        ▼
now - captured_at > window ?
        │
        ├─ yes → current-state STALE (do not label healthy/live)
        └─ no  → within current-state window
```

Consumers with provenance should call
`isCurrentStateStale(capturedAt, { now, source })` rather than bare
`isStale(ts)` when a source label is available.

---

## 2. `sensorTiming.ts` value table (single source of numbers)

| #    | Constant                                   | Phase A target                                                                          | Notes                                              |
| ---- | ------------------------------------------ | --------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 2.1  | `SENSOR_SNAPSHOT_STALE_THRESHOLD_MS`       | **15m**                                                                                 | Feeds `sensorSnapshot.isStale` default             |
| 2.2  | `SENSOR_READING_NORMALIZATION_STALE_MS`    | **15m**                                                                                 | Live demotion on normalize                         |
| 2.3  | `SENSOR_SOURCE_STALE_MINUTES`              | **15**                                                                                  | Source-health “active”                             |
| 2.4  | `DEFAULT_AI_COACH_STALE_THRESHOLD_MS`      | **15m**                                                                                 | Prefer source-aware override where source known    |
| 2.5  | `DEFAULT_AI_SENSOR_STALE_THRESHOLD_MS`     | **15m**                                                                                 | Same                                               |
| 2.6  | `GROW_ROOM_MODE_STALE_MINUTES`             | **15**                                                                                  | Display default                                    |
| 2.7  | `MANUAL_SNAPSHOT_CURRENT_STALE_HOURS`      | **24**                                                                                  | Manual current-context                             |
| 2.8  | `DEFAULT_SENSOR_STALE_MS` (AI sufficiency) | **24h**                                                                                 | Align with manual current-context                  |
| 2.9  | EcoWitt / testbench / label 15m constants  | unchanged                                                                               | Already on-spec                                    |
| 2.10 | Header comments                            | Rewrite: no “preserve divergence” for grower current-state; point to `sensorTruthCanon` |                                                    |
| 2.11 | Edge mirror of timing                      | After change: `bun run sync-edge-shared && bun run verify-edge-shared-in-sync`          | `_shared/lib/constants/sensorTiming.ts` must match |

**Do not** change in Phase A without explicit decision:

| Constant / surface                             | Default stay                                          | Why                                         |
| ---------------------------------------------- | ----------------------------------------------------- | ------------------------------------------- |
| Soil badge window (60m)                        | keep                                                  | Metric-kind, not current-state source split |
| `ECOWITT_CHANNEL_LABELING_STALE_AFTER_MS` (1h) | keep                                                  | Labeling, not dashboard “live”              |
| `LIVE_INGEST_FRESHNESS_WINDOW_MS` (**30m**)    | **keep 30m** unless product wants write policy change | Ingest accept ≠ UI current-state            |
| Recovery nudge 72h                             | keep                                                  | Non-current-state                           |

- [ ] 2.1–2.11 complete
- [ ] Explicit non-goals left unchanged (or exception filed)

---

## 3. Call-site migration

### 3.A Prefer `isCurrentStateStale(ts, { now, source })` when provenance is available

| #   | Surface                          | File(s)                                                                         | Action                                          |
| --- | -------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------- |
| 3.1 | Alert freshness                  | `src/lib/alertFreshnessContext.ts`                                              | Pass snapshot source into stale checks          |
| 3.2 | Environment alerts / persistence | `environmentAlerts.ts`, `environmentAlertPersistence.ts`                        | Source-aware                                    |
| 3.3 | Dashboard env / health VMs       | `dashboardEnvironmentSnapshotViewModel.ts`, `dashboardSensorHealthViewModel.ts` | Source-aware                                    |
| 3.4 | Plant tent environment           | `plantTentEnvironmentRules.ts`                                                  | Source-aware                                    |
| 3.5 | AI Coach / Doctor context        | `aiCoachSensorSnapshotContext.ts`, `aiSensorSnapshotContextRules.ts`            | Default 15m + source override via canon         |
| 3.6 | Grow room mode                   | `growRoomModeRules.ts`                                                          | Source-aware when source known                  |
| 3.7 | Manual snapshot quality          | `manualSensorSnapshotQualityRules.ts`                                           | Must use **24h** constant / canon manual window |
| 3.8 | Recent snapshot history          | `recentSensorSnapshotHistoryRules.ts`                                           | Source-aware if source on row                   |

- [ ] 3.1–3.8 complete

### 3.B Flat `isStale(ts)` after default becomes 15m

| #    | Surface                                                 | Action                                                        |
| ---- | ------------------------------------------------------- | ------------------------------------------------------------- |
| 3.9  | `sensorSnapshot.isStale`                                | Keep API; default threshold follows 2.1 (**15m**)             |
| 3.10 | `useLatestSensorSnapshot`                               | OK on flat default after 2.1; pass source if easily available |
| 3.11 | `Dashboard.tsx` direct `isStale`                        | Prefer source when snapshot has it                            |
| 3.12 | `sensorQuality`, `defaultEnvironmentThresholds`, charts | Re-test after default 15m                                     |

- [ ] 3.9–3.12 complete

### 3.C Kill local 30m literals (current-state paths)

| #    | File                                             | Today                                                                                               | Phase A                                                                                      |
| ---- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 3.13 | `src/lib/sensor/sensorSnapshotFreshnessRules.ts` | `DEFAULT_FRESH_MS = 30m`                                                                            | Import timing / canon live window (**15m**) or inject source-aware                           |
| 3.14 | `src/lib/guidedActionChecklistRules.ts`          | `SENSOR_FRESHNESS_MS = 30m`                                                                         | Align to live current-state 15m or canon                                                     |
| 3.15 | Timeline surfaces                                | local 30m in `Timeline.tsx`, `timelineEvidenceDetailViewModel.ts`, `timelineEvidenceFilterRules.ts` | Align **or** document as timeline-history policy (if not current-state, comment + exception) |
| 3.16 | Tests hardcoding 30m                             | e.g. `csv-sensor-readings-read-path.test.ts` expecting `STALE_THRESHOLD_MS === 30m`                 | Update to **15m** + cases for manual 24h                                                     |

- [ ] 3.13–3.16 complete

---

## 4. Explicit non-alignment (document, don’t “fix” silently)

| #   | Surface                                        | Policy in Phase A                                  |
| --- | ---------------------------------------------- | -------------------------------------------------- |
| 4.1 | `LIVE_INGEST_FRESHNESS_WINDOW_MS` (edge write) | **Remain 30m** unless separate decision record     |
| 4.2 | Bridge webhook stale → `accepted: false`       | Unchanged contract; still non-write                |
| 4.3 | Pi ingest recent window                        | Out of Phase A unless same product owner signs off |
| 4.4 | Metric badge soil 60m                          | Unchanged                                          |
| 4.5 | #692 residuals                                 | Out of Phase A                                     |

Record in the implementing PR body:

```text
INGEST_WRITE_WINDOW_MS=30m (unchanged)
UI_LIVE_CURRENT_STATE_MS=15m
UI_MANUAL_CURRENT_STATE_MS=24h
```

- [ ] 4.1–4.5 acknowledged in PR body

---

## 5. Edge / mirror / MCP

| #   | Check                                               | Pass criteria                                       |
| --- | --------------------------------------------------- | --------------------------------------------------- |
| 5.1 | No hand-edit of generated mirror as source of truth | Edit `src/`, then sync                              |
| 5.2 | `bun run sync-edge-shared`                          | Clean                                               |
| 5.3 | `bun run verify-edge-shared-in-sync`                | Clean                                               |
| 5.4 | MCP / shared consumers                              | Import relative paths per existing edge graph rules |
| 5.5 | Do not land `stack-reconcile-691-692.yml`           | Delete if carried from #691                         |

- [ ] 5.1–5.5 complete

---

## 6. Tests (minimum for Phase A green)

| #    | Suite / assertion                                          | Required                   |
| ---- | ---------------------------------------------------------- | -------------------------- |
| 6.1  | `sensor-truth-canon.test.ts`                               | New / clean core from #691 |
| 6.2  | Live 14m59 → not stale; 15m01 → stale                      | Yes                        |
| 6.3  | Manual 23h → not stale; 24h01 → stale                      | Yes                        |
| 6.4  | csv/demo/unknown at 16m → stale (strict live window)       | Yes                        |
| 6.5  | Alert / dashboard env tests updated for 15m                | Yes                        |
| 6.6  | Manual snapshot quality tests expect 24h                   | Yes                        |
| 6.7  | AI context tests: defaults 15m; sufficiency 24h if touched | Yes                        |
| 6.8  | No test asserts current-state `STALE_THRESHOLD_MS === 30m` | Yes                        |
| 6.9  | `tsc --noEmit` clean                                       | Yes                        |
| 6.10 | Targeted vitest list in PR description with exact results  | Yes                        |

Suggested local commands (adjust paths as files land):

```bash
bunx tsc -p tsconfig.json --noEmit
bunx vitest run src/test/sensor-truth-canon.test.ts \
  src/test/sensor-truth-rules.test.ts \
  src/test/alert-freshness-context.test.ts \
  src/test/dashboard-environment-snapshot-per-metric.test.ts
bun run sync-edge-shared
bun run verify-edge-shared-in-sync
```

- [ ] 6.1–6.10 complete with evidence attached

---

## 7. Safety / trust gates (must not regress)

| #   | Check                                               | Pass criteria                                           |
| --- | --------------------------------------------------- | ------------------------------------------------------- |
| 7.1 | Demo never becomes live because of window change    | Existing demo guards still pass                         |
| 7.2 | Invalid / missing timestamp never “healthy”         | Badge + quality resolvers unchanged or stricter         |
| 7.3 | No inventing metrics / zeros                        | Quick Log / snapshot adapters untouched unless required |
| 7.4 | Ingest still bridge-token only                      | No JWT promotion                                        |
| 7.5 | Ingest still no AQ / AI / device side effects       | Side-effect ban intact                                  |
| 7.6 | Stale live rows not shown as green “Live” after 15m | UI + unit coverage                                      |
| 7.7 | Client secret boundary still clean                  | `bun run test:client-secret-boundary` if client touched |

- [ ] 7.1–7.7 complete

---

## 8. PR packaging (Phase A implementation only)

| #   | Item            | Content                                                                                                                                                 |
| --- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8.1 | Branch          | e.g. `claude/phase-a-sensor-truth-freshness-canon`                                                                                                      |
| 8.2 | Title           | `fix(sensor-truth): align current-state freshness to live 15m / manual 24h`                                                                             |
| 8.3 | Body sections   | Motivation · value table before/after · call sites · explicit non-goals · test commands · edge sync                                                     |
| 8.4 | Size discipline | Canon + timing + consumers + tests + mirror; **no** Biome, **no** SSR probe rewrites, **no** #692 ranges                                                |
| 8.5 | Base            | `verdant-grow-diary` only                                                                                                                               |
| 8.6 | Checklist paste | This document §0–7 completed in the PR                                                                                                                  |
| 8.7 | Bridge evidence | If bridge audit checklist not yet on base, either land docs/CI first **or** note pending without claiming `BRIDGE SECURITY AUDIT: PASS` for ingest-only |

**Suggested program split:**

| PR     | Scope                                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------------------- |
| **A0** | ✅ **DONE** — Bridge audit checklist + automated evidence CI (#707, merged `45a3f831a`; detector hardening in #708) |
| **A1** | This freshness checklist (canon + timing + consumers) — **implementation**                                          |
| **A2** | Optional: ingest write window 30→15 (only with product decision)                                                    |

This document is the **checklist**; shipping it alone is **docs-only** and does not complete A1.

- [ ] Implementing PR follows §8

---

## 9. Sign-off language

Use one line in the implementing PR:

```text
PHASE_A_FRESHNESS: PASS
PHASE_A_FRESHNESS: FAIL — <section id>
PHASE_A_FRESHNESS: BLOCKED — domain decision 0.5 / evidence unavailable
```

**PASS only if:**

1. Canon + timing values match spec (15m / 24h) with no copy/logic skew
2. Source-aware paths used where source exists for critical surfaces (§3.A)
3. Local 30m current-state literals removed or exception-filed (§3.C / §4)
4. Edge mirror in sync
5. Tests in §6 green with output attached
6. Ingest write window policy explicit (§4.1)

---

## 10. Ordered execution (implementation owner)

```text
1. Preflight §0 (domain sign-off on 6h→24h and 30m→15m)
2. Land timing table §2 + canon module §1 in one commit series
3. Migrate §3.A call sites; fix §3.C literals
4. Update tests §6
5. bun run sync-edge-shared && verify
6. tsc + targeted vitest
7. Open PR with §8 packaging + PHASE_A_FRESHNESS line
8. Do not merge without merge permission — hand to maintainer
```

### One-line agent brief

```text
Phase A freshness: add sensorTruthCanon (live 15m / manual 24h / strict default);
rewrite sensorTiming grower current-state constants to match; migrate isStale call
sites to isCurrentStateStale when source known; kill local 30m current-state
literals; keep LIVE_INGEST 30m unless product says otherwise; sync-edge-shared;
no #692 residuals, no stack-reconcile, no SSR probe noise.
```

---

## 11. Base vs #691 reference (for rebase owners)

| Artifact                              | Product base (pre–Phase A) | #691 intent                      |
| ------------------------------------- | -------------------------- | -------------------------------- |
| `src/lib/sensorTruthCanon.ts`         | Absent                     | Present — source-aware 15m / 24h |
| `SENSOR_SNAPSHOT_STALE_THRESHOLD_MS`  | 30m                        | 15m                              |
| `MANUAL_SNAPSHOT_CURRENT_STALE_HOURS` | 6h                         | 24h                              |
| Spec docs                             | Already 15m / 24h          | Code matches docs                |
| `LIVE_INGEST_FRESHNESS_WINDOW_MS`     | 30m                        | Leave 30m unless A2              |

When rebasing #691 onto current base: keep product freshness commits; **drop**
stack-chore, `stack-reconcile-691-692.yml`, SSR path reintroductions, and
vitest plugin carries already owned by base.

---

## Document control

| Field                           | Value                                                                |
| ------------------------------- | -------------------------------------------------------------------- |
| Status                          | Checklist / routing — does **not** certify implementation on any SHA |
| Role                            | Bridge Sensor Trust Chain Architect and Implementation Owner         |
| Merge from this doc-only change | Optional docs PR; does not complete Phase A implementation           |
