# CSV-MULTI-FILE-TZ-HINT-SPEC

```text
TASK CSV-MULTI-FILE-TZ-HINT-SPEC  priority: other  status: OPEN
goal: Land docs/specs/csv-import-multi-file-and-time-zone-hint.md so a builder can pick up multi-file CSV import, a source time zone hint and the stale soil-columns message without guessing.
why: Matthew, 2026-11-12, asked for a spec only (no code), then chose "Open draft PR" to put it in docs/specs. A real Spider Farmer app export arrives as several CSV files per export, the import takes one file per run, and wall-clock timestamps need the grower to pick a zone; a fixed-offset device clock fits America/Regina better than America/Chicago (inference, recorded in the spec with its evidence).
branch: claude/project-thread-db0g22
base: verdant-grow-diary @ c03ea6fd46707dde04eac0d0ef3e7c46db8b6bc8
checkout: git fetch origin claude/project-thread-db0g22 verdant-grow-diary && git switch claude/project-thread-db0g22 && git ls-remote origin claude/project-thread-db0g22  # compare with the PR head before trusting any review
pr: #2957 (marked ready for review by Matthew on 2026-11-12)
head_sha: the commit that last changed this file (a file cannot hold its own SHA). Read it from the PR. First head was 46d64beeffdad65a658948f209e0eab75a9ae052; any review of that head is superseded.
state: ready for review; awaiting independent exact-head review
current_step: review routing
next_action: an eligible independent reviewer (see exclusions) reviews the full head; then Matthew's per-item yes and the Merge Steward. Builder seats do not mark ready, enqueue or merge. Implementation is three separate slices, each needing its own claim.
post_merge_check: NOT_APPLICABLE (docs only)
active_writer: Claude session_017UoYKw22N6tm7BDDUdYBQv
decisions:
  - Spec only. No app code, tests, schema, migrations, edge functions or lockfile changes.
  - Three slices that each revert alone: (1) clock-evidence rules and a zone hint that is offered, never auto-applied; (2) multi-file import under one import_batch_id with a file cap and conflicting readings held; (3) soil-columns message copy, renegotiating the pin in src/test/csv-parser-metric-identity.test.ts.
  - Fixtures named in the spec are synthetic with neutral ids (qa-device). No real device serial, room or sensor id is copied into the repo.
  - Replay protection stays the database unique key. The fingerprint replay guard has no production caller and is not wired in, so import, undo, then re-import saves the rows again (fix for an automated review P2 on 2026-11-12).
tried_and_rejected: Etc/GMT+6 as the suggested zone (parses, but the browser picker list has no Etc zones); auto-applying the inferred zone (violates the never-guess rule in csvTimestampRules.ts).
commands: npx --no-install prettier --check docs/specs/csv-import-multi-file-and-time-zone-hint.md docs/agents/handoffs/CSV-MULTI-FILE-TZ-HINT-SPEC.md; node scripts/assert-docs-safety.mjs
files_touched: docs/specs/csv-import-multi-file-and-time-zone-hint.md (new); this file (new)
files_remaining: none for this slice
blockers: none from this change. test:security-db-local failed once at 46d64bee on a runner port collision while starting local Supabase (port 54324 already in use); recheck at the new head.
open_questions: whether Matthew wants slice 1, 2 or 3 built first; the spec proposes 1, then 2, then 3.
gotchas: open draft #2922 touches the CSV import area; the spec's file plan lists the overlap check made on 2026-11-12. Re-check before claiming any implementation slice.
links: none beyond the PR
exclusions_for_review: session_017UoYKw22N6tm7BDDUdYBQv (this writer and spec author)
reviewer_seat: not requested
reviewer_sha: none yet
session_state: no production access used. PR activity subscription held by session_017UoYKw22N6tm7BDDUdYBQv.
claimed_by: Claude session_017UoYKw22N6tm7BDDUdYBQv, 2026-11-12
owner: Claude
last_updated: 2026-11-12, by Claude session_017UoYKw22N6tm7BDDUdYBQv
```
