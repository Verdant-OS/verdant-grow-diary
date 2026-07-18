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

---

## 13. EcoWitt Live Proof Gate (foundation + operator wiring)

### 13.1 Product changes

- `EcowittLiveProofPanel` implemented as a read-only presenter.
- Pure rules (`src/lib/ecowittLiveProofRules.ts`) and view model
  (`src/lib/ecowittLiveProofViewModel.ts`) implemented.
- Panel mounted in `src/pages/Sensors.tsx` inside the existing operator
  diagnostics section, gated by `?operator=1`.
- Wiring uses the already-loaded `trendReadings` from
  `useSensorReadings(defaultManualTentId, 60)` — no new Supabase query
  was added.
- `sensor_ingest_audit_log` is **not** queried by this surface.

### 13.2 Proof contract

- Classifies the currently loaded sensor rows into:
  `live_confirmed | stale | invalid | limited | unknown | not_ecowitt`
  (plus a calm "no recent EcoWitt readings" empty state).
- Uses the canonical `STALE_THRESHOLD_MS` from
  `src/lib/sensorReadingNormalizationRules.ts` (no duplicated threshold).
- Reuses existing sensor-truth validators: `validateHumidity`,
  `validatePh`, `validateTempC`, `validateEcWithUnit`, and the optional
  metric bounds from `src/lib/sensorMetricStateRules.ts`.
- Source/provider contract:
  - canonical `source === "live"` **with** EcoWitt vendor lineage
    (`raw_payload.vendor` / `metadata.transport_source` / etc.) →
    eligible for live confirmation.
  - legacy `source === "ecowitt"` → eligible for live confirmation;
    explicitly labeled "EcoWitt bridge source (legacy)" in copy.
  - `demo | manual | csv | stale | invalid` → never promoted to live.
- Invalid/suspicious readings (humidity stuck at 0/100, pH out of range,
  EC µS/mS mismatch, temp out of range, CO₂/PPFD/soil out of bounds,
  missing or future timestamps, stuck-at-bound soil moisture across 3+
  rows) → never promoted to live.

### 13.3 UI limitations shown in the view

- "Accepted/rejected ingest audit counts are not shown in this view." —
  prevents the panel from being mistaken for a complete ingest-audit proof.
- Global tent-mismatch proof is limited because only the current tent's
  rows are loaded on this surface.
- This is row-level live proof from currently loaded sensor rows, **not**
  a complete ingest-audit proof.

### 13.4 Safety posture

- Read-only operator diagnostics only.
- No schema / RLS / Edge Function / auth changes.
- No new queries added.
- No writes.
- No AI / model calls.
- No alerts.
- No Action Queue writes.
- No automation or device control.
- No fake live data.
- No raw payload values, bridge tokens, service-role keys, MACs, or
  private IDs exposed.

### 13.5 Validation

- EcoWitt proof targeted suite: **6 files / 108 passed**
  (`ecowittLiveProof`, `EcowittLiveProof`, `SensorsEcowittLiveProofWiring`,
  `sensorMetricStateRules`, `sensorReadingNormalizationRules`).
- TypeScript clean (`npx tsc -p tsconfig.app.json --noEmit`, exit 0).

### 13.6 Rollback

- Remove the EcoWitt panel wiring from `src/pages/Sensors.tsx`:
  delete the two new imports (`EcowittLiveProofPanel`, `EcowittProofRow`)
  and the `<div data-testid="sensors-ecowitt-live-proof-wiring">…</div>`
  block appended after `<SensorIngestAuditReport />` in the operator
  diagnostics section.
- If rolling back the full feature, also delete:
  - `src/lib/ecowittLiveProofRules.ts`
  - `src/lib/ecowittLiveProofViewModel.ts`
  - `src/components/EcowittLiveProofPanel.tsx`
  - `src/test/ecowittLiveProofRules.test.ts`
  - `src/test/ecowittLiveProofViewModel.test.ts`
  - `src/test/EcowittLiveProofPanel.test.tsx`
  - `src/test/ecowittLiveProof-static-safety.test.ts`
  - `src/test/SensorsEcowittLiveProofWiring.test.ts`

