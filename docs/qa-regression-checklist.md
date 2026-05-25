# Verdant QA Regression Checklist

Manual and automated regression checks for the V0 product spine. Run this
after any non-trivial change before shipping to production.

No app code changes. Read-only reference.

---

## How to use this checklist

- **Automated tests** — run `bunx vitest run`. All ~650+ tests must pass.
  Tests marked with a ✦ symbol are backed by specific test files.
- **Manual checks** — steps performed in the browser against the staging or
  production environment.
- **Static checks** — `grep`/`rg` commands you can run locally before opening
  a PR.

---

## 1. Core Route Smoke Tests

Navigate to each route while signed in. Confirm no crash, no blank screen, and
no console errors of severity > warning.

- [ ] `/welcome` — landing page renders; no private data visible; no Supabase
  table queries for `grows`, `plants`, `tents`, `sensor_readings`, `alerts`,
  `action_queue`, or `diary_entries` fire from this route.
- [ ] `/auth` — sign-in form renders; Supabase Auth redirects to `/` on success.
- [ ] `/grows` — grow index renders; empty state shown for a fresh account (no
  mock tents or plants).
- [ ] `/grows/:growId` — grow detail renders counts and recent diary entries.
- [ ] `/dashboard?growId=` — dashboard renders snapshot, trends, and alerts.
- [ ] `/logs?growId=` — logs/diary surface renders entries.
- [ ] `/timeline?growId=` — timeline renders diary events and action events.
- [ ] `/plants?growId=` — plants list renders.
- [ ] `/tents?growId=` — tents list renders.
- [ ] `/sensors` — sensors page renders; Manual Sensor Reading card visible.
- [ ] `/alerts` — alerts list renders.
- [ ] `/alerts/:alertId` — alert detail renders; related queue items shown.
- [ ] `/actions?growId=` — action queue renders; filter chips visible.
- [ ] `/actions/:actionId` — action detail renders; source alert backlink shown.
- [ ] `/doctor` — coach page renders; sufficiency rating visible.
- [ ] Any unauthenticated visit to a private route → redirects to `/auth`.

---

## 2. Auth / Grow / Tent / Plant Checks ✦

### Automated
- ✦ `src/test/grows-index.test.ts` — grow index contract.
- ✦ `src/test/grow-detail.test.ts` — grow detail, counts, recent entries.
- ✦ `src/test/grow-detail-status.test.ts` — grow status helpers.
- ✦ `src/test/scoped-grow-navigation-contract.test.tsx` — scoped grow selection.
- ✦ `src/test/scoped-grow-banner.test.tsx` — scoped grow banner rendering.
- ✦ `src/test/plants-tents-grow-filter.test.ts` — plant/tent grow filter.
- ✦ `src/test/useScopedGrow.test.tsx` — hook contract.

### Manual
- [ ] Create a new grow → it appears in `/grows`.
- [ ] Select a grow → Dashboard, Plants, Tents, Timeline, Actions all filter to it.
- [ ] Switching grows in the scoped grow selector updates all surfaces.
- [ ] New account with no data sees empty states, not mock data.

---

## 3. Quick Log Checks ✦

### Automated
- ✦ `src/test/quicklog-preview.test.ts` — preview validation rules.
- ✦ `src/test/quicklog-typed-event-payload.test.ts` — payload shape.
- ✦ `src/test/quicklog-typed-event-rpc-contract.test.ts` — RPC contract.
- ✦ `src/test/diary-entry-rules.test.ts` — normalization rules.
- ✦ `src/test/grow-diary-timeline.test.ts` — timeline view model.
- ✦ `src/test/grow-diary-architecture-doc.test.ts` — architecture doc contract.

### Manual
- [ ] Open Quick Log → all log types (watering, feeding, training, observation,
  photo) are selectable.
- [ ] Enter an out-of-range pH value → preview warning appears; Save is not blocked.
- [ ] Submit a Quick Log entry → it appears in the Timeline.
- [ ] Quick Log does not write to `action_queue`, `alerts`, `alert_events`, or
  `grow_events` tables directly (only `diary_entries`).

---

## 4. Timeline Checks ✦

### Automated
- ✦ `src/test/timeline-normalized-diary.test.tsx` — normalized entries render.
- ✦ `src/test/timeline-action-events.test.ts` — action events on timeline.
- ✦ `src/test/timeline-alert-events.test.ts` — alert events on timeline.
- ✦ `src/test/timeline-grow-filter.test.ts` — grow filter contract.

### Manual
- [ ] Timeline shows diary entries and action queue events in reverse
  chronological order.
