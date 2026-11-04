# CONTRAST-FOLLOWUPS

```text
TASK CONTRAST-FOLLOWUPS  priority: other  status: OPEN
goal: Close the post-merge P3 review findings on #2840 (muted opacity floor) and #2827 (contrast token spec).
why: Both PRs merged on 2026-11-04 with P3s from Reviewers A and B. Two of them were real. First, the #2840 guard still skipped PlantManualSensorFreshnessCard.tsx through a PENDING entry, so that file was unchecked. Second, the #2827 spec's white-on-red ratios used pure white instead of the 98% token, and it described a bg-destructive mapping that #2839 did not ship.
branch: claude/contrast-followups
base: verdant-grow-diary
checkout: git fetch origin claude/contrast-followups verdant-grow-diary && git switch claude/contrast-followups && git merge origin/verdant-grow-diary
pr: NOT_MEASURED (opened after this commit; see the PR's own link)
head_sha: see the PR head
state: pushed draft
current_step: review
next_action: Get an exact-head PASS and 35/35 required checks, then merge through the queue.
post_merge_check: bunx vitest run src/test/muted-text-opacity-floor.test.ts on the deploy tip passes 18/18.
active_writer: Claude session_017UoYKwwZkbqmWvtCRMw1DZ
decisions:
  - Removed the PENDING set and its skip outright, rather than emptying it, because no other file needs it.
  - Corrected the spec figures to 98% white (4.21, 3.66, 3.11, 3.88) and said so in Method.
  - Recorded the light-theme failure (4.11 / 4.40) and #2839's fix (5.48 / 5.87).
  - Rewrote D1(a) to describe the shipped mapping: --color-destructive points at the text token, and solid fills use bg-destructive-fill.
  - Left out the #2865 handoff fields, the 400 keep-alive request and the #2861 heading. Those files are not on the deploy branch yet.
tried_and_rejected: none
commands:
  - bunx vitest run src/test/muted-text-opacity-floor.test.ts --reporter=dot
  - node scripts/assert-docs-safety.mjs
  - node scripts/scorer-lock.mjs --report --base origin/verdant-grow-diary
files_touched: src/test/muted-text-opacity-floor.test.ts, docs/specs/contrast-tokens.md, docs/agents/handoffs/CONTRAST-FOLLOWUPS.md
files_remaining: none
blockers: none
open_questions: none
gotchas: src/test/muted-text-opacity-floor.test.ts is scorer-locked. The renegotiation (removing the PENDING skip) is declared in the PR body.
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/2840 https://github.com/Verdant-OS/verdant-grow-diary/pull/2827 https://github.com/Verdant-OS/verdant-grow-diary/pull/2839
artifacts: the PR's checks
reviewer_seat: Reviewer A (session_017UoYKyDyFmmRqwAGfNHt1d), whom Matthew asked to review this follow-up
reviewer_sha: none yet
session_state: none
claimed_by: Claude session_017UoYKwwZkbqmWvtCRMw1DZ, 2026-11-04 20:15 UTC
owner: Claude session_017UoYKwwZkbqmWvtCRMw1DZ
last_updated: 2026-11-04 14:15 CT, by Claude
```