### 13.7 Recommended next branch

`ecowitt-ingest-audit-proof`

- Add RLS-safe, read-only ingest audit visibility **only if** the
  existing data model supports it (no schema / RLS / Edge / auth changes
  unless explicitly approved).
- Out of scope: writes, AI calls, alerts, Action Queue writes,
  automation, device control, raw payload exposure.

---

## 14. EcoWitt Ingest Audit Proof — read-only Operator Mode (completed)

Read-only branch that adds ingest-audit visibility to Operator Mode,
complementing the existing row-level live proof from
`sensor_readings`. No schema, RLS, Edge Function, RPC, or auth changes.

### 14.1 Product changes

- `EcowittLiveProofPanel` remains mounted in `src/pages/Sensors.tsx`
  inside the operator diagnostics section (gated by `?operator=1`).
  It continues to prove row-level
  `live_confirmed | stale | invalid | limited | no-recent` status from
  the already-loaded `trendReadings` (`useSensorReadings`).
- `EcowittIngestAuditProofPanel` added in the same operator diagnostics
  section, fed by a new read-only hook
  `useEcowittIngestAuditProofRows` that SELECTs from
  `sensor_ingest_audit_log` with a narrow column allowlist.
- The legacy disclaimer "Accepted/rejected ingest audit counts are not
  shown in this view." has been removed because RLS-safe audit proof is
  now available.

### 14.2 RLS / read-access verdict

- Existing policy `"Users view own ingest audit"` on
  `public.sensor_ingest_audit_log` allows `authenticated` to
  `SELECT` rows where `auth.uid() = user_id`. RLS-safe access
  confirmed; no policy or schema change was required.
- Narrow SELECT allowlist (the only columns read by the hook):
  `source, tent_id, rows_received, rows_inserted, captured_at,
  created_at`.
- Private fields `user_id` and `bridge_token_id` are **not** selected
  by the hook and **not** rendered by the panel. `raw_payload` and
  any secrets are not part of this table; nothing of the kind is
  surfaced.
- Permission errors collapse to status `"blocked"` so the UI renders
  "Audit proof unavailable with current read permissions." rather than
  leaking PostgREST/RLS detail or implying healthy state.

### 14.3 Audit proof contract

Scope (all enforced in pure rules):

- `source === "ecowitt"`
- current tent only (matches `defaultManualTentId`); if missing →
  unavailable state
- current proof window = **last 24 hours**

Counts and timestamps:

- `receivedCount = Σ rows_received`
- `insertedCount = Σ rows_inserted`
- `rejectedCount = Σ max(0, rows_received − rows_inserted)`
- `lastAcceptedAt = max(ts) where rows_inserted > 0`
- `lastRejectedAt = max(ts) where rows_received > rows_inserted`

Copy rules:

- Always uses "current proof window" / "last 24 hours".
- Never claims all-time, forever-live, or complete proof.
- UI states: `loading | loaded | no_audit_rows | unavailable |
  blocked | error`, each with calm allowlisted copy.

### 14.4 Safety posture

- Read-only Operator Mode diagnostics only.
- No new schema, RLS, Edge Function, RPC, or auth changes.
- No writes (`.insert/.update/.delete/.upsert` absent across the slice;
  enforced by static-safety tests).
- No AI / model calls.
- No alerts, Action Queue writes, automation, or device control.
- No fake live data; missing audit proof is never classified as
  healthy.
- No raw payload values, tokens, service role keys, bridge tokens,
  MACs, private IDs, or environment secrets exposed.

### 14.5 Validation

- EcoWitt audit proof targeted suite (`ecowittIngestAuditProof`,
  `EcowittIngestAuditProof`, `ecowittLiveProof`,
  `SensorsEcowittLiveProofWiring`): **77 / 77 passed**.
- Nearby sensor guards (`live-sensor-server-gate`,
  `premium-live-sensor-gate-hardening`,
  `manual-sensor-fahrenheit-and-refresh`,
  `sensorMetricStateRules`, `sensorReadingNormalizationRules`):
  **107 / 107 passed**.
