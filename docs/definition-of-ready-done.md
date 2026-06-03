# Definition of Ready & Definition of Done

These checklists gate every Verdant change. They exist to protect the
**One-Tent Loop** (Grow → Tent → Plant → Quick Log → Timeline → Sensor
Snapshot → AI Doctor → Alert → Approval-Required Action Queue) from
unsafe, untested, or unscoped work.

---

## Definition of Ready (DoR)

A Linear issue is **Ready** when all of the following are true:

1. **User story** — written from a grower's perspective, in plain
   language.
2. **V0 loop area** — names which One-Tent Loop step is affected (Quick
   Log, Timeline, Sensor Snapshot, AI Doctor, Alert, or Action Queue).
3. **Scope** — the smallest correct change that solves the story.
4. **Out of scope** — what this issue will *not* touch (schema, RLS,
   auth, edge functions, device control, automation, AI Doctor prompt
   surgery, etc.).
5. **Safety rules** — explicit reference to the rules that constrain
   this change:
   - No fake live data
   - No blind automation
   - Action Queue stays **approval-required**
   - No device control unless explicitly scoped and safety-gated
   - Business logic stays out of `.tsx`
6. **Data source rules** — for any sensor surface, names which sources
   are allowed (live / manual / csv / demo / stale / invalid) and how
   they are labeled.
7. **Acceptance criteria** — observable, testable, written before
   implementation.
8. **Tests required** — at minimum: happy path, edge boundaries,
   null/invalid inputs, regression coverage for the changed rule.
9. **Rollback note** — how to undo the change safely if it ships and
   regresses the loop.

If any item is missing, the issue is not Ready and Cursor must not start
implementation.

---

## Definition of Done (DoD)

A change is **Done** only when all of the following are true:

1. **PR merged** to `main` with a linked Linear issue.
2. **Tests pass** — `bun run lint`, `bunx tsc --noEmit`, `bunx vitest run`
   all green in GitHub CI. Playwright coverage for any One-Tent Loop UI
   change is included and green.
3. **No fake live data** — every sensor / telemetry surface labels its
   source honestly. Demo and mock fixtures are never classified as
   `usable` / live.
4. **No device control** added without an explicit safety review noted in
   the PR.
5. **No duplicated rule tables in JSX** — target ranges, classification
   thresholds, and stage rules live in `src/constants/*` or
   `src/lib/*Rules.ts`, never inline in `.tsx`.
6. **Release note written** — short, grower-readable, ties the change
   back to the One-Tent Loop step it moved.
7. **Rollback path documented** — the PR body or release note names the
   exact revert / feature-flag / data-migration-reversal needed to
   undo the change safely.

If any item is missing, the change is not Done and must not be marked
released, even if it is technically merged.
