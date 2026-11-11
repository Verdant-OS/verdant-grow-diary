# TIMELINE-PAGED-HISTORY-TRUTH

```text
TASK TIMELINE-PAGED-HISTORY-TRUTH  priority: P2  status: OPEN
goal: Timeline keeps the older pages a grower already loaded when a save refreshes the newest page, counts a deletion made from the edit dialog, and says when the activity history panels hold fewer Quick Log events than exist.
why: Repository audit 2026-11-11 at c03ea6fd46707dde04eac0d0ef3e7c46db8b6bc8 (session chat, Matthew chose this slice). Three confirmed defects in src/pages/Timeline.tsx: (1) the verdant:entry-created listener calls load(), which replaced the loaded rows and cursor with page one; (2) EntryEditDialog onDeleted filtered rows but left entriesTotal, so "Load older entries (N more)" read one too high; (3) grow_events is read with .limit(100) and nothing disclosed it.
branch: claude/brave-fermat-u06ig6
base: verdant-grow-diary
checkout: git fetch origin claude/brave-fermat-u06ig6 verdant-grow-diary && git switch claude/brave-fermat-u06ig6
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2934 (draft)
head_sha: code at 805acc402414892a37945abd5c0ecc472d6f9819 (2026-11-11 19:01 UTC); a docs-only commit recording this PR link follows it, so read the current head from the PR
state: implemented, local tests green, pushed draft
current_step: draft PR open, required CI and independent review pending
next_action: route one independent exact-head review (docs/agents/OWNERSHIP.md section 4.3) once the required checks are green at the PR head
post_merge_check: after live /version.json reports the merge SHA, on the disposable fixture grow: open Timeline, press "Load older entries", save one Quick Log note tagged [smoke <timestamp>], and confirm the older entries are still listed. NOT_MEASURED until then.
active_writer: Claude session_017UoYKvCNSMryxiQZyBbit8
decisions: (0) Review fix 2026-11-11 (Codex P2 on 3e20d9a8): older pages are kept only when the refreshed page reaches a row already loaded; if more than a page of rows arrived in between, the refresh replaces everything so no row is skipped. (1) One pure module src/lib/timelinePagedHistoryRules.ts holds the merge and the notice copy; Timeline stays the caller. (2) Older pages are kept only for the same read key (owner, grow, date range) and only when the previous read reached strictly past the refreshed page; rows inside the refreshed page always come from the refresh. (3) The server count is discounted by the hidden rows still off the refreshed page, tracked by id and entry_at, so the #2094 "nothing left to load" control does not return. (4) grow_events gets a disclosure, not a pager: the notice names loaded and total and points at the existing date range filter. (5) The two ref resets in load()'s clear branches sit after setLoading(false) because src/test/timeline-alert-events.test.ts pins a 500-character window from the guard to setAlertEvents; no pin was changed.
tried_and_rejected: resetting the refs at the top of the clear branch (broke the pinned window above); a grow_events keyset pager (larger change across the history panels; candidate follow-up).
remaining_limit: a kept older row that was deleted on another device stays on screen until a scope or date-range change reloads the page. The activity panels still hold only the newest 100 events.
commands: bunx vitest run src/test/timeline-paged-history-truth.test.tsx --reporter=dot ; bun run typecheck:tsgo ; bunx eslint src/pages/Timeline.tsx src/lib/timelinePagedHistoryRules.ts src/test/timeline-paged-history-truth.test.tsx
files_touched: src/pages/Timeline.tsx; src/lib/timelinePagedHistoryRules.ts (new); src/test/timeline-paged-history-truth.test.tsx (new); docs/agents/handoffs/TIMELINE-PAGED-HISTORY-TRUTH.md (new)
files_remaining: none for this slice
blockers: none
open_questions: none
gotchas: `bun run typecheck` (tsc) ran out of heap at Node's default in the authoring container; it passes with NODE_OPTIONS=--max-old-space-size=8192, and tsgo passes in 17 s. The pre-commit hook runs tsc, so export that variable before committing.
links: none besides the PR
artifacts: the test file above
reviewer_seat: none routed yet
reviewer_sha: none
session_state: PR activity subscription held by the authoring session; no routines, no paused workflows; pending human decisions: review routing and the per-item merge yes
claimed_by: Claude session_017UoYKvCNSMryxiQZyBbit8, 2026-11-11 19:00 UTC
owner: Claude session_017UoYKvCNSMryxiQZyBbit8
last_updated: 2026-11-11 14:10 CT, by Claude session_017UoYKvCNSMryxiQZyBbit8
```
