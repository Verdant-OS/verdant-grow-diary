# TIMELINE-HEADER-PLANT-STAGE-20261123

```text
TASK TIMELINE-HEADER-PLANT-STAGE-20261123  priority: P2  status: OPEN
goal: The Timeline header shows the scoped plant's own stage and day. A Flower plant in a grow and tent still marked Veg must not read "Vegetative · day 92".
why: Core-loop walkthrough on 2026-11-20 (Fixture Tent A) saw the header read the grow's stage and start. The header passed activeGrow.stage and activeGrow.started_at only.
branch: claude/project-thread-vs74zt
base: verdant-grow-diary at ab8826a (#3047)
checkout: git fetch origin claude/project-thread-vs74zt && git switch claude/project-thread-vs74zt
pr: see the draft PR for this branch
head_sha: read from the PR
state: pushed; draft PR open
current_step: draft PR opened; independent review requested
next_action: (1) Matthew says to take the PR out of draft so the draft-skipped required checks run; (2) 35/35 required checks at the head; (3) one independent exact-head review from Reviewer A, D or C (exclude this thread's session); (4) Matthew's per-item merge yes naming the PR and SHA; (5) merge by the Merge Steward through the queue.
post_merge_check: after live /version.json reports the merge SHA, open Timeline scoped to the Fixture Tent A Flower plant (plant from the plant page link) and confirm the header reads Flowering with the plant's day count; with no plant or tent selected it still reads the grow's stage.
active_writer: Claude thread session for task u3426e74c8b96bca0524d939c62e7ef6e
decisions: (1) Precedence plant > tent > grow; blank or whitespace stage falls through. (2) Day comes from the plant's start (calendar-date semantics, UTC midnight is the picked date) when the plant has one, else the grow start (timestamptz, local days). A future or unreadable plant start yields no day instead of borrowing the grow's. (3) New owner-scoped hook reads only when a plant or tent is in scope and only after grow ownership is proven (directoryGrowId); scope changes reset synchronously. (4) useTimelineNameDirectory left untouched so its pinned selects and shape stay as they are.
behavior_change: Timeline scoped to a plant (plantId param) or tent shows that record's stage; a scoped plant with a start date counts days from it. Unscoped Timeline is unchanged (grow stage and grow start). A blank grow stage now renders "—" instead of an empty string.
not_in_scope: DiaryCalendarSection activeStage/plantStartedAt props (still the grow's); the latest-reading selector and Dashboard readings (another thread owns them); fixing the grow or tent stage data itself.
scorer_lock: no existing assertion changed.
tests: new src/test/timeline-header-stage-rules.test.ts (8 cases); new src/test/timeline-header-stage-label.test.tsx (2 cases). Rules test under bun test: 8 pass; with plant/tent precedence and plant start set aside (old grow-only behaviour): 6 fail, 2 pass; restored: 8 pass.
not_measured: the label component test, the existing timeline-grow-day-midnight test, the full 32-shard suite, lint, bun run typecheck and bun run build. All BLOCKED locally: bun install --frozen-lockfile failed with ProxyConnectFailed 403 on tarballs. The pure rule passed an isolated strict tsc run.
commands: bunx vitest run src/test/timeline-header-stage-rules.test.ts src/test/timeline-header-stage-label.test.tsx src/test/timeline-grow-day-midnight.test.tsx src/test/timeline-page-read-state.test.tsx; bun run typecheck; bun run lint
files_touched: src/lib/timelineHeaderStageRules.ts; src/hooks/useTimelineHeaderStageFacts.ts; src/components/TimelineGrowDayLabel.tsx; src/pages/Timeline.tsx; src/test/timeline-header-stage-rules.test.ts; src/test/timeline-header-stage-label.test.tsx; this file
files_remaining: none for this slice
blockers: local dependency install (see not_measured)
open_questions: should DiaryCalendarSection also use the scoped plant's stage and start?
links: walkthrough task u5d340b3d4cfa0693fe7838292d16cc3f
reviewer_seat: requested on the PR (A, D or C)
reviewer_sha: none yet
session_state: no routines, no paused workflows. Pending human decisions: take out of draft; merge yes.
claimed_by: Claude thread session for task u3426e74c8b96bca0524d939c62e7ef6e, 2026-11-23
owner: Claude thread session for task u3426e74c8b96bca0524d939c62e7ef6e
last_updated: 2026-11-23, by Claude thread session for task u3426e74c8b96bca0524d939c62e7ef6e
```