- [ ] Timeline is scoped to the selected grow; changing grow updates the view.
- [ ] Diary entries with invalid or malformed `details` jsonb still render
  (with a warning badge, not a crash).

---

## 5. Sensor Source Labeling Checks ✦

### Automated
- ✦ `src/test/grow-data-source-label.test.ts` — label classification rules.
- ✦ `src/test/sensors-data-source-badge.test.tsx` — sensor badge component.
- ✦ `src/test/dashboard-latest-environment.test.ts` — snapshot source label.
- ✦ `src/test/dashboard-sensor-quality.test.ts` — quality classification.
- ✦ `src/test/dashboard-data-source-disclosure.test.tsx` — dashboard disclosure.
- ✦ `src/test/plant-tent-detail-data-source-disclosure.test.tsx`
- ✦ `src/test/plants-tents-data-source-disclosure.test.tsx`

### Manual
- [ ] A fresh `manual` reading in Sensors → Dashboard shows **Manual** source
  label and a timestamp.
- [ ] A reading older than the freshness window → Dashboard shows **Stale** badge.
- [ ] No real sensor data → Dashboard shows **Unavailable**, not mock values.
- [ ] Every sensor card that shows a value shows exactly one source label.

---

## 6. Mock vs Real Data Checks ✦

### Automated
- ✦ `src/test/cameras-tasks-data-source-disclosure.test.tsx`
- ✦ `src/test/dashboard-data-source-disclosure.test.tsx`
- ✦ `src/test/plants-tents-data-source-disclosure.test.tsx`
- ✦ `src/test/manual-sensor-reading-entry.test.ts` — mock arrays not mutated.

### Manual
- [ ] Authenticated user with no grows → `/grows` shows empty state with
  "Create your first grow" CTA; no mock tents or plants visible anywhere.
- [ ] Any demo/mock data that does appear carries a visible **Demo** label.
- [ ] Demo data is never passed through the environment alert persistence
  pipeline (no alerts written for demo readings).
- [ ] `isDemo: true` on a snapshot → AI confidence is capped; UI discloses it.

---

## 7. AI Doctor Caution Checks ✦

### Automated
- ✦ `src/test/ai-coach-output-safety.test.ts` — output constraints.
- ✦ `src/test/ai-coach-security.test.ts` — security contract.
- ✦ `src/test/ai-context-sufficiency.test.ts` — context sufficiency gating.
- ✦ `src/test/coach-context-sufficiency.test.tsx` — coach UI sufficiency.
- ✦ `src/test/coach-created-audit.test.ts` — coach audit trail.
- ✦ `src/test/coach-add-to-queue.test.ts` — coach → queue handoff.
- ✦ `src/test/coach-diary-context-adapter.test.ts` — diary → AI context adapter.

### Manual
- [ ] Open `/doctor` with sparse data (no recent sensor reading, no diary
  entries) → advice shows **low** confidence and lists missing inputs.
- [ ] AI output never includes fabricated sensor values or device states.
- [ ] AI output contains no action queue item creation — only the grower's
  explicit "Add to Queue" gesture creates a queue item.
- [ ] Demo / stale inputs are disclosed in the coach context panel; they do
  not silently inflate confidence.

---

## 8. Alert Checks ✦

### Automated
- ✦ `src/test/alerts-foundation.test.ts` — alert creation contract.
- ✦ `src/test/alert-detail.test.ts` — alert detail rendering.
- ✦ `src/test/alert-events.test.ts` — alert_events audit trail.
- ✦ `src/test/alert-related-actions.test.ts` — alert → related queue items.
- ✦ `src/test/alert-stale-action-warning.test.ts` — stale-warning behavior.
- ✦ `src/test/dashboard-environment-alerts.test.ts` — dashboard alert derivation.
- ✦ `src/test/environment-alerts-persistence.test.ts` — persistence eligibility.

### Manual
- [ ] Enter a manual reading outside the configured target range → an
  environment alert appears on the Dashboard and in `/alerts`.
- [ ] The alert has `source = "environment_alert"` and a matching
  `alert_events` row with `event_type = "created"`.
- [ ] No alert is created automatically for demo or stale data.
- [ ] No alert is created automatically for a reading with quality `unavailable`.
- [ ] Alert detail shows related pending queue items when they exist.

---

## 9. Action Queue Approval-Required Checks ✦