- TypeScript (`tsgo -p tsconfig.app.json --noEmit`): **clean**.

### 14.6 Rollback

- Remove `EcowittIngestAuditProofPanel` mount and the
  `useEcowittIngestAuditProofRows` hook call + imports from
  `src/pages/Sensors.tsx`.
- (Optional) Restore the prior
  "Accepted/rejected ingest audit counts are not shown in this view."
  disclaimer.
- Delete `src/lib/ecowittIngestAuditProofRules.ts`,
  `src/hooks/useEcowittIngestAuditProofRows.ts`,
  `src/components/EcowittIngestAuditProofPanel.tsx`.
- Delete tests: `src/test/ecowittIngestAuditProofRules.test.ts`,
  `src/test/EcowittIngestAuditProofPanel.test.tsx`,
  `src/test/ecowittIngestAuditProof-static-safety.test.ts`.
- Revert `src/test/SensorsEcowittLiveProofWiring.test.ts` to expect
  the legacy disclaimer.

### 14.7 Recommended next action

- Tag this checkpoint.
- Do **not** add more EcoWitt product surface on this branch.
- Future branch, if needed: `ecowitt-proof-export` — read-only
  sanitized copy / print export only. Out of scope: writes, AI,
  alerts, Action Queue, automation, device control, raw payload
  exposure.

---

## 15. RC audit follow-up — operator-mode disclosure and proof-copy clarity

Read-only follow-up to the One-Tent Loop Release Candidate audit. No
schema, RLS, Edge Function, RPC, auth, AI, alerts, Action Queue,
automation, or device-control changes.

### 15.1 Operator Mode requires a server-verified role gate

- `src/pages/Sensors.tsx` mounts the EcoWitt live-row proof and
  ingest-audit proof panels only when `?operator=1` is requested and
  `useHasRole("operator")` returns `granted` from the server-backed RPC.
- `?operator=1` only requests the diagnostic surface. It cannot grant
  operator access; loading, denied, unauthenticated, and role-check error
  states all fail closed without rendering the panel or enabling its
  diagnostic-only audit query.
- Data access remains scoped by existing Supabase RLS:
  `useSensorReadings` only returns rows the current user can see, and
  `useEcowittIngestAuditProofRows` only returns rows allowed by the
  `"Users view own ingest audit"` policy
  (`auth.uid() = user_id`). The query string cannot widen access.

### 15.2 Ingest-audit hook column allowlist (exact)

`src/hooks/useEcowittIngestAuditProofRows.ts` SELECTs only these
columns from `public.sensor_ingest_audit_log`:

```
source, tent_id, rows_received, rows_inserted, captured_at, created_at
```

Never selected and never rendered: `user_id`, `bridge_token_id`,
`raw_payload`, and any other private identifiers or secrets.

### 15.3 Audit-proof unavailable copy (presenter-only)

`src/components/EcowittIngestAuditProofPanel.tsx` now distinguishes
the two non-loaded states the view model already exposes, to help
operator triage without changing logic or status values:

- `blocked` → "Audit proof unavailable with current read permissions
  (RLS-denied)."
- `error` → "Audit proof unavailable due to a read error (network or
  service)."

`loaded`, `no_audit_rows`, `unavailable`, and `loading` copy is
unchanged. Neither copy implies a healthy state.

### 15.4 New static-safety guard

- `src/test/oneTentSensorProofReportSection-static-safety.test.ts`
  asserts that `buildOneTentSensorProofReportSection(...)` markdown
  contains no UUID-shaped identifiers and no second-precision ISO
  timestamps across loaded / blocked / error / empty / no-tent paths.

### 15.5 Safety posture

- Read-only follow-up. No writes, no new queries, no new product
  surface.
- Action Queue remains approval-required.
- Missing / stale / blocked / invalid sensor proof is still never
  treated as positive.
- No raw payloads, service role keys, bridge tokens, MACs, private
  IDs, owning auth IDs, or env secrets exposed.

### 15.6 Rollback

