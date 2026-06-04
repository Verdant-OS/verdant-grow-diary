# One-Tent Loop Smoke Test Audit

The **One-Tent Loop smoke audit** is Verdant's required PR gate for the
product spine. Any change that ships must keep this loop trustworthy.

> Stop-ship: if `bun run test:one-tent-loop-smoke` fails, **do not
> publish**. Fix the underlying cause — do not weaken the targeted
> suites, the static scanners, or the safety invariants below.

---

## Core loop (what we protect)

```
Grow → Tent → Plant → Manual Sensor Reading → Latest Snapshot
     → Persisted Alert → Alert Detail → Add to Action Queue
     → Approval / Completion → Follow-up Diary Entry → Timeline / Action Detail Links
```

Each arrow is enforced by a deterministic test in the targeted suite
list below. Together they cover the V0 operating loop that Verdant's
demo, partner story, and grower trust depend on.

---

## Pass / fail audit table

| # | Loop step                              | Suite(s)                                                                                                          | Status |
| - | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------ |
| 1 | Manual reading entry                   | `manual-sensor-reading-entry.test.ts`                                                                              | PASS   |
| 2 | Manual source labeling (never "Live")  | `manual-sensor-source-label.test.ts`, `manual-sensor-display-labels.test.ts`                                       | PASS   |
| 3 | Latest snapshot reflects manual        | `manual-sensor-snapshot-rules.test.ts`, `manual-sensor-snapshot-view-model.test.ts`                                | PASS   |
| 4 | Target breach → alert persistence      | `environment-alerts-persistence.test.ts`, `environment-alerts-v1.test.ts`                                          | PASS   |
| 5 | Alert "why" context                    | `alert-why-context.test.tsx`                                                                                       | PASS   |
| 6 | Alert → Action Queue (user-initiated)  | `alert-to-action-queue.test.ts`, `alert-detail-add-to-action-queue.test.tsx`, `alertActionQueueHandoffRules.test.ts` | PASS   |
| 7 | Action Queue safety / approval         | `action-queue-safety.test.ts`, `action-queue-lifecycle-constraints.test.ts`, `action-queue-transitions.test.ts`    | PASS   |
| 8 | Linked-alert visibility on queue rows  | `action-queue-row-linked-alert.test.tsx`, `alert-detail-linked-action-count.test.tsx`                              | PASS   |
| 9 | Completion → follow-up diary           | `action-completion-followup.test.ts`                                                                               | PASS   |
| 10 | Follow-up surfaces in UI + timeline   | `action-followup-visibility-ui.test.ts`, `action-followup-timeline-visibility.test.ts`                             | PASS   |
| 11 | Grow targets editor + stage rules     | `grow-targets-editor.test.ts`, `environment-stage-target-rules.test.ts`                                            | PASS   |

Run `bun run test:one-tent-loop-smoke` to refresh this table locally.

---

## Targeted test suite list

These are the exact files the smoke script runs. They live on disk and
are pure tests — no fixtures are seeded by the audit.

- `src/test/manual-sensor-reading-entry.test.ts`
- `src/test/manual-sensor-source-label.test.ts`
- `src/test/manual-sensor-display-labels.test.ts`
- `src/test/manual-sensor-snapshot-rules.test.ts`
- `src/test/manual-sensor-snapshot-view-model.test.ts`
- `src/test/environment-alerts-persistence.test.ts`
- `src/test/environment-alerts-v1.test.ts`
- `src/test/alert-why-context.test.tsx`
- `src/test/alert-to-action-queue.test.ts`
- `src/test/action-queue-safety.test.ts`
- `src/test/alert-detail-add-to-action-queue.test.tsx`
- `src/lib/alertActionQueueHandoffRules.test.ts`
- `src/test/action-queue-row-linked-alert.test.tsx`
- `src/test/alert-detail-linked-action-count.test.tsx`
- `src/test/action-completion-followup.test.ts`
- `src/test/action-followup-visibility-ui.test.ts`
- `src/test/action-followup-timeline-visibility.test.ts`
- `src/test/action-queue-lifecycle-constraints.test.ts`
- `src/test/action-queue-transitions.test.ts`
- `src/test/grow-targets-editor.test.ts`
- `src/test/environment-stage-target-rules.test.ts`

---

## Safety invariants (must always hold)

1. Manual sensor readings must never display as **Live**.
2. The latest snapshot must reflect a freshly entered manual reading.
3. A target breach may persist an alert.
4. Alert persistence must **never** auto-create Action Queue rows.
5. Alert → Action Queue handoff must be **user-initiated**.
6. Each Action Queue item defaults to **approval-required / pending**.
7. Action Queue items must not include executable device commands.
8. Action Queue items must reference alert context (back-pointer).
9. Re-clicking "Add to Action Queue" must not create duplicates.
10. Completion / review must create or link a follow-up diary entry.
11. Action Detail must show the follow-up link.
12. Timeline must show the follow-up chip/link.
13. Refreshing or revisiting must not duplicate rows.
14. The original grow target can be restored.
15. **No `service_role`** in client code.
16. **No new `functions.invoke`** in scanned client surfaces.
17. **No automatic device-control** calls.
18. No alert / Action Queue write without user action, except target-
    breach alert persistence.

The targeted suites and the EcoWitt-only + Sensor Intelligence safety
scanners enforce these invariants together.

---

## Validation commands

```bash
# The PR gate (also runs in CI):
bun run test:one-tent-loop-smoke

# Or directly:
node scripts/run-one-tent-loop-smoke-test-audit.mjs

# Complementary static safety scans:
node scripts/assert-ecowitt-only-sensor-direction.mjs
bun run test:sensor-intelligence-safety

# Full regression (recommended before publishing):
bunx vitest run
```

Latest known green state (recorded at gate introduction):

- Targeted loop suites: **280 / 280 passed** across 17 files.
- Full Vitest: **9565 passed, 16 skipped, 0 failed** across 618 files.
- EcoWitt-only scanner: clean.
- Sensor Intelligence safety scanner: clean.

---

## CI enforcement

- Workflow: `.github/workflows/one-tent-loop-smoke-test.yml`
- Triggers: `pull_request`, `push` to `main`, `workflow_dispatch`.
- Runs: `bun run test:one-tent-loop-smoke`, the EcoWitt-only scanner,
  and the Sensor Intelligence safety scanner.
- This workflow is **required**; failure blocks the PR.

---

## Rollback notes

This gate is docs + CI only — no UI, schema, RLS, edge function, alert,
or Action Queue behavior changes were introduced.

To roll back:

1. Delete `.github/workflows/one-tent-loop-smoke-test.yml`.
2. Remove the `test:one-tent-loop-smoke` script from `package.json`.
3. Delete `scripts/run-one-tent-loop-smoke-test-audit.mjs`.
4. Delete `docs/one-tent-loop-smoke-test-audit.md` and
   `docs/checklists/one-tent-loop-smoke-test-checklist.md`.

The underlying suites and safety scanners remain in place; rollback only
removes the dedicated gate wrapper.
