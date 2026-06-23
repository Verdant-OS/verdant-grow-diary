# Verdant V0 Operating Loop Protected Build

**Release name:** Verdant V0 Operating Loop Protected Build
**Test count at checkpoint:** 3318/3318 passing

This document is the baseline for the current protected Verdant build. It
exists so future work has an unambiguous reference for what shipped, what
intentionally did not, and what cannot regress.

---

## 1. What the V0 loop supports

The V0 Operating Loop is the protected product spine:

1. Manual / real sensor reading entered by the grower
2. Dashboard latest environment snapshot
3. Derived environment alert (target comparison only)
4. Persisted alert + alert event (RLS-scoped, user-owned)
5. Alert Detail view with full context
6. **User-initiated** handoff into Action Queue (no automation)
7. Action Queue provenance (`[alert:<id>]` back-pointer, `environment_alert` source)
8. Action Detail backlink to the source alert
9. Stale-warning behavior on both Alert Detail and Action Detail when the
   source alert is closed but the suggested action is still pending

Coach → Action Queue handoff (`ai_coach` source) also remains supported as
an approval-required path.

---

## 2. What is intentionally NOT included yet

- No automation of any kind
- No device / equipment control
- No MQTT, Home Assistant, Pi bridge, relay, actuator, or webhook execution
- No fake "live" sensor data — manual + real ingest only
- No PPFD / soil EC / reservoir schema expansion
- No typed watering writes wired into the V0 loop
- No grow-room mode
- No AI Doctor context upgrade beyond current Coach context surface
- No automatic action creation, cancel, approve, or reject

---

## 3. Safety guarantees

- **No automation.** Nothing in the loop runs without an explicit grower click.
- **No device control.** No code path executes equipment changes.
- **Approval-required Action Queue.** Every action enters `pending_approval`
  with `action_type: "advisory"` and no executable command surface
  (`target_device`, `command`, `payload`, `device_command` are not on the draft).
- **No fake live sensor data.** Only `manual` / real-source snapshots that
  pass `isSnapshotPersistable` become persisted alerts.
- **Stale-warning behavior.** If a source alert becomes `resolved` or
  `dismissed` while a derived action is still `pending_approval`, both
  Alert Detail and Action Detail render a read-only warning before the
  grower can approve stale advice.
- **No `service_role` usage** anywhere in the client.
- **RLS-scoped writes only.** DB defaults (`auth.uid()`) own ownership; the
  client never sets `user_id` on inserts.

---

## 4. Demo script

See [`docs/v0-operating-loop-demo.md`](./v0-operating-loop-demo.md) for the
end-to-end demo flow, partner framing, and the V0 contract test reference.

---

## 5. CI / PR guardrail summary