- Revert the `detailFor` helper in
  `src/components/EcowittIngestAuditProofPanel.tsx` to render
  `{vm.detail}` directly.
- Delete
  `src/test/oneTentSensorProofReportSection-static-safety.test.ts`.
- Remove this section (15) from `docs/v0-release-checkpoint.md`.

---

## 16. Final Demo/Proof CI hardening slice

Read-only / safety / docs hardening. No product surface change.

### CI guard command

`npm run test:demo-proof-guards` runs the three core demo/proof guards
together as a single PR signal:

- `/grows` route guard
  (`src/test/demoProofWalkthrough-no-grows-route.test.ts`) — fails if
  any walkthrough or doc reintroduces the nonexistent `/grows` route.
- Demo Proof Walkthrough route snapshot
  (`src/test/demoProofWalkthrough-route-snapshot.test.ts`) — fails if a
  walkthrough `href` drifts away from a real `App.tsx` route, or if
  `?operator=1` is dropped from the operator-mode step.
- Proof report redaction
  (`src/test/proofReportRedactionRules.test.ts` and the expanded
  `src/test/proofReportRedactionRules-expanded.test.ts`).

### Review-only walkthrough notes (per write-capable destination)

`DemoProofWalkthroughStep.reviewOnlyNote` is rendered below the safety
note for the four write-capable destinations. Links remain plain
navigation links — they are never disabled or wrapped in buttons.

- Quick Log (`/daily-check`): "Review only—do not submit during demo."
- AI Doctor (`/doctor`): "Review only—do not run AI during demo."
- Alerts (`/alerts`): "Review only—do not create or change alerts during
  demo."
- Action Queue (`/actions`): "Review only—do not approve actions during
  demo."

Read-only destinations (Dashboard, Tents, Plants, Logs/Timeline, Sensor
Data, Sensor Data Operator Mode, One-Tent Live Proof report) do not
carry a review-only note.

### Expanded proof report redaction

`sanitizeProofReportMarkdown` now defends copy/print output against
secrets in:

- fenced code blocks
- inline backticks
- shell/env assignments (`export KEY=value`, `$env:KEY="value"`)
- JSON-like (`"KEY": "value"`) and YAML-like (`KEY: value`) variants
- URL query tokens (`?access_token=...`)
- `Authorization:` header values (full line) and `Bearer <token>` /
  JWT-shaped strings
- UUIDs, ISO-second timestamps, MAC-like values, and long hex blobs
  including occurrences inside code spans

Sensitive keyword list includes `service_role`,
`SUPABASE_SERVICE_ROLE(_KEY)`, `bridge_token(_id)`, `access_token`,
`refresh_token`, `raw_payload`, `anon_key`, `api_key`/`apikey`,
`passkey`, `password`, `secret`, `jwt`, `authorization`. The sanitizer
is pure, deterministic, idempotent, and null-safe; Copy and Print
continue to use sanitized output only.

### E2E no-write contract

`e2e/demo-proof-walkthrough-readonly.spec.ts`:

- Loads `/internal/demo-proof-walkthrough`.
- Asserts the page, read-only banner, and step links render.
- Fails on any forbidden network call during load, including:
  - any Edge Function invocation (`/functions/v1/...`)
  - known AI provider hosts (OpenAI, Anthropic, Google Generative
    Language, Lovable AI gateway)
  - Supabase mutations to `grow_events`, `diary_entries`,
    `action_queue`, `alerts`, `ai_*`
  - RPCs matching `quicklog_save`, alert/action/AI RPC patterns
  - any non-GET request to `/rest/v1/...` or `/rpc/...`
    (excepting auth session refresh)
- Does not click into write-capable destinations.

**Runtime status:** E2E spec added; runtime execution pending in this
sandbox. Missing prerequisite: Playwright Chromium binary is not
installed at the sandbox path
(`/chromium_headless_shell-1223/chrome-headless-shell-linux64/...`).
Run `npx playwright install chromium` in a CI runner with browser
download permitted, then `npx playwright test
e2e/demo-proof-walkthrough-readonly.spec.ts` to execute.

### Safety posture