### Automated
- ✦ `src/test/action-queue-safety.test.ts` — core safety guarantees.
- ✦ `src/test/action-queue-audit.test.ts` — append-only audit trail.
- ✦ `src/test/action-queue-transitions.test.ts` — state machine.
- ✦ `src/test/action-queue-complete-cancel.test.ts` — complete/cancel flows.
- ✦ `src/test/action-queue-provenance.test.ts` — provenance / backlinks.
- ✦ `src/test/action-queue-grow-filter.test.ts` — grow filter.
- ✦ `src/test/action-queue-notes.test.ts` — notes on queue items.
- ✦ `src/test/action-queue-ux.test.ts` — UX contract.
- ✦ `src/test/alert-to-action-queue.test.ts` — alert → queue handoff rules.
- ✦ `src/test/action-detail.test.ts` — action detail rendering.
- ✦ `src/test/action-detail-context-links.test.ts` — context links.
- ✦ `src/test/action-detail-navigation.test.ts` — navigation.
- ✦ `src/test/action-detail-stale-source-alert.test.ts` — stale-warning.
- ✦ `src/test/v0-operating-loop-contract.test.ts` — **stop-ship contract**.

### Manual
- [ ] From an alert, click "Add to Action Queue" → item appears in
  `/actions` with `status = pending_approval`.
- [ ] Queue item has `action_type = "advisory"` and a `[alert:<id>]`
  back-pointer in the reason field.
- [ ] Approve / reject / complete / cancel all require a dialog confirmation;
  no one-click state transition exists.
- [ ] Resolving the source alert while the queue item is `pending_approval` →
  Action Detail shows the stale-warning message without mutating any row.
- [ ] Cancelling the queue item while the alert is still open → Alert Detail
  shows the related-action count decrease.
- [ ] `action_queue_events` has no Update or Delete path in the UI.

---

## 10. Static Safety Checks

Run these locally before opening a PR. Zero hits expected for each.

### 10.1 No `service_role` usage in frontend code
```bash
rg -n "service_role" src/ public/ scripts/
```
Expected: no matches (only acceptable in `docs/`, `supabase/`, `.env*`).

### 10.2 No device control surfaces
```bash
rg -n "mqtt|actuator|relay|homeassistant|home.assistant|ha_url|device_command" src/
```
Expected: no matches.

### 10.3 No blind automation
```bash
rg -n "auto_approve\|auto_complete\|auto_cancel\|autoApprove\|autoComplete\|autoCancel" src/
```
Expected: no matches.

### 10.4 No fake live sensor data
```bash
rg -n "source.*=.*[\"']live[\"']" src/components/ src/hooks/ src/pages/
```
Review any match: `source = "live"` must only appear in mock data fixtures or
in type definitions, never fabricated in production hooks or components.

### 10.5 No `create_watering_event` called from runtime UI
```bash
rg -n "create_watering_event" src/components/ src/pages/ src/hooks/
```
Expected: no matches (the RPC exists in the DB and is in the typed-event
launch-gate, but the feature flag `typedWateringWriteEnabled` is `false`
in V0).

### 10.6 No client-trusted `user_id` in inserts
```bash
rg -n "user_id.*:.*userId\|user_id.*=.*user" src/hooks/ src/lib/ src/pages/
```
Review any match: `user_id` in insert payloads must come from `auth.uid()`
server-side, not from a client variable.

### 10.7 No new `@typescript-eslint/no-explicit-any` violations
```bash
bun run lint 2>&1 | grep "no-explicit-any"
```
Expected: no output.

### 10.8 No Leads data mixed into Grow OS surfaces
```bash
rg -n "leads" src/components/ src/pages/Dashboard.tsx src/pages/Grows.tsx src/pages/Plants.tsx src/pages/Tents.tsx src/pages/Sensors.tsx
```
Expected: no matches. Leads is operator-only at `/admin/leads`.

---

## 11. Validation Commands (full suite)

```bash
# Unit tests — all must pass
bunx vitest run

# Lint — zero errors
bun run lint

# Typecheck — zero errors
bun run typecheck

# Production build — zero errors
bun run build
```

All four commands must pass on main and on every PR before merge.
The CI job is named **"Lint, typecheck, test, build"** and is the required
status check.

---

## References

- `docs/v0-operating-loop-demo.md` — canonical demo script for the V0 spine.
- `docs/one-tent-loop.md` — V0 spine map, build philosophy, safety rules.
- `docs/security-checklist.md` — per-PR security review checklist.
- `docs/architecture.md` — product layers, routes, ownership model.
- `docs/grow-os-architecture.md` — live vs demo contract, AI safety rules.
- `src/test/v0-operating-loop-contract.test.ts` — stop-ship contract test.
- `.github/workflows/ci.yml` — CI pipeline definition.
