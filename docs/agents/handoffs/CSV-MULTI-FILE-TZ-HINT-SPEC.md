# CSV-MULTI-FILE-TZ-HINT-SPEC

```text
TASK CSV-MULTI-FILE-TZ-HINT-SPEC  priority: other  status: CLOSED
closed: merged. #2957 merged 2026-11-12 12:04:05 UTC as 5b0eca2ebbb0dfb39bc048e80c33cc9ed8e4a277 (final SHA) from head df041b4bafe04f6986d7c829343c8f2f0d999c0c, merged_by cheekhimself (a two-parent merge commit; parents e2cd593 and df041b4). Closed by Claude session_017UoYKw22N6tm7BDDUdYBQv the same day under Matthew's standing instruction of 2026-11-12 to handle work that needs no sign-in, approval or secret.
goal: Land docs/specs/csv-import-multi-file-and-time-zone-hint.md so a builder can pick up multi-file CSV import, a source time zone hint and the stale soil-columns message without guessing.
why: Matthew, 2026-11-12, asked for a spec only (no code), then chose "Open draft PR" to put it in docs/specs. A real Spider Farmer app export arrives as several CSV files per export, the import takes one file per run, and wall-clock timestamps need the grower to pick a zone; a fixed-offset device clock fits America/Regina better than America/Chicago (inference, recorded in the spec with its evidence).
branch: claude/project-thread-db0g22
base: verdant-grow-diary @ c03ea6fd46707dde04eac0d0ef3e7c46db8b6bc8
checkout: git fetch origin claude/project-thread-db0g22 verdant-grow-diary && git switch claude/project-thread-db0g22 && git ls-remote origin claude/project-thread-db0g22  # compare with the PR head before trusting any review
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2957 (merged 2026-11-12 12:04:05 UTC, merged_by cheekhimself)
head_sha: df041b4bafe04f6986d7c829343c8f2f0d999c0c (final PR head, read from GitHub 2026-11-12). Merged as 5b0eca2ebbb0dfb39bc048e80c33cc9ed8e4a277 on verdant-grow-diary. First head 46d64beeffdad65a658948f209e0eab75a9ae052 is superseded.
state: merged (5b0eca2). Docs only; nothing ships to the live site.
current_step: done. At df041b4: APPROVED by VReviewer (review 5872812616) and by matt816cheek-bit (review 5873311609). Required-check results at df041b4 and VReviewer's session/role record were not re-read by the closing session (NOT_MEASURED here).
next_action: none for this spec. Implementation is three separate slices, each needing its own claim and handoff file; the spec proposes slice 1 (time zone hint) first.
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
blockers: none. (test:security-db-local failed once at 46d64bee on a runner port collision; superseded by later heads.)
open_questions: whether Matthew wants slice 1, 2 or 3 built first; the spec proposes 1, then 2, then 3.
gotchas: open draft #2922 touches the CSV import area; the spec's file plan lists the overlap check made on 2026-11-12. Re-check before claiming any implementation slice.
links: none beyond the PR
exclusions_for_review: session_017UoYKw22N6tm7BDDUdYBQv (this writer and spec author)
reviewer_seat: VReviewer (GitHub account; seat and session not recorded here)
reviewer_sha: df041b4bafe04f6986d7c829343c8f2f0d999c0c APPROVED (review 5872812616)
session_state: no production access used. PR activity subscription ended at merge.
claimed_by: none (closed). Earlier: Claude session_017UoYKw22N6tm7BDDUdYBQv, 2026-11-12
owner: Claude
last_updated: 2026-11-12, by Claude session_017UoYKw22N6tm7BDDUdYBQv (closeout)
```