- No schema, RLS, Edge Function, RPC, or auth changes.
- No new Supabase queries.
- No writes, no AI/model calls, no alert creation, no Action Queue
  writes, no automation, no device control.
- Walkthrough remains read-only; sanitizer is pure.

### Validation counts (this slice)

- `npm run test:demo-proof-guards` — 4 files / 62 passed.
- `npx vitest run proofReportRedactionRules DemoProofWalkthrough
  demoProofWalkthrough --reporter=verbose` — 9 files / 90 passed.
- `npx tsc -p tsconfig.app.json --noEmit` — clean.
- Playwright spec — pending (see Runtime status above).

### Rollback

- Remove the `test:demo-proof-guards` entry from `package.json`.
- Delete `src/test/proofReportRedactionRules-expanded.test.ts` and
  `src/test/DemoProofWalkthrough-review-only-notes.test.tsx`.
- Delete `e2e/demo-proof-walkthrough-readonly.spec.ts`.
- Revert the `reviewOnlyNote` field plus the four populated values in
  `src/lib/demoProofWalkthroughViewModel.ts` and the matching render
  block in `src/pages/DemoProofWalkthrough.tsx`.
- Revert the keyword/regex expansion and `AUTH_HEADER_RE` in
  `src/lib/proofReportRedactionRules.ts`.
- Remove this section (16) from `docs/v0-release-checkpoint.md`.

---

## 17. CI Chromium runtime + Demo Proof E2E artifacts

Workflow/harness only. No product surface change.

### Chromium install added to CI

New workflow `.github/workflows/demo-proof-walkthrough-readonly.yml`:

- Triggers on `pull_request` to `main` / `verdant-grow-diary` when the
  walkthrough, view model, redaction rules, related tests, the
  Playwright config, or this workflow change. Also runs via
  `workflow_dispatch`.
- Caches Bun packages and `~/.cache/ms-playwright`.
- Installs Chromium with OS deps:
  `bunx playwright install chromium --with-deps` (matches the existing
  `auth-loading-smoke` workflow pattern).

### CI commands run

1. `bun run test:demo-proof-guards`
2. `bunx vitest run proofReportRedactionRules DemoProofWalkthrough
   demoProofWalkthrough --reporter=verbose`
3. `bunx tsc -p tsconfig.app.json --noEmit`
4. `bun run test:e2e:demo-proof-readonly` →
   `playwright test e2e/demo-proof-walkthrough-readonly.spec.ts
   --project=chromium-mocked`

Steps 1–2 tee their output into `e2e/results/*.log` for artifact
upload. Step 4 uses the existing `chromium-mocked` Playwright project
backed by the local Vite dev server defined in `playwright.config.ts`.

### Artifacts uploaded (always)

- `demo-proof-guards` → `e2e/results/demo-proof-guards.log`
- `demo-proof-vitest` → `e2e/results/demo-proof-vitest.log`
- `demo-proof-playwright-report` → `playwright-report/`
- `demo-proof-playwright-results` → `test-results/` (traces,
  screenshots, videos only when Playwright config generates them on
  failure)

Retention: 14 days. `if-no-files-found: ignore` so successful runs
without traces do not fail the upload step.

### E2E no-write contract preserved

`e2e/demo-proof-walkthrough-readonly.spec.ts` still fails on:
- any Edge Function call (`/functions/v1/...`)
- known AI provider hosts (OpenAI, Anthropic, Google Generative
  Language, Lovable AI gateway)
- Supabase mutations to `grow_events`, `diary_entries`,
  `action_queue`, `alerts`, `ai_*`
- RPCs matching `quicklog_save` / alert / action / AI patterns
- any non-GET `/rest/v1/...` or `/rpc/...` (except auth session
  refresh)

The E2E is blocking (not marked continue-on-error).

### Local reproduction

```
npx playwright install chromium
npm run test:e2e:demo-proof-readonly
```

### Validation result

- `npm run test:demo-proof-guards` — 4 files / 62 passed.
- Targeted vitest — 9 files / 90 passed.
- `tsc -p tsconfig.app.json --noEmit` — clean.
- Playwright spec — runtime unavailable in sandbox (no Chromium
  binary). Will execute on the CI runner once the workflow runs;
  install step `bunx playwright install chromium --with-deps` is in
  place.