- **CI workflow:** [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
  runs on every PR and every push to `main`: lint → typecheck → V0 contract
  test (explicit step) → full `bunx vitest run` → build.
- **PR template:** [`.github/pull_request_template.md`](../.github/pull_request_template.md)
  contains a "V0 Operating Loop impact" section with checkboxes for each
  protected touch-point (sensor readings, Dashboard, env alerts, alert
  persistence, AlertDetail, ActionQueue, ActionDetail, transitions, AI Coach
  handoff).
- **Static guardrails:** [`src/test/v0-operating-loop-ci-guardrails.test.ts`](../src/test/v0-operating-loop-ci-guardrails.test.ts)
  asserts the PR template, CI workflow, and demo doc stay aligned and that
  the workflow does not introduce automation / device-control surface.

---

## 6. Partner demo positioning

> Your hardware collects the data. Verdant turns it into plant memory, alert context, and approval-required decisions.

---

## 7. Recommended next build phase

In priority order:

1. **Grow-room mode** — multi-tent operator view built on the existing
   approval-required spine.
2. **Sensor ingestion adapter** — real ingest path (CSV import / API /
   Pi-bridge adapter) feeding the same `isSnapshotPersistable` gate.
3. **AI Doctor context upgrade** — richer grounded context for the Coach,
   still surfaced as approval-required advisory actions.
4. **Schema expansion for PPFD / soil EC / reservoir data** — extend the
   snapshot + alert pipeline once ingestion is real.

None of these may bypass the V0 contract.

---

## 8. Stop-ship rule

> Any change that breaks
> [`src/test/v0-operating-loop-contract.test.ts`](../src/test/v0-operating-loop-contract.test.ts)
> cannot ship.

The contract test is wired as an explicit step in CI ahead of the full
suite. A failing contract test is a stop-ship event regardless of how green
the rest of the build looks.

---

## 9. Checkpoint — 2026-06-23 (post PPFD env-context + harness cleanup)

Stable green baseline after the read-only PPFD/environment context chart
landed and validation harness noise was eliminated.

### 9.1 Product changes landed

- **Read-only PPFD and environment context chart**
  - `src/components/ManualSensorTrendChart.tsx` — accessible semantic
    `<table>` presenter. No chart library, no writes, no AI calls, no
    automation.
  - `src/lib/manualSensorTrendChartViewModel.ts` — pure view-model.
    Reads `sensor_readings` (`ppfd`, `temperature_c`, `humidity_pct`,
    `vpd_kpa`), normalizes units, sorts chronologically, and flags
    `stale` / `invalid` / `demo` sources as untrusted context (never
    rendered as healthy).
  - Wired into `src/pages/Sensors.tsx` beneath the manual reading card
    via the existing `useSensorReadings(defaultManualTentId, 60)` hook.
    No new fetch path, no new RLS surface.
- **Manual sensor PPFD harness cleanup**
  - `src/test/manual-sensor-ppfd-entry.test.tsx` now wraps
    `ManualSensorReadingCard` in `<MemoryRouter>` so the in-card `<Link>`
    has a Router ancestor. Eliminates the unhandled router `TypeError`.
    21/21 pass, 0 unhandled errors.
- **Validation scanner / harness cleanup**
  - `src/test/paddle-subscription-update-harness-static.test.ts` — RPC
    exclusion regex tightened so the intentional
    `apply_paddle_subscription_update_with_audit` wrapper is not
    flagged as a legacy call.
  - `src/test/premium-live-sensor-gate-hardening.test.tsx` — adopted
    the shared scanner guardrail harness (`installScannerGuardrail`
    + `getCachedTsFiles`). 30s per-file timeout and cached repo walk
    eliminate the shard-load timeout false-red. Allowlist and
    forbidden-reference assertions unchanged.

Collapsible diary/timeline category sections were not part of this
checkpoint window — not landed in this tree.

### 9.2 Safety posture

- No schema changes.
- No RLS changes.
- No Edge Function behavior changes.
- No AI / model-call changes.
- No Action Queue write changes.
- No automation or device-control changes.
- No fake live data. `stale` / `invalid` / `demo` rows remain
  explicitly flagged in the trend view-model.

### 9.3 Validation status

- `npx tsc -p tsconfig.app.json --noEmit` — clean.
- Premium live sensor gate + server gate focused run —
  **2 files, 43/43 pass**, 0 failures, 0 unhandled errors.
- Manual sensor PPFD focused run — **21/21 pass**.
- Paddle subscription update harness static — green alongside
  `paddle-subscription-update-rpc-static` and `entitlements-rls`
  guards.
- Shard 4 script stabilized: now runs with
  `NODE_OPTIONS=--max-old-space-size=6144` and
  `--pool=forks --poolOptions.forks.singleFork=true` to eliminate
  the mark-compact OOM and tinypool teardown noise.

Known harness caveats:

- `daily-check-method-context.test.tsx` remains a documented
  parallel-load flake (see `docs/testing/known-vitest-flakes.md`).
  Re-run in isolation before treating any timeout there as a real
  regression.
- jsdom `HTMLCanvasElement.getContext` warnings from axe-core in
  `auth-axe.test.tsx` are pre-existing and non-failing.

### 9.4 Files changed since the previous checkpoint

**Product UI**

- `src/components/ManualSensorTrendChart.tsx` (new)
- `src/pages/Sensors.tsx` (wiring only)

**Pure view-model / rules**

- `src/lib/manualSensorTrendChartViewModel.ts` (new)

**Tests**

- `src/test/ManualSensorTrendChart.test.tsx` (new)
- `src/test/manualSensorTrendChartViewModel.test.ts` (new)
- `src/test/manual-sensor-ppfd-entry.test.tsx` (Router wrapper)
- `src/test/paddle-subscription-update-harness-static.test.ts`
  (tightened RPC exclusion regex)
- `src/test/premium-live-sensor-gate-hardening.test.tsx`
  (adopted scanner guardrail harness)

**Harness / package scripts**

- `package.json` — `test:full:shard4` script updated for heap +
  fork pool. Shards 1–3 untouched.

### 9.5 Rollback groups

- **PPFD chart rollback** — delete
  `src/components/ManualSensorTrendChart.tsx`,
  `src/lib/manualSensorTrendChartViewModel.ts`, and the two new
  tests; remove the chart mount + `useSensorReadings` line in
  `src/pages/Sensors.tsx`.
- **Scanner harness rollback** — in
  `src/test/premium-live-sensor-gate-hardening.test.tsx`, drop the
  `installScannerGuardrail` import + call and restore the local
  `walkSrc` + `fs`/`path` imports; revert the paddle harness regex
  to the previous broad exclusion; remove the `<MemoryRouter>`
  wrapper from `manual-sensor-ppfd-entry.test.tsx`.
- **Shard 4 package-script rollback** — restore
  `"test:full:shard4": "vitest run --reporter=dot --shard=4/4"` in
  `package.json`.

### 9.6 Recommended next product slice

Small read-only timeline polish only. Suggested candidates:

- Light visual grouping or sticky day headers on the existing
  diary/timeline feed.
- A read-only "context" chip on PPFD timeline rows that links to
  the new trend view.

Explicitly out of scope:

- No Fast Add presets.
- No Quick Log write-flow expansion.
- No new alerts, Action Queue writes, AI calls, automation, or
  device control.


## 10. Checkpoint — Validation harness stabilization (scanner timeouts)

Docs-only checkpoint following the harness-only slice that quieted
the remaining sharded validation noise.

### 10.1 What changed

Installed the shared `installScannerGuardrail` (30s per-file
timeout + slow-test telemetry, via
`src/test/support/scannerGuardrailHarness.ts`) on the remaining
filesystem-walking scanner files that were flaking on the default
5s Vitest timeout under sharded load:

- `src/test/pi-ingest-readings-contract-doc.test.ts`
- `src/test/live-sensor-server-gate.test.ts`
- `src/test/quicklog-e2e-harness-safety.test.ts`
- `src/test/manual-sensor-fahrenheit-and-refresh.test.ts`

No walker rewrites, no allowlist changes, no regex changes, no
`it.skip`, no scanner assertions weakened.

### 10.2 Validation

- Focused scanner files: **5 files / 90 tests passed**
  (`pi-ingest-readings-contract-doc`, `manual-sensor-fahrenheit-and-refresh`,
  `live-sensor-server-gate`, `quicklog-e2e-harness-safety`,
  `premium-live-sensor-gate-hardening`).
- Scanner guardrail harness self-tests: **12/12 passed**.
- TypeScript: `tsc -p tsconfig.app.json --noEmit` clean.

### 10.3 Confirmed invariants

- No product code changed.
- Scanner assertions were not weakened (regexes, allowlists, and
  `it` bodies unchanged).
- Fast Add presets remain intentionally out of scope.
- No schema, RLS, Edge Function, auth, billing, AI, Action Queue,
  sensor ingest, or device-control surface touched.

### 10.4 Rollback

Revert the `installScannerGuardrail` import + call insertion in the
four files above; behavior reverts to the prior 5s default timeout.

### 10.5 Recommended next branch — `timeline-evidence-quality-pass`

Read-only only. Improve missing-context indicators inside the
existing timeline / category sections (e.g. surface "no sensor
snapshot at log time", "photo missing", or "stage unknown" as
inline evidence-quality chips on existing rows).

Explicitly out of scope for that branch:

- No new writes.
- No schema / RLS / Edge Function / auth changes.
- No AI calls.
- No Action Queue writes.
- No automation or device control.

## 11. Checkpoint — Timeline Evidence Quality Pass

Docs-only checkpoint following the `timeline-evidence-quality-pass`
branch.

### 11.1 Product changes landed

Plant timeline Category view now ships with:

- Seven fixed read-only category sections (Watering, Feeding,
  Training, Photos, Diagnoses, Harvest results, Other diary entries).
- Saved expand/collapse state via a namespaced+versioned
  localStorage key (`verdant:plant-relative-timeline:category-sections:v1`).
  Only `DiaryTimelineSectionId → boolean` is persisted.
- Expand all / Collapse all / Reset sections controls.
- Per-section evidence-quality indicator
  (`present` / `missing`, with `limited` reserved for future use):
  - "Watering evidence present in this view." / "No watering entries in this view."
  - Same pattern for every other section.
- Overall evidence summary line, e.g.
  "3 of 7 sections have evidence in this view."

### 11.2 Safety posture

- Read-only UX only. No new writes.
- No schema, RLS, Edge Function, RPC, auth, or Supabase query changes.
- No Supabase mutations.
- No AI / model / provider calls.
- No alerts created.
- No Action Queue writes.
- No automation or device control.
- No Fast Add presets.
- No localStorage entry data, raw payloads, tokens, MACs, or bridge
  IDs — only section ID booleans for UI expansion state.
- Missing evidence framed as a context limitation, never as a
  health problem; no diagnostic / aggressive / actionable wording
  (`healthy`, `ideal`, `fix`, `urgent`, `auto`, `execute`, `control`,
  `actuate`, `relay`, `emergency`, `critical` are all banned and
  asserted by tests).

### 11.3 Validation

- Targeted evidence-quality tests
  (`diaryTimelineEvidenceQualityRules`,
  `DiaryTimelineCategorySections`,
  `diaryTimelineSectionRules`,
  `diaryTimelineSectionStateRules`):
  **4 files / 82 tests passed**.
- Nearby timeline guards
  (`relative-timeline-projection`, `timeline`,
  `plant-tent-movement-display`,
  `plant-tent-detail-data-source-disclosure`):
  **114 files / 1420 tests passed**.
- TypeScript: `tsc -p tsconfig.app.json --noEmit` clean.

### 11.4 Rollback

- Delete `src/lib/diaryTimelineEvidenceQualityRules.ts` and
  `src/test/diaryTimelineEvidenceQualityRules.test.ts`.
- In `src/components/DiaryTimelineCategorySections.tsx`: remove the
  evidence-quality import, the `evidenceSummary` `useMemo`, the
  `data-testid="…-evidence-summary"` block, the
  `evidence = buildDiaryTimelineEvidenceQualityForSection(section)`
  line, the `data-evidence-status` attribute on the section wrapper,
  and the `data-testid="…-section-evidence"` block inside the panel.
- In `src/test/DiaryTimelineCategorySections.test.tsx`: remove the
  appended `describe("DiaryTimelineCategorySections —
  evidence-quality indicators", …)` block.

### 11.5 Recommended next branch — `timeline-readability-pass`

Read-only only. Candidates:

- Sticky day headers on the existing diary/timeline feed.
- Visible entry-count badge in the timeline section header.
- Print-friendly timeline summary view.

Explicitly out of scope for that branch:

- No Quick Log write-flow expansion.
- No new writes.
- No schema / RLS / Edge Function / auth changes.
- No AI calls.
- No Action Queue writes.
- No automation or device control.
- No Fast Add presets.
