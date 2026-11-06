# CSV-AUDIT-SPEC-P3-CLOSEOUT

```text
TASK CSV-AUDIT-SPEC-P3-CLOSEOUT  priority: other  status: OPEN
goal: Close the CSV-TARGET-ROWS-AUDIT-SPEC handoff after #2912 merged, and fix the two non-blocking P3s from review 5796150535 (handoff pin wording; a count-only per-pattern query so the shared receipt never needs header text).
why: Matthew, 2026-11-06, assigned this docs-only slice. AGENTS.md §12 requires a merged task's file to be CLOSED the same day with reason and final SHA. P3-2 matters to growers' privacy: the receipt asked for per-pattern counts that only header text (restricted to the console) could give.
branch: claude/csv-audit-spec-p3-closeout
base: verdant-grow-diary @ ac97a03c404ca39fcd198ebd40efe43cb81e5ca9 (#2912 merge)
checkout: git fetch origin claude/csv-audit-spec-p3-closeout verdant-grow-diary && git switch claude/csv-audit-spec-p3-closeout && git ls-remote origin claude/csv-audit-spec-p3-closeout  # compare with the PR head before trusting any review
pr: see the [ROUTE] comment on the draft PR for this branch (opened after the first push; a file cannot hold its own PR link before it exists)
head_sha: the commit that adds this file; a file cannot hold its own SHA. The full head SHA is in the PR's [ROUTE] comment. Verify with git ls-remote.
state: pushed draft; awaiting independent exact-head review
current_step: review routing
next_action: an eligible independent reviewer (see exclusions) reviews the full head; then Matthew's per-item yes and the Merge Steward. Builder seats do not mark ready, enqueue or merge.
post_merge_check: NOT_APPLICABLE for app behavior (docs only). The audit's own receipt stays NOT_MEASURED until an authorized production-read seat runs it.
active_writer: Claude session_017UoYKwTGex9Q7PDBtbQr4L
decisions:
  - Closed CSV-TARGET-ROWS-AUDIT-SPEC with reason merged, final SHA ac97a03c404ca39fcd198ebd40efe43cb81e5ca9 (merged 2026-11-06 05:54:02 UTC from approved head f826f5fc826f4b1b041d6f375c03897ff706207a). Round-3 PASS, 35/35 required checks and Matthew's per-item yes are recorded as given in Matthew's assignment prompt (source claim, 2026-11-06); review 5796150535 itself was re-read through the GitHub API (PASS, commit_id f826f5fc).
  - P3-1: that file's gotchas and post_merge_check now name the pin, isTargetHeader at cc8da1790d35ea0c41a788ce0593d8e4c3c9b9ac (#2911); goal now names #2911 too. Open questions kept unchanged.
  - P3-2: added query 4 (count-only, grouped by pattern; CASE first match in the order target/setpoint, limit/alarm, standalone; same three regexes and same object filter as query 3). Query 3 is unchanged and stays in the restricted console. The receipt now takes per-pattern counts from query 4, and NOT_MEASURED adds a cross-check (sum of header_spellings = query 3 row count when that is under its LIMIT 50).
  - Named it query 4, not 3b, so "each query on its own" and the receipt list stay simple numbered items.
  - Receipt order unchanged: NOT_MEASURED -> NO_DATA -> FAIL (likely) -> BLOCKED: needs owner review -> PASS.
tried_and_rejected: adding a pattern column to query 3 (review's other option): it would still ship header text next to the counts, which is what the console restriction exists to avoid.
commands: scratch only (not committed). In a directory outside the repo: npm init -y && npm i @electric-sql/pglite@0.5.15; a run.mjs that extracts every sql fenced block from docs/audits/csv-target-rows-audit-2026-11-06.md (5 blocks), creates a minimal public.sensor_readings (id, user_id, tent_id, metric, value numeric, captured_at, created_at, source, raw_payload jsonb), inserts the 19 rows listed in the doc's Validation section plus 3 closeout rows (co2_target_alarm=1500, "Alarm SP"=1500, set=22), runs each query separately inside BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY, checks reconciliation and sum(header_spellings)=Q3 rows, tries a DELETE in READ ONLY, then enables RLS with an own-rows policy, SET ROLE to a non-owner, and reruns.
files_touched: docs/audits/csv-target-rows-audit-2026-11-06.md; docs/agents/handoffs/CSV-TARGET-ROWS-AUDIT-SPEC.md; this file (new)
files_remaining: none
blockers: none for the docs. Running the audit needs an authorized production-read seat (Matthew arranging).
open_questions: none new. CSV-TARGET-ROWS-AUDIT-SPEC's open questions carry over unchanged.
gotchas: CSV-LIMIT-THRESHOLD-EXCLUSION.md (#2911) still reads OPEN on the deploy branch; it is another task's file and out of scope here.
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/2912 ; https://github.com/Verdant-OS/verdant-grow-diary/pull/2912#pullrequestreview-5796150535
exclusions_for_review: session_017UoYKwTGex9Q7PDBtbQr4L (this writer), session_017UoYKzFNNTTYztoZNoSbNm, session_017UoYKwtXgN34MaeSUiEsYz, session_017UoYKxr77pq3JU6h2u55dR, session_017UoYKw3LEmpPG6sGFZY4nV
reviewer_seat: requested; see the PR's [ROUTE] comment
reviewer_sha: none yet
session_state: no production access used. Synthetic PGlite only. No live /version.json read this session.
claimed_by: Claude session_017UoYKwTGex9Q7PDBtbQr4L, 2026-11-06 06:15 UTC
owner: Claude
last_updated: 2026-11-06 06:15 UTC, by Claude
```