### Safety posture

- No product code changes.
- No schema/RLS/Edge/RPC/auth/query changes.
- No writes, AI calls, alerts, Action Queue writes, automation, or
  device control.

### Rollback

- Delete `.github/workflows/demo-proof-walkthrough-readonly.yml`.
- Remove the `test:e2e:demo-proof-readonly` entry from `package.json`.
- Remove this section (17) from `docs/v0-release-checkpoint.md`.

---

## 18. Demo Proof Walkthrough CI workflow polish

Workflow polish only. No product / schema / RLS / Edge / RPC / auth /
query / write / AI / alert / Action Queue / automation / device-control
changes. E2E no-write contract unchanged.

### Concurrency contract

```
concurrency:
  group: demo-proof-walkthrough-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true
```

Older in-flight runs for the same PR (or branch on `workflow_dispatch`)
are cancelled when a new commit lands.

### Path filters (PR trigger)

The workflow runs only when any of these paths change:

- `e2e/demo-proof-walkthrough-readonly.spec.ts`
- `src/pages/DemoProofWalkthrough.tsx`
- `src/lib/demoProofWalkthroughViewModel.ts`
- `src/lib/proofReportRedactionRules.ts`
- `src/lib/appRouteManifest.ts`
- `src/App.tsx`
- `src/test/demoProofWalkthrough-no-grows-route.test.ts`
- `src/test/demoProofWalkthrough-route-snapshot.test.ts`
- `src/test/proofReportRedactionRules*.test.ts`
- `src/test/DemoProofWalkthrough*.test.tsx`
- `playwright.config.ts`, `playwright.config.*`
- `.github/workflows/demo-proof-walkthrough-readonly.yml`
- `package.json`, `bun.lock`, `bun.lockb`
- `docs/one-tent-loop-rc-smoke-test.md`
- `docs/v0-release-checkpoint.md`

`workflow_dispatch` is preserved for manual runs.

### Browser cache contract

```
- uses: actions/cache@…
  with:
    path: ~/.cache/ms-playwright
    key: ${{ runner.os }}-playwright-chromium-${{ hashFiles('bun.lock', 'bun.lockb', 'package.json') }}
    restore-keys: |
      ${{ runner.os }}-playwright-chromium-
```

Matches the existing `auth-loading-smoke` cache pattern. Cache miss
falls back to OS-level restore key, then to a fresh
`bunx playwright install chromium --with-deps`. `node_modules` is not
cached (Bun resolves from its own `~/.bun/install/cache` and the repo
pattern does not cache `node_modules`).

### Failure-only artifacts

In addition to the always-on artifacts (`demo-proof-guards`,
`demo-proof-vitest`, `demo-proof-playwright-report`,
`demo-proof-playwright-results`), the workflow now uploads a
failure-only artifact:

- `demo-proof-playwright-failure-artifacts` — Playwright screenshots
  (`test-results/**/*.png`), videos (`*.webm`), and traces
  (`trace.zip`). Gated by `if: failure()`. Retention: 7 days.

Successful runs never publish raw page content beyond the standard
report/results directories.

### Local reproduction commands

```
bun run test:demo-proof-guards
bunx vitest run proofReportRedactionRules DemoProofWalkthrough demoProofWalkthrough --reporter=verbose
bunx tsc -p tsconfig.app.json --noEmit
bunx playwright install chromium
bun run test:e2e:demo-proof-readonly
```

CI workflow name (GitHub Actions UI): **Demo Proof Walkthrough
readonly E2E (mocked)**.

### Artifact names (reference)

| Artifact                                   | Trigger      |
| ------------------------------------------ | ------------ |
| `demo-proof-guards`                        | always       |
| `demo-proof-vitest`                        | always       |
| `demo-proof-playwright-report`             | always       |
| `demo-proof-playwright-results`            | always       |
| `demo-proof-playwright-failure-artifacts`  | on failure   |

