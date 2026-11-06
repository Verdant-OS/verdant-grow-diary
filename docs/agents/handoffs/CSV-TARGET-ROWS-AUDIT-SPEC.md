# CSV-TARGET-ROWS-AUDIT-SPEC

```text
TASK CSV-TARGET-ROWS-AUDIT-SPEC  priority: P2  status: OPEN
goal: Commit a read-only SQL spec that counts production CSV readings that may hold a grower's target/setpoint value saved as a measurement (the defect #2908 fixed), so an authorized seat can size any correction.
why: Matthew, 2026-11-06: "Yes, separate branch + draft PR" for the audit spec drafted in the CSV-TARGET-SETPOINT-EXCLUSION workstream. Rows saved before #2908 is live may show a desired value as sensor truth in Timeline, Sensor Snapshot, AI Doctor context and alerts.
branch: claude/csv-target-rows-audit-spec
base: verdant-grow-diary @ 01f30d11ad3337c3788e18fc46aae33a871e7677
checkout: git fetch origin claude/csv-target-rows-audit-spec verdant-grow-diary && git switch claude/csv-target-rows-audit-spec && git ls-remote origin claude/csv-target-rows-audit-spec  # compare with the PR head before trusting any review
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2912 (opened as draft; marked ready for review by cheekhimself 2026-11-06 05:02 UTC)
head_sha: round 1 = 25ccd2b0b26e2f877b122a880148855094995f8e (reviewed, REQUEST_CHANGES). Round 2 = the commit that adds this line; a file cannot hold its own SHA, so the full round-2 SHA is in the round-2 [ROUTE] comment on #2912. Verify with git ls-remote before resuming.
state: round 2 pushed, addressing every finding from review 5795571360 (1 P2, 4 P3) and Codex review 5795979609 (P1 head SHA, P2 derived VPD). SQL validated on synthetic rows only; never run on production.
current_step: awaiting a fresh independent exact-head review of round 2 (round-1 verdict is superseded by the new head)
next_action: route an eligible independent reviewer (not the sessions listed under exclusions); after merge, hand the spec to a seat authorized for production reads and record its receipt in this file
post_merge_check: NOT_APPLICABLE for app behavior (docs only). Audit receipt from an authorized seat after live /version.json reports 01f30d11 or a descendant; NOT_MEASURED until then.
active_writer: Claude session_017UoYKzFNNTTYztoZNoSbNm (successor to session_017UoYKwtXgN34MaeSUiEsYz, which drafted the spec)
decisions:
  - Doc lives at docs/audits/csv-target-rows-audit-2026-11-06.md, next to the other dated audits.
  - Three fixes over the uncommitted draft: (1) filter raw_row to jsonb objects before jsonb_each_text (draft aborted on a string raw_row, reproduced); (2) nested CASE instead of AND before the ::numeric cast (PostgreSQL does not promise AND evaluation order); (3) query 3 made self-contained (a CTE lives for one statement; the draft referenced it from a second statement).
  - Query 2 now counts rows whose raw_row is missing or not an object as UNKNOWN.
  - Round 2 (review P2-1): new query 0 (denominator, run_as, bypasses_rls). Each query runs alone and each result set is recorded, because some SQL tools return only the last statement. Receipt order: NOT_MEASURED (missing or errored result, or no RLS bypass), then NO_DATA (0 csv rows), then FAIL (likely_saved_target), then NEEDS_REVIEW (anything else found, or unknown rows), then PASS (only with a nonzero denominator, RLS bypass, and empty queries 1 and 2).
  - Round 2 (P3s): an empty raw_row {} counts as unknown in query 2; query 1 gives one verdict per reading (no double count); same-metric header heuristic separates likely_saved_target, same_metric_target_present and other_metric_target_only.
  - Round 2 (Codex P2, verified at csvParser.ts:358): derived VPD was computed from imported temperature and humidity, so vpd_kpa rows with vpd_source='derived' count as same-metric when a temperature or humidity target header is present.
tried_and_rejected: running a local Postgres server (initdb refuses root; the previous session's su postgres was blocked by a hook and is not worked around). Used PGlite in the session scratchpad instead; nothing added to the repo.
commands: the validation script is not committed (scratch only). To rebuild it: npm i @electric-sql/pglite in a scratch directory outside the repo; create the minimal table and the 13 labeled rows listed under the doc's Validation section; extract each sql fenced block from the doc and run it separately; then run a DELETE inside BEGIN TRANSACTION READ ONLY (it must be refused); then enable RLS with a non-owner own-rows policy, SET ROLE, and rerun (expect bypasses_rls=false and 0 rows). Header parity: compare the SQL regex with isTargetHeader on a header list, after normalizeHeader (BOM strip, lowercase, trim).
files_touched: docs/audits/csv-target-rows-audit-2026-11-06.md (new); this file (new)
files_remaining: none
blockers: none for the doc. Running the audit needs an authorized production-read seat.
open_questions: (0) which seat runs it and when (Matthew). (1) PR #2911 (another session) widens the CSV matcher to limit/alarm/threshold; those columns stay out of this audit's scope. (2) PR #2909 (Codex, draft) proposes CSV batch undo; this spec does not authorize using it for corrections.
gotchas: the matcher must match isTargetHeader at the live head when the audit runs.
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/2908 (fix, merged as 01f30d11); docs/agents/handoffs/CSV-TARGET-SETPOINT-EXCLUSION.md; docs/production-only-verification-runbook.md
exclusions_for_review: session_017UoYKzFNNTTYztoZNoSbNm, session_017UoYKwtXgN34MaeSUiEsYz, session_017UoYKypTBCTMSkumzPzSJa, session_017UoYKxhRUChV9czUzAnUtU
reviewer_seat: round 1: Claude review session session_017UoYKxr77pq3JU6h2u55dR (ROUTE https://github.com/Verdant-OS/verdant-grow-diary/pull/2912#issuecomment-6676447953), review 5795571360, filed as COMMENT because the shared account cannot request changes on its own PR; also Codex bot review 5795979609 (automated, not independent acceptance)
reviewer_sha: 25ccd2b0b26e2f877b122a880148855094995f8e REQUEST_CHANGES (superseded by round 2)
session_state: no production access used. GitHub writes this session: [ROUTE] on #2910, this branch and its draft PR. Reviewer session for #2910: session_017UoYKvVrtqJx54Bya2anW5 (PASS at 10db4310). #2908 live: /version.json reported 01f30d11 on 2026-11-06 (read only). Live CSV smoke: NOT_MEASURED, awaiting Matthew's Claude-in-Chrome report.
claimed_by: Claude session_017UoYKzFNNTTYztoZNoSbNm, 2026-11-06 03:00 UTC
owner: Claude
last_updated: 2026-11-06 05:20 UTC, by Claude
```
