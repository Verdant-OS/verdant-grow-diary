# GROWER-BUGS-10

```text
TASK GROWER-BUGS-10  priority: P1  status: OPEN
goal: grower bug brief 2026-11-03 item 10 / issue #2785 - plant, tent and timeline tabs crash or hang; per-plant Timeline worst
why: measured in mocked Chromium at verdant-grow-diary 773635e: 100 Timeline entries with 12 MP photos took the renderer to ~1,509 MB after scrolling (no photos ~419 MB, 800x600 photos ~646 MB); JS heap ~56-75 MB in all runs; zero REST calls after settle (no refetch loop). Cause: every entry photo renders the original camera file
branch: claude/grower-bugs-10 (founder-named, 2026-11-04)
base: verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2844
head_sha: read the current head on GitHub
state: ready for review; required checks green at the last measured head
current_step: fix shipped - only the newest 20 photo entries load their photo; older ones show "Show photo" and load that one photo on tap (src/lib/timelinePhotoDeferralRules.ts, Timeline card). Same mock after the fix: ~951-1,049 MB, bounded at ~23 unique photos however far you scroll
next_action: independent review; post-merge production recheck of #2785 on a phone
post_merge_check: on verdantgrowdiary.com, a plant with more than 20 photo entries shows photos on the newest 20 and "Show photo" on older ones; tapping loads that photo; tab no longer crashes when scrolled to the end
active_writer: Claude session claude/grower-bugs-10
decisions: founder chose tap-to-load (2026-11-04) over server image transformation (plan feature, unverifiable here) and an upload display copy (new photos only); limit 20 by render order, text entries do not use a slot; revealed ids persist for the page session
tried_and_rejected: CSS content-visibility:auto on cards (1,489 MB, no gain); removing src from far off-screen images after scroll (1,468 MB, RSS not released)
commands: bunx vitest run src/test/timeline-photo-deferral.test.tsx src/test/timeline-photo-deferral-rules.test.ts --reporter=dot
files_touched: src/lib/timelinePhotoDeferralRules.ts, src/pages/Timeline.tsx, src/test/timeline-photo-deferral.test.tsx, src/test/timeline-photo-deferral-rules.test.ts, docs/agents/handoffs/GROWER-BUGS-10.md
files_remaining: none for this slice
blockers: none
open_questions: Photo history (24) and Recent Quick Logs (10) thumbnails also load originals at 48 px; they overlap the newest photos so they add little, but a thumbnail source would cut more. Tent page "shell for several seconds" not measured in this slice
gotchas: PR #2820 and #2842 also edit src/pages/Timeline.tsx; expect small merges. The measurement script is scratch only (not committed)
links: https://github.com/Verdant-OS/verdant-grow-diary/issues/2785
reviewer_seat: eligible non-contributing reviewer per OWNERSHIP.md 4.3
reviewer_sha: none yet
session_state: Claude session also watches PRs #2820, #2828, #2842
claimed_by: Claude, 2026-11-04 02:45 UTC
owner: Claude
last_updated: 2026-11-04 11:25 UTC, by Claude (moved to per-task file per docs/agents/handoffs/README.md)
```
