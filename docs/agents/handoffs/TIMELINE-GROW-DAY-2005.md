# TIMELINE-GROW-DAY-2005

```text
TASK TIMELINE-GROW-DAY-2005  priority: P2  status: CLOSED
closed: merged. #2079 merged into verdant-grow-diary on 2026-10-14 as c8523adccc81f18e0cf7118a69dc31493d273c4c (final SHA; GitHub API, read 2026-11-06). Closed in bulk by Claude session_017UoYKyU27JPpmSh3Cbj7EK on 2026-11-06 at Matthew's request (source claim: his answer in that session). This close does not resolve the post_merge_check, open_questions or blockers below; they are carried forward in docs/agents/handoffs/CLAUDE-HANDOFF-BULK-CLOSE-20261106.md.
goal: Timeline header grow day uses local calendar days (same count as resolvePlantAge, including day 0), not 24-hour periods clamped to 1. Fixes #2005.
branch: cursor/timeline-local-grow-day-d474
base: verdant-grow-diary
checkout: git fetch origin cursor/timeline-local-grow-day-d474 verdant-grow-diary && git switch cursor/timeline-local-grow-day-d474 && git merge --ff-only "$VERIFIED_SHA" && test "$(git rev-parse HEAD)" = "$VERIFIED_SHA" && git merge origin/verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2079 (draft)
head_sha: parent of the commit that records this line. Observed remote head before this update: 4a33b26a3254773d2385536aa0c728e70a994022 at 2026-10-14 13:18 CT (origin/cursor/timeline-local-grow-day-d474). That SHA is the parent, not this commit.
state: pushed. Same-day future starts return null. Midnight test restores the saved TZ.
next_action: Graft re-reviews the new head. No merge from this writer.
files: src/lib/plantStartDateRules.ts; src/pages/Timeline.tsx; src/components/TimelineGrowDayLabel.tsx; src/hooks/useTimelineGrowDayNow.ts; src/test/timeline-grow-day.test.ts; src/test/timeline-grow-day-utc-midnight.test.ts; src/test/timeline-grow-day-later-today.test.ts; src/test/timeline-grow-day-midnight.test.tsx
blockers: none for the repository change
artifacts: later-today RED 1 failed / 0 passed (received 0, expected null) before the instant check; GREEN after. Midnight TZ restore does not change assertions. Renegotiated pin: src/test/timeline-grow-day-midnight.test.tsx (cleanup only).
reviewer_seat: Graft, named by Cheeko 2026-10-14 1:15 PM CT
claimed_by: bc-9958d146, 2026-10-14 13:18 CT
last_updated: 2026-11-06, by Claude session_017UoYKyU27JPpmSh3Cbj7EK (bulk close; previous 2026-10-14 13:18 CT, by bc-9958d146)
```
