# TIMELINE-KEYSET-TIE-CURSOR

```text
TASK TIMELINE-KEYSET-TIE-CURSOR  priority: P2  status: CLOSED
goal: Timeline "Load older" reaches every diary row, including rows that share the oldest loaded row's entry_at.
why: Deep audit 2026-11-05 at deploy tip e4c2fc02dda02d28bab3529f62ba311df6570a57, finding F-01. The keyset filter was `entry_at < cursor` while the page is ordered (entry_at desc, id desc); rows tied on entry_at that the 100-row limit cut off were never fetched, and when every remaining row shared that timestamp "Load older" returned nothing while the count still said more existed. Ties are realistic: the Quick Log mirror stores the grower's minute-precision reading time as entry_at (quicklog_save_manual delegate, v_occurred).
branch: claude/new-session-mhz52l
base: verdant-grow-diary
checkout: git fetch origin claude/new-session-mhz52l verdant-grow-diary && git switch claude/new-session-mhz52l
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2890 (readied 09:48 UTC, enqueued 10:39 UTC and merged by cheekhimself)
head_sha: db03b95f12bedd0e0f7858977fe908ab51d7dc81 (final PR head; code commit eda848e752142ed011ecc031d66382d7022cab39, CI repair db03b95f)
state: CLOSED. Merged as 92dfd00de5d10f101a4af77f09810c8fe5411666 (#2890) on 2026-11-05T10:46:15Z through the merge queue. Closed 2026-11-05 by Claude session_017UoYKy4m7tV5CyJMwrFb2X (the slice author and repairer) in the closure PR named on GitHub; no code changed after db03b95f.
current_step: Full test suite (shard 12/32) failed at 43231dc8454a56faeec9958015f6a77da5f8c9b6 on timeline-load-older-sensor-siblings (its client mock had no or() and detected the older page by op lt). A local sweep of the 45 Timeline-rendering and Load-older tests found two more pinned the same way (timeline-removal-pagination-interleaving, timeline-page-read-state). All three renegotiated: mock gains or(), older page detected by op or, the interleaving cursor is read from the or() string. 45 files / 285 tests pass locally. Required contexts at db03b95f: ci.yml run 42006890296 success; check_suite.completed reported nothing failed at 10:26 UTC. Codex code and security reviews completed with no findings (informational, not independent acceptance). Merged.
next_action: none; closed. The post_merge_check below still applies to its recorded owner once live /version.json reports 92dfd00d or later.
post_merge_check: on https://verdantgrowdiary.com, in a grow with more than 100 diary entries where several share one reading time at the page edge, "Load older entries" loads them and the control clears. NOT_MEASURED until live /version.json reports the merge SHA.
active_writer: Claude session_017UoYKy4m7tV5CyJMwrFb2X
decisions: Composite keyset (entry_at, id) expressed as one PostgREST or() filter with double-quoted values, mirroring useTentIrrigationLedger.ts. Pure helpers isOlderThanCursor and filterOlderThanCursor live in src/lib/timelineQueryOrderRules.ts next to orderNewestFirstStable. projectTimelineDiaryPage keeps oldestFetchedEntryAt (existing pins) and adds oldestFetchedCursor. No schema change.
tried_and_rejected: a client-side backfill of tied rows after each page (would hide the predicate defect instead of fixing it).
commands: bunx vitest run src/test/timeline-keyset-cursor-ties.test.ts src/test/timeline-quicklog-dedupe-pagination.test.tsx src/test/timeline-local-day-query-integration.test.tsx src/test/timeline-load-older-sensor-siblings.test.tsx src/test/timeline-removal-pagination-interleaving.test.tsx src/test/timeline-page-read-state.test.tsx src/test/timeline-stable-order.test.ts --reporter=dot; NODE_OPTIONS=--max-old-space-size=8192 bun run typecheck; node scripts/scorer-lock.mjs --report --strict
files_touched: src/lib/timelineQueryOrderRules.ts; src/lib/timelineQuickLogPlaceholderDedupeRules.ts; src/pages/Timeline.tsx; src/test/timeline-keyset-cursor-ties.test.ts (new, RED before the fix: 5 of 6 failing); src/test/timeline-quicklog-dedupe-pagination.test.tsx (renegotiated: query mock gains or(), empty-page expectation gains oldestFetchedCursor); src/test/timeline-local-day-query-integration.test.tsx (renegotiated: query mock gains or(), keyset page detected by op "or"); src/test/timeline-load-older-sensor-siblings.test.tsx, src/test/timeline-page-read-state.test.tsx (renegotiated the same way after shard 12/32 failed); src/test/timeline-removal-pagination-interleaving.test.tsx (renegotiated: mock gains or(), the captured cursor is the first quoted entry_at inside the or() string); docs/agents/handoffs/TIMELINE-KEYSET-TIE-CURSOR.md
files_remaining: none for this slice
blockers: none
open_questions: none
gotchas: All five renegotiated tests are locked scorers; any Timeline test whose client mock lacks or() and clicks Load older will fail the same way; the unlock was declared with scripts/scorer-lock.mjs and the PR body must name them. Commit with NODE_OPTIONS=--max-old-space-size=8192; never --no-verify. Do not whole-file-format Timeline.tsx beyond the touched hunks.
links: audit report in the authoring session's scratchpad (not in the repository); audit finding F-01
artifacts: none in the repository besides the test
reviewer_seat: Reviewer C (Durban Poison) [ROUTE] at 43231dc8 (~09:35 UTC) superseded; re-requested at db03b95f ~10:00 UTC (PR comment 6654604365). No GitHub review of any kind was recorded before the merge. cheekhimself enqueued and merged. Independent exact-head PASS at db03b95f: NOT_MEASURED.
reviewer_sha: NOT_MEASURED
session_state: no production access; no Supabase access used
claimed_by: Claude session_017UoYKy4m7tV5CyJMwrFb2X, 2026-11-05 09:05 UTC
owner: Claude
last_updated: 2026-11-05 04:50 CT, by Claude
```
