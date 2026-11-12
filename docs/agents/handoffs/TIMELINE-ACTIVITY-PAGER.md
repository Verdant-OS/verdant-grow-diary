# TIMELINE-ACTIVITY-PAGER

```text
TASK TIMELINE-ACTIVITY-PAGER  priority: P2  status: OPEN
goal: A grower can load Quick Log activity older than the newest 100 events on the Timeline, a page at a time, and a save does not throw the loaded activity away.
why: Repository audit 2026-11-11. Timeline reads grow_events once with a 100-row limit. #2934 (TIMELINE-PAGED-HISTORY-TRUTH) made the page say so; it did not let the grower reach the rest except by setting a date range. Matthew asked for the pager next (2026-11-12) and chose "Stack on #2934".
branch: claude/timeline-activity-pager
base: STACKED on claude/brave-fermat-u06ig6 at 761be52fc266d3901c1c8d5dfa22e64f9cc3a9ce (PR #2934), which is on verdant-grow-diary at c03ea6fd46707dde04eac0d0ef3e7c46db8b6bc8. The PR targets verdant-grow-diary, so its diff includes #2934's commits until #2934 merges.
checkout: git fetch origin claude/timeline-activity-pager && git switch claude/timeline-activity-pager
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2951 (draft)
head_sha: code at a7aa915a42c006427f56b638b1deba9fe8fed562 (2026-11-12); a docs-only commit recording this PR link follows it, so read the current head from the PR
state: implemented, local checks green, pushed draft
current_step: draft PR open; required CI runs once it is marked ready
next_action: wait for #2934 to merge, then merge verdant-grow-diary into this branch (no rebase) so the diff shrinks to this slice; then mark ready on the owner's word and route one independent exact-head review. If #2934 changes, merge its branch in first.
post_merge_check: after live /version.json reports the merge SHA, on the disposable fixture grow with more than 100 Quick Log events: open /timeline, confirm the notice names both numbers, press "Load older activity" and confirm the count rises and older watering, feeding or note rows appear in the history panels. Read-only. NOT_MEASURED until then.
active_writer: Claude session_017UoYKvCNSMryxiQZyBbit8
decisions: (1) Keyset paging on (occurred_at, id) with the existing filterOlderThanCursor and orderNewestFirstStable helpers, inside the applied date bounds, 100 rows a page, is_deleted = false like the first page. (2) The cursor is computed from the loaded rows, not stored, so it cannot drift from them. (3) A same-scope refresh keeps older activity only when the refreshed newest page reaches a loaded row; this reuses mergeTimelineRefreshedFirstPage through a thin adapter. (4) An empty older page ends paging: the total drops to what is loaded. (5) Notice copy now ends "Load older activity, or set a date range."
behavior_change: Timeline shows "Load older activity (N more)" under the activity notice when the server counted more events than are loaded. Pressing it appends up to 100 older events to the history panels. A failed load shows an inline error with "Try again" and leaves the loaded activity as it was.
not_in_scope: the separate 100-row read of environment sensor events (TIMELINE_SENSOR_GROW_EVENT_SELECT); the supplemental by-id linked-event lookup still receives the refreshed first page only; no schema, RPC or RLS change.
scorer_lock: no scorer tracked on verdant-grow-diary is modified. src/test/timeline-paged-history-truth.test.tsx is new in #2934 and extended here.
tests: src/test/timeline-paged-history-truth.test.tsx grew from 15 to 26 tests. RED before the implementation: 13 failed, 13 passed (7 new rule tests, 4 new component tests, 2 notice-copy assertions). After the rules only: 4 failed. After the page wiring: 26 passed. 90 test files that touch the Timeline page: 90 passed, 1014 tests. bun run typecheck:tsgo exit 0; eslint and prettier clean on the three changed source files.
not_measured: a real browser (desktop or 375 px) was not driven for this slice; the control reuses the existing "Load older entries" button classes. Production.
commands: bunx vitest run src/test/timeline-paged-history-truth.test.tsx --reporter=dot ; bun run typecheck:tsgo
files_touched: src/lib/timelinePagedHistoryRules.ts; src/pages/Timeline.tsx; src/test/timeline-paged-history-truth.test.tsx; this file
files_remaining: none for this slice
blockers: cannot be merged before #2934
open_questions: a kept older activity row that was deleted elsewhere stays on screen until the next full reload, the same accepted limit as the diary pager.
gotchas: Timeline tests pin source text; keep edits local and do not reformat the file. `bun run typecheck` (tsc) needs NODE_OPTIONS=--max-old-space-size=8192 in the authoring container until #2938 lands.
links: #2934 (parent)
artifacts: the test file above
reviewer_seat: none routed yet
reviewer_sha: none
session_state: no routines, no paused workflows; pending human decisions: #2934's review and merge, then mark ready, review routing and the per-item merge yes for this PR
claimed_by: Claude session_017UoYKvCNSMryxiQZyBbit8, 2026-11-12 07:40 UTC
owner: Claude session_017UoYKvCNSMryxiQZyBbit8
last_updated: 2026-11-12 01:40 CT, by Claude session_017UoYKvCNSMryxiQZyBbit8
```
