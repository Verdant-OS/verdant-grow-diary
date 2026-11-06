# CSV-TARGET-ROWS-AUDIT-SPEC

```text
TASK CSV-TARGET-ROWS-AUDIT-SPEC  priority: P2  status: OPEN
goal: Commit a read-only SQL spec that counts production CSV readings that may hold a grower's target/setpoint value saved as a measurement (the defect #2908 fixed), so an authorized seat can size any correction.
why: Matthew, 2026-11-06: "Yes, separate branch + draft PR" for the audit spec drafted in the CSV-TARGET-SETPOINT-EXCLUSION workstream. Rows saved before #2908 is live may show a desired value as sensor truth in Timeline, Sensor Snapshot, AI Doctor context and alerts.
branch: claude/csv-target-rows-audit-spec
base: verdant-grow-diary @ 01f30d11ad3337c3788e18fc46aae33a871e7677
checkout: git fetch origin claude/csv-target-rows-audit-spec verdant-grow-diary && git switch claude/csv-target-rows-audit-spec
pr: see the draft PR linked from this branch
head_sha: see the branch tip / PR head; verify before resuming
state: draft PR opened; spec committed; SQL validated on synthetic rows only; never run on production
current_step: awaiting independent exact-head review (docs-only)
next_action: route an eligible independent reviewer (not the sessions listed under exclusions); after merge, hand the spec to a seat authorized for production reads and record its receipt in this file
post_merge_check: NOT_APPLICABLE for app behavior (docs only). Audit receipt from an authorized seat after live /version.json reports 01f30d11 or a descendant; NOT_MEASURED until then.
active_writer: Claude session_017UoYKzFNNTTYztoZNoSbNm (successor to session_017UoYKwtXgN34MaeSUiEsYz, which drafted the spec)
decisions:
  - Doc lives at docs/audits/csv-target-rows-audit-2026-11-06.md, next to the other dated audits.
  - Three fixes over the uncommitted draft: (1) filter raw_row to jsonb objects before jsonb_each_text (draft aborted on a string raw_row, reproduced); (2) nested CASE instead of AND before the ::numeric cast (PostgreSQL does not promise AND evaluation order); (3) query 3 made self-contained (a CTE lives for one statement; the draft referenced it from a second statement).
  - Query 2 now counts rows whose raw_row is missing or not an object as UNKNOWN.
  - Added a known limit: one row per (reading, target header) pair, so unrelated metrics from the same file show as target_column_present; read with query 3.
tried_and_rejected: running a local Postgres server (initdb refuses root; the previous session's su postgres was blocked by a hook and is not worked around). Used PGlite in the session scratchpad instead; nothing added to the repo.
commands: node <scratchpad>/pgl/run.mjs docs/audits/csv-target-rows-audit-2026-11-06.md (synthetic fixture, nine labeled rows, plus a 24-header regex parity check against isTargetHeader); the same script on the original draft reproduces the jsonb_each_text abort.
files_touched: docs/audits/csv-target-rows-audit-2026-11-06.md (new); this file (new)
files_remaining: none
blockers: none for the doc. Running the audit needs an authorized production-read seat.
open_questions: (0) which seat runs it and when (Matthew). (1) PR #2911 (another session) widens the CSV matcher to limit/alarm/threshold; those columns stay out of this audit's scope. (2) PR #2909 (Codex, draft) proposes CSV batch undo; this spec does not authorize using it for corrections.
gotchas: the matcher must match isTargetHeader at the live head when the audit runs.
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/2908 (fix, merged as 01f30d11); docs/agents/handoffs/CSV-TARGET-SETPOINT-EXCLUSION.md; docs/production-only-verification-runbook.md
exclusions_for_review: session_017UoYKzFNNTTYztoZNoSbNm, session_017UoYKwtXgN34MaeSUiEsYz, session_017UoYKypTBCTMSkumzPzSJa, session_017UoYKxhRUChV9czUzAnUtU
reviewer_seat: none yet
reviewer_sha: none
session_state: no production access used. GitHub writes this session: [ROUTE] on #2910, this branch and its draft PR. Reviewer session for #2910: session_017UoYKvVrtqJx54Bya2anW5.
claimed_by: Claude session_017UoYKzFNNTTYztoZNoSbNm, 2026-11-06 03:00 UTC
owner: Claude
last_updated: 2026-11-06 03:00 UTC, by Claude
```