### Validation result

- `bun run test:demo-proof-guards` — 4 files / 62 passed.
- Targeted vitest — 9 files / 90 passed.
- `tsc -p tsconfig.app.json --noEmit` — clean.
- Workflow YAML parses cleanly (`yaml.safe_load` OK).
- Playwright spec — runtime unavailable locally (no Chromium in
  sandbox). CI install step is in place and will execute the spec on
  the first PR matching the path filters.

### Rollback

- Revert the `concurrency:` block, expanded `paths:` entries, and the
  `Upload Playwright failure artifacts` step in
  `.github/workflows/demo-proof-walkthrough-readonly.yml`.
- Remove section 18 from `docs/v0-release-checkpoint.md`.

### 18.1 Operator recovery addendum

- Added `test:demo-proof:full` package script — single fail-fast command running guards → targeted vitest → `tsc` → demo-proof read-only E2E.
- Local prerequisite is unchanged: run `bunx playwright install chromium` once per machine. The script does NOT auto-install Chromium.
- `docs/one-tent-loop-rc-smoke-test.md` "Demo Proof CI verification" now includes:
  - one-liner `grep` to verify the path filter still references the doc,
  - Playwright CI troubleshooting checklist (Chromium missing, cache miss, path filter, Vite, no-write violation),
  - GitHub Actions rerun steps (Re-run failed jobs, empty-commit fallback),
  - artifact download/open instructions for all five artifact names.

### 18.2 Local helper scripts addendum

- Added `test:demo-proof:e2e` alias for the read-only Playwright spec.
- Added `test:demo-proof:full:check` — same chain as `test:demo-proof:full` but runs `scripts/check-demo-proof-playwright-chromium.mjs` before the E2E step. Precheck NEVER auto-installs; on miss it prints `bunx playwright install chromium` (`--with-deps` for Linux CI) and exits non-zero.
- Added `test:demo-proof:open-report` → `scripts/open-demo-proof-playwright-report.mjs`. Opens a downloaded `demo-proof-playwright-report` zip or directory, extracting zips to `.artifacts/demo-proof-playwright-report/`.
- Expanded `docs/one-tent-loop-rc-smoke-test.md` with expected file layout for `demo-proof-playwright-report`, `demo-proof-playwright-results`, and `demo-proof-playwright-failure-artifacts`.
- No product, runtime, workflow-trigger, schema, RLS, Edge, RPC, auth, query, write, AI, alert, Action Queue, automation, or device-control behavior changed.

### 18.3 Demo-Proof artifact tooling polish

- Documented the exact CI artifact names produced by
  `.github/workflows/demo-proof-walkthrough-readonly.yml`:
  `demo-proof-guards`, `demo-proof-vitest`, `demo-proof-playwright-report`,
  `demo-proof-playwright-results`, and the failure-only
  `demo-proof-playwright-failure-artifacts`.
- `scripts/open-demo-proof-playwright-report.mjs` no longer depends on a
  system `unzip` binary. A Node-built-in zip extractor
  (`scripts/demo-proof-artifact-utils.mjs`) handles stored + deflated entries
  and rejects unsafe paths. System `unzip` is only a best-effort fallback.
- Added `scripts/download-latest-demo-proof-playwright-report.mjs` (package
  script `test:demo-proof:download-report`) which uses `gh` to fetch the
  latest `demo-proof-playwright-report` artifact and opens it via the shared
  opener.
- Added `scripts/summarize-demo-proof-playwright-results.mjs` (package script
  `test:demo-proof:summarize-results`) to recursively list `trace.zip`,
  `*.webm`, and `*.png` artifacts under a results directory.
- No product, schema, RLS, Edge, RPC, auth, query, write, AI, alert,
  Action Queue, automation, device-control, or workflow-behavior changes.
- No new third-party dependencies.

### 18.4 Demo-Proof artifact verification, cleanup, and inspection

- Added `scripts/verify-demo-proof-playwright-report.mjs`
  (`bun run test:demo-proof:verify-report`) — confirms an extracted report
  directory exists and contains `index.html`; prints resolved path and
  suggested open commands.
