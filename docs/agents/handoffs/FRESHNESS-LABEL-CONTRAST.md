# FRESHNESS-LABEL-CONTRAST

```text
TASK FRESHNESS-LABEL-CONTRAST  priority: other  status: CLOSED
closed: merged. #2830 merged into verdant-grow-diary on 2026-11-04 as a5a7f01234d4f17fa98f0077f26fe56b31a91b9a (final SHA; GitHub API, read 2026-11-06). Closed in bulk by Claude session_017UoYKyU27JPpmSh3Cbj7EK on 2026-11-06 at Matthew's request (source claim: his answer in that session). This close does not resolve the post_merge_check, open_questions or blockers below; they are carried forward in docs/agents/handoffs/CLAUDE-HANDOFF-BULK-CLOSE-20261106.md.
goal: Make the plant freshness card's stale and missing text meet WCAG AA.
why: Live audit 2026-11-03 finding 12, measured in docs/specs/contrast-tokens.md section 2.3 (#2827): the stale value drew at muted-foreground/60 (3.28:1), "No plant manual log" at /50 (2.64:1) and the "Stale · Last manual log" line at /70 (4.04:1). These words tell a grower a reading is old or absent. File plan step 1 of that spec; needs neither D1 nor D2.
branch: claude/freshness-label-contrast
base: verdant-grow-diary
checkout: git fetch origin claude/freshness-label-contrast verdant-grow-diary && git switch claude/freshness-label-contrast
pr: opened as a draft after this commit; read the URL from GitHub
head_sha: read the current head on GitHub
state: implementation and test committed.
current_step: draft PR open; reviewer and merge authority awaiting Matthew.
next_action: Matthew names the reviewer and merge gate; then mark ready and route.
post_merge_check: after Publish, open a plant with a stale manual reading on https://verdantgrowdiary.com and confirm the stale and missing lines read clearly. NOT_MEASURED until live /version.json reports the merge SHA.
active_writer: Claude session_017UoYKwwZkbqmWvtCRMw1DZ
decisions: Full text-muted-foreground (6.59:1 on card). Stale stays distinct from fresh by colour (muted vs primary), the amber alert icon labelled "Stale", and the word "Stale" in the last-log line.
tried_and_rejected: none
commands: bunx vitest run src/test/plant-manual-sensor-freshness-contrast.test.tsx --reporter=dot; NODE_OPTIONS=--max-old-space-size=8192 bun run typecheck
files_touched: src/components/PlantManualSensorFreshnessCard.tsx; src/test/plant-manual-sensor-freshness-contrast.test.tsx; docs/agents/HANDOFF_LOG.md
files_remaining: none for this slice
blockers: none
open_questions: reviewer and merge authority for this PR.
gotchas: commit with NODE_OPTIONS=--max-old-space-size=8192 (never --no-verify).
links: docs/specs/contrast-tokens.md (#2827)
artifacts: none
reviewer_seat: not requested
reviewer_sha: NOT_MEASURED
session_state: no production access
claimed_by: Claude session_017UoYKwwZkbqmWvtCRMw1DZ, 2026-11-03
owner: Claude
last_updated: 2026-11-06, by Claude session_017UoYKyU27JPpmSh3Cbj7EK (bulk close; previous 2026-11-03 17:41 CT, by Claude)
```
