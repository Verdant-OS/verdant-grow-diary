# TIMELINE-KEYSET-TIE-CURSOR

```text
TASK TIMELINE-KEYSET-TIE-CURSOR  priority: P2  status: OPEN
goal: Timeline "Load older" reaches every diary row, including rows that share the oldest loaded row's entry_at.
why: Deep audit 2026-11-05 at deploy tip e4c2fc02dda02d28bab3529f62ba311df6570a57, finding F-01. The keyset filter was `entry_at < cursor` while the page is ordered (entry_at desc, id desc); rows tied on entry_at that the 100-row limit cut off were never fetched, and when every remaining row shared that timestamp "Load older" returned nothing while the count still said more existed. Ties are realistic: the Quick Log mirror stores the grower's minute-precision reading time as entry_at (quicklog_save_manual delegate, v_occurred).
branch: claude/new-session-mhz52l
base: verdant-grow-diary
checkout: git fetch origin claude/new-session-mhz52l verdant-grow-diary && git switch claude/new-session-mhz52l
pr: NOT_MEASURED (not pushed; the founder's hold on GitHub posting from the audit assignment is still in force)
head_sha: NOT_MEASURED (local commit only; no remote head)
state: implemented / local only
current_step: awaiting the founder's word that the GitHub posting hold is lifted before the first push and draft PR.
next_action: on that word, `git push -u origin claude/new-session-mhz52l`, open a draft PR whose body names the two renegotiated checks (below) and this entry, then route an independent reviewer under OWNERSHIP.md §4.3.
post_merge_check: on https://verdantgrowdiary.com, in a grow with more than 100 diary entries where several share one reading time at the page edge, "Load older entries" loads them and the control clears. NOT_MEASURED until live /version.json reports the merge SHA.
active_writer: Claude session_017UoYKy4m7tV5CyJMwrFb2X
decisions: Composite keyset (entry_at, id) expressed as one PostgREST or() filter with double-quoted values, mirroring useTentIrrigationLedger.ts. Pure helpers isOlderThanCursor and filterOlderThanCursor live in src/lib/timelineQueryOrderRules.ts next to orderNewestFirstStable. projectTimelineDiaryPage keeps oldestFetchedEntryAt (existing pins) and adds oldestFetchedCursor. No schema change.
tried_and_rejected: a client-side backfill of tied rows after each page (would hide the predicate defect instead of fixing it).
commands: bunx vitest run src/test/timeline-keyset-cursor-ties.test.ts src/test/timeline-quicklog-dedupe-pagination.test.tsx src/test/timeline-local-day-query-integration.test.tsx src/test/timeline-stable-order.test.ts --reporter=dot; NODE_OPTIONS=--max-old-space-size=8192 bun run typecheck; node scripts/scorer-lock.mjs --report --strict
files_touched: src/lib/timelineQueryOrderRules.ts; src/lib/timelineQuickLogPlaceholderDedupeRules.ts; src/pages/Timeline.tsx; src/test/timeline-keyset-cursor-ties.test.ts (new, RED before the fix: 5 of 6 failing); src/test/timeline-quicklog-dedupe-pagination.test.tsx (renegotiated: query mock gains or(), empty-page expectation gains oldestFetchedCursor); src/test/timeline-local-day-query-integration.test.tsx (renegotiated: query mock gains or(), keyset page detected by op "or"); docs/agents/handoffs/TIMELINE-KEYSET-TIE-CURSOR.md
files_remaining: none for this slice
blockers: GitHub posting hold (founder). Only Matthew can lift it.
open_questions: none
gotchas: Both renegotiated tests are locked scorers; the unlock was declared with scripts/scorer-lock.mjs and the PR body must name them. Commit with NODE_OPTIONS=--max-old-space-size=8192; never --no-verify. Do not whole-file-format Timeline.tsx beyond the touched hunks.
links: audit report in the authoring session's scratchpad (not in the repository); audit finding F-01
artifacts: none in the repository besides the test
reviewer_seat: not requested
reviewer_sha: NOT_MEASURED
session_state: no production access; no Supabase access used
claimed_by: Claude session_017UoYKy4m7tV5CyJMwrFb2X, 2026-11-05 09:05 UTC
owner: Claude
last_updated: 2026-11-05 03:05 CT, by Claude
```
