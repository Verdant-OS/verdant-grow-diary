# TENT-CARD-READING-TILES-MISSING-20261123

```text
TASK TENT-CARD-READING-TILES-MISSING-20261123  priority: P3  status: OPEN
goal: on the dashboard tent card (field notebook), a reading tile with no reading says "Missing" instead of a bare "—", matching the tent panel right under it.
why: live check 2026-11-23 ~14:52 UTC on build ab8826ac with a fresh Free test account: after onboarding, TEMP, RH, VPD and PPFD tiles each showed "—" while the Tent 1 panel below said "Missing". Matthew picked "Open fix" on 2026-11-23 14:54 UTC.
diagnosis: src/lib/fieldNotebookViewModel.ts formatReadingValue returns FIELD_NOTEBOOK_READING_MISSING ("—") for a null or blank value; src/components/FieldNotebook.tsx renders it as the tile value.
fix: client copy only. New FIELD_NOTEBOOK_READING_ABSENT = "Missing" in fieldNotebookViewModel.ts; formatReadingValue returns it for null or blank values. Zero stays a real value. FIELD_NOTEBOOK_READING_MISSING ("—") is unchanged and still used as the provenance fallback under a present value with no source or age (out of scope here).
branch: claude/project-thread-vjgpfg
base: verdant-grow-diary at fa3f084cc963fdb417c9172a9d8e0e7ae03eea31
pr: pending
state: test-first commit pushed for RED proof on CI
next_action: get CI RED on the new test, push the fix, get 35/35 required checks green, route one Reviewer A, D or C review at the exact head.
post_merge_check: once live /version.json reports the merged SHA, a tent with no readings shows "Missing" in all four tiles on the dashboard tent card; a tent with a reading still shows the value and its source line.
decisions: (1) Keep "—" for the provenance fallback: under a real value "Missing" would wrongly read as the reading being absent. (2) VPD withheld because TEMP and RH were not captured together also shows "Missing", since no paired VPD exists; the tent panel below uses the same word.
not_in_scope: provenance fallback dash; Dashboard.tsx tent panel (PR #3049 edits it); schema, RLS, auth, edge, migrations, billing.
tests: new src/test/field-notebook-reading-tile-missing.test.tsx (3 tests).
commands: bunx vitest run src/test/field-notebook-reading-tile-missing.test.tsx src/test/field-notebook-outcome-rules.test.ts --reporter=dot ; bun run typecheck
files_touched: src/lib/fieldNotebookViewModel.ts; src/test/field-notebook-reading-tile-missing.test.tsx; this file
files_remaining: none
gotchas: local bun install 403s on the lovable-core-prod mirror in this cloud box, so local vitest, typecheck, lint and build are BLOCKED; CI is the evidence. CI on drafts runs by workflow_dispatch. Do not regenerate bun.lock.
blockers: local checks BLOCKED as above.
reviewer_seat: one eligible Reviewer A, D or C session that did not author or repair this change
reviewer_sha: none yet
session_state: no routines, no paused workflows. Pending human decision: none until review.
claimed_by: Claude thread session (onboarding friction B1-B4), 2026-11-23 15:00 UTC
owner: Claude thread session (onboarding friction B1-B4)
last_updated: 2026-11-23 15:00 UTC, by Claude thread session (onboarding friction B1-B4)
```
