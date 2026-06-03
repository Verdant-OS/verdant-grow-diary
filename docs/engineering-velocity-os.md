# Verdant Engineering Velocity OS

This document defines how Verdant ships software safely and quickly. It is
the repo-level operating system for scoped builds, safe implementation,
test discipline, and release measurement. Every workflow described here
serves the **One-Tent Loop**:

> Grow → Tent → Plant → Quick Log → Timeline → Sensor Snapshot →
> AI Doctor → Alert → Approval-Required Action Queue.

If a change does not measurably make that loop more real, more trusted,
more testable, or more demoable, it is the wrong change.

---

## The Stack

```
Linear → Cursor → GitHub → Playwright → PostHog
```

Each tool has one job. None of them are allowed to decide product
strategy, safety rules, or sensor truth.

### 1. Linear — Scope of Work

**Used for:** intake, scoping, prioritization, acceptance criteria, and
tracking. Every implementation task starts as a Linear issue using
`templates/linear-issue-template.md`.

**Not allowed to decide:** what is safe, what is shippable, what the
sensor truth rules are, or whether AI Doctor / Action Queue behavior may
change. Those are codified in `docs/sensor-truth-rules.md`,
`docs/action-queue-safety-rules.md`, and the One-Tent Loop contract.

### 2. Cursor — Scoped Implementation

**Used for:** writing the smallest correct code change against a single
Linear issue using `templates/cursor-task-template.md`.

**Not allowed to decide:** schema, RLS, auth, edge function contracts,
device control, or whether the Action Queue may bypass approval. Cursor
must keep business logic out of `.tsx` files — pure rules live in
`src/lib/*Rules.ts`, view models in `src/lib/*ViewModel.ts`, hooks in
`src/hooks/*`. Cursor must never introduce **fake live data**.

### 3. GitHub — PR / CI Gate

**Used for:** code review, branch protection, CI (lint, typecheck,
Vitest), and the rollback path. No change reaches `main` without:

- A linked Linear issue
- Green CI (`bun run lint`, `bunx tsc --noEmit`, `bunx vitest run`)
- A reviewer who confirms the safety verdict in the PR body
- Playwright coverage for any change that touches the One-Tent Loop UI

**Not allowed to decide:** whether failing tests can be skipped, whether
RLS may be weakened, or whether device-control paths may be merged.

### 4. Playwright — Loop Coverage

**Used for:** end-to-end coverage of the One-Tent Loop. Any change that
touches Quick Log, Timeline, Sensor Snapshot, AI Doctor, Alert, or the
Action Queue requires Playwright coverage that walks the loop and
asserts:

- No demo data is rendered as live
- No Action Queue item is created without explicit approval
- Stage / sensor source labels are honest (live / manual / demo / stale)

**Not allowed to decide:** whether a missing assertion is "fine for now",
or whether a flaky test may be retried without root-cause. Playwright is
the loop's last honest witness.

### 5. PostHog — Release Measurement

**Used for:** measuring whether each release actually moves the One-Tent
Loop. The first event names are defined in `docs/v0-loop-event-map.md`.
PostHog is **not yet wired**; the event map is the contract, not the
implementation.

**Not allowed to decide:** product direction, safety thresholds, or
whether a feature ships. PostHog reports reality; it does not approve it.

---

## Loop-First Workflow

1. Linear issue is opened against a One-Tent Loop area.
2. Definition of Ready is met (`docs/definition-of-ready-done.md`).
3. Cursor implements the smallest correct change.
4. PR opens with a linked Linear issue, tests, and a safety verdict.
5. Playwright covers the loop slice that changed.
6. CI passes on GitHub. Reviewer approves.
7. Merge. Release notes record what changed, the rollback path, and the
   PostHog events expected to move.

## Hard Stops

These conditions stop work immediately, regardless of velocity pressure:

- Fake live data — demo / mock telemetry rendered without a clear label
- Blind automation — device or workflow actions that run without explicit
  grower approval
- Action Queue bypass — any path that creates, mutates, or completes an
  Action Queue item without **approval-required** semantics
- Business logic in JSX — duplicated rule tables, target ranges, or
  classification thresholds buried in `.tsx`
- Schema / RLS / auth / edge-function changes without an explicit,
  reviewed migration and a security verdict
