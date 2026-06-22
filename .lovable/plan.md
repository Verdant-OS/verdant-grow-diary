
# Verdant V0 Audit — Plan

## Summary
Read-only audit by a senior product engineer / QA lead / safety reviewer. No code changes. Output is a written report in Verdant's 9-section format plus a P0/P1/P2 severity table with file references and a sequenced fix plan. Scope defaults to the full One-Tent Loop spine, sensor truth, static-safety surfaces, and the recently shipped Action Queue trace-link / keyboard-nav / a11y slice (since that is the most recent change surface).

## Requirements / assumptions
- Plan mode → no edits, no installs, no state-changing commands. Read-only inspection only.
- Defaults chosen because the user skipped scoping questions:
  - Scope: full V0 loop + recent Action Queue trace slice + sensor truth + safety scanners.
  - Depth: audit + prioritized fix plan, no implementation this turn.
  - Format: Verdant 9-section narrative + P0/P1/P2 severity table.
- Authority order on conflicts: project knowledge > workspace knowledge > skill > general guidance.
- Hard stop-ship rules (from `docs/v0-sentinel-stop-ship-checklist.md`) are non-negotiable evaluation gates.
- No schema, RLS, edge, auth, or device-control changes will be proposed as part of the audit itself.

## Audit scope (what will be inspected)
1. **One-Tent Loop spine**
   - Quick Log writer + sensor snapshot validation (`src/lib/quick-log/*`).
   - Timeline rendering, highlight, auto-scroll, reduced-motion, "View in Actions" / "Back to Actions".
   - Sensor snapshot surfaces and source labels (`src/constants/sensorSourceLabels.ts`, `src/lib/sensor/*`).
   - AI Doctor output contract vs. `docs/qa-regression-checklist.md` 8-field rule.
   - Alert → Action Queue handoff (approval-required, provenance).
2. **Action Queue recent slice**
   - `src/lib/actionQueueTraceLinkCopyRules.ts`
   - `src/lib/actionQueueKeyboardNavigationRules.ts`
   - `src/components/CopyTraceLinkButton.tsx`
   - `src/components/ActionQueueDetailDrawer.tsx`
   - `src/pages/ActionQueue.tsx`, `src/pages/Timeline.tsx`
   - Integrated test isolation (`action-queue-highlight-keyboard-integrated.test.tsx`) — coverage gaps left by removing DOM assertions to dodge Radix/jsdom hang.
3. **Safety surfaces**
   - `docs/safety/static-safety-scans.md` invariants vs. recently edited files.
   - `docs/action-queue-safety-rules.md` (approval-required, no device control, no executable payloads).
   - `docs/sensor-truth-rules.md` and EcoWitt-only scan (`scripts/assert-ecowitt-only-sensor-direction.mjs`).
   - Secret exposure (`service_role`, bridge tokens) in `src/**`.
4. **RLS posture**
   - `docs/qa-rls-checklist.md` adherence in any hooks touched by the recent slice (read-only check; no DB calls).
5. **Engineering layering**
   - Business logic placement: pure rules in `src/lib/*Rules.ts` vs leakage into `.tsx`.
   - Determinism, null-safety, typing of new helpers.

## Method
- Codebase reading only: `code--view`, `code--list_dir`, `rg` via read-only inspection patterns.
- Cross-reference each touched file against the relevant `docs/*` rule doc and stop-ship checklist.
- For the recent slice, re-derive the trace-link copy contract (same-origin, allow-listed `actionsReturn`, no raw UUIDs in visible text) and verify against the rule file + component.
- For the integrated test gap, document exactly which behaviors are now only covered by pure-rule tests and which are no longer asserted at the DOM level; recommend the smallest follow-up coverage that doesn't reintroduce the jsdom hang.
- No Playwright runs, no `vitest`, no `tsc` — audit is read-only this turn. Validation commands will be listed for the follow-up implementation phase.

## Deliverable structure (what the audit report will contain)
1. **Summary** — one-paragraph verdict.
2. **Requirements / assumptions** — scope, defaults, authority order.
3. **File-level findings** — grouped by area (Loop / Action Queue slice / Safety / Sensor truth / Layering), each with file path + line refs.
4. **Severity table** — P0 (stop-ship), P1 (must-fix before next release), P2 (cleanup), with file refs and one-line fix sketch.
5. **Implementation notes** — sequenced fix plan as small slices, each scoped to one PR with the smallest-correct-change principle.
6. **Tests added/updated** — recommended targeted tests per slice (happy / edge / null / determinism / regression / safety fence).
7. **Validation commands** — `bun run test:static-safety`, `bunx vitest run --reporter=dot`, `bunx tsc --noEmit`, `node scripts/assert-ecowitt-only-sensor-direction.mjs`, `bun run test:one-tent-loop-smoke`, relevant Playwright specs.
8. **Safety verdict** — per stop-ship rule, pass/fail with citation.
9. **Risk / rollback notes** — for each proposed fix slice.

## Explicitly out of scope
- No code edits, no migrations, no edge-function changes, no RLS edits.
- No schema or auth changes.
- No new features. No paywall / entitlement work.
- No device-control or automation surfaces.
- No Supabase writes during the audit.

## Risk / rollback notes
- Audit itself is read-only → zero runtime risk.
- Risk lives in the *follow-up* fix slices; each will be proposed as an independently revertible PR with its own validation and rollback note.
- If the audit surfaces a P0 (e.g. fake-live data path, unapproved Action Queue write, exposed secret), the report will recommend stop-ship and a single minimal hotfix slice before anything else lands.

## Next step after approval
On approval, switch to build mode and produce the written audit report (no code changes), then await direction on which fix slices (if any) to implement.
