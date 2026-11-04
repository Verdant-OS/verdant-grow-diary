# PR-2554-CHART-TOOLTIP-ROUNDING

```text
TASK PR-2554-CHART-TOOLTIP-ROUNDING  priority: P2  status: CLOSED
goal: Round Environment chart tooltip display strings so they agree with the card, including soil at one decimal and unsigned zero.
why: Hover showed the raw °C-to-°F float. Jack Herer PASS-pending-CI listed P3s; Cheeko set soil tooltip decimals to 1.
branch: cursor/env-chart-tooltip-rounding-3fe4
base: verdant-grow-diary
checkout: git fetch origin cursor/env-chart-tooltip-rounding-3fe4 verdant-grow-diary && git switch cursor/env-chart-tooltip-rounding-3fe4 && git merge --ff-only "$VERIFIED_SHA" && test "$(git rev-parse HEAD)" = "$VERIFIED_SHA" && git merge origin/verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2554
head_sha: read origin/cursor/env-chart-tooltip-rounding-3fe4 after the follow-up push
state: CLOSED. Merged as 434362540ffa361cb2e3c7936b25ba996af3cb36 (#2554) on 2026-10-27T21:39:01Z. Closed 2026-11-04 by Claude session_017UoYKv4arxJYBMGNNh1bvN on Matthew's instruction (Grok no longer active); copied from its HANDOFF_LOG.md block, which stays unedited per docs/agents/handoffs/README.md.
current_step: Soil displayDecimals is 1, negative zero is unsigned, fractional tooltip cases live in a new test file.
next_action: none; closed. Any post_merge_check below still applies to its recorded owner.
post_merge_check: Environment chart tooltip on a Fahrenheit tent shows 75.0°F and soil 40.46 as 40.5%. NOT_MEASURED until after merge.
active_writer: Grok cloud session on cursor/env-chart-tooltip-rounding-3fe4
decisions: Soil tooltip is one decimal even though the Environment card does not render soil. New cases stay in a new test file so tracked pins are not edited again.
tried_and_rejected: none on this follow-up
commands: bunx vitest run src/test/sensor-chart-tooltip-fractional-display.test.ts src/test/sensor-chart-tooltip-display-rounding.test.ts --reporter=verbose
files_touched: src/lib/sensorChartAxisRules.ts; src/test/sensor-chart-tooltip-fractional-display.test.ts; docs/agents/HANDOFF_LOG.md
files_remaining: none planned
blockers: none
open_questions: none
gotchas: displayDecimals is not tickDecimals. Card still does not show soil.
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/2554#pullrequestreview-5669825201
artifacts: src/test/sensor-chart-tooltip-fractional-display.test.ts
reviewer_seat: Jack Herer review 5669825201 was PASS-pending-CI at 1b260ffd40591e4671017e2e2f2281454c28b096 and does not cover the follow-up head
reviewer_sha: NOT_MEASURED for the follow-up head
session_state: follow-up on draft #2554; no merge, queue, or deploy
claimed_by: Grok, 2026-10-27
owner: Grok cloud session
last_updated: 2026-10-27 10:35 CT, by Grok
```