- Documented `gh` troubleshooting (auth, repo/workflow, artifact) and the
  exact workflow-file resolution path used by the download helper.
- Added `scripts/cleanup-demo-proof-artifacts.mjs`
  (`bun run test:demo-proof:cleanup` and `… :cleanup:all`) — conservative
  cleanup of `.artifacts/demo-proof-playwright-report/` (default) and, with
  `--all`, also `.artifacts/demo-proof-playwright-results/` plus selected
  `trace.zip` / `*.webm` / `*.png` files under `test-results/`. Refuses
  unsafe paths and never wipes the whole `test-results/` tree.
- Added `scripts/open-demo-proof-playwright-artifacts.mjs`
  (`bun run test:demo-proof:open-artifacts`) — opens the first trace / video /
  screenshot found under `test-results/` and prints
  `bunx playwright show-trace <path>` for inspection.
- No product, schema, RLS, Edge, RPC, auth, query, write, AI, alert,
  Action Queue, automation, device-control, or workflow-behavior changes.
- No new third-party dependencies.

### 18.5 Demo-Proof artifact docs, safety checks, tree, and review helper

- Added copy-paste artifact examples (verify-report, gh download, run-id
  download, explicit opener paths, results summary) to
  `docs/one-tent-loop-rc-smoke-test.md`.
- Added `isSafeArtifactDeletePath` / `assertSafeArtifactDeletePath` to
  `scripts/demo-proof-artifact-utils.mjs` (pure, exported) plus
  `scripts/test-demo-proof-artifact-helpers.mjs`
  (`bun run test:demo-proof:artifact-helpers`) — Node built-in `assert`,
  zero deps. Proves `/`, repo root, and empty paths are refused while
  `.artifacts/demo-proof-playwright-report/` and nested
  `test-results/.../trace.zip` are allowed.
- Added `scripts/tree-demo-proof-playwright-report.mjs`
  (`bun run test:demo-proof:tree-report`) — bounded tree (depth 3, ≤80
  entries) of an extracted report; highlights resolved `index.html`.
- Added `scripts/review-demo-proof-artifacts.mjs`
  (`bun run test:demo-proof:review-artifacts` and
  `:review-artifacts:cleanup`) — runs verify-report → summarize-results →
  open-artifacts, then optional cleanup with `--cleanup` /
  `--cleanup-all`. Supports `--report <path>` / `--results <path>`.
- No product, schema, RLS, Edge, RPC, auth, query, write, AI, alert,
  Action Queue, automation, device-control, or workflow-behavior changes.
- No new third-party dependencies.

### 18.6 Demo-Proof artifact self-test + download-review helpers

Scripts/docs-only addendum. No product, runtime, or workflow behavior changed.

- Added `scripts/create-synthetic-demo-proof-artifacts.mjs` (synthetic
  helper-validation artifact set under `.artifacts/`). Synthetic artifacts
  validate helper behavior only; they do not prove the real Demo Proof
  Walkthrough E2E passed.
- Extended `scripts/tree-demo-proof-playwright-report.mjs` with required
  checks: report root is directory, `index.html` is present recursively,
  and at least one supporting file exists besides `index.html`. Optional
  warnings printed for common Playwright dirs (`data/`, `assets/`, `trace/`).
- Added `scripts/extract-and-check-demo-proof-playwright-report.mjs` that
  extracts `demo-proof-playwright-report.zip` (via existing safe
  Node-only `extractZip`) into `.artifacts/` and runs `verify-report` +
  `tree-report` for a single pass/fail.
- Added `scripts/download-and-review-demo-proof-artifacts.mjs` that
  downloads both `demo-proof-playwright-report` and
  `demo-proof-playwright-results` for the latest (or `--run-id`) run via
  `gh`, then runs verify -> tree -> summarize -> open, with optional
  `--cleanup` / `--cleanup-all`.
- Package scripts added: `test:demo-proof:create-synthetic-artifacts`,
  `test:demo-proof:extract-check-report`, `test:demo-proof:download-review`,
  `test:demo-proof:download-review:cleanup`.
