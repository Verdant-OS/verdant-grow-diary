### AHREFS-WEB-ANALYTICS-KEY-SWAP

```text
TASK AHREFS-WEB-ANALYTICS-KEY-SWAP  priority: other  status: OPEN
goal: Replace the Ahrefs Web Analytics public data-key GRdwmweqUZoPO7SfmEsPZg with KZfnjSoVSRYkyDJq+SUsow. Loading stays consent-gated (no static <head> tag).
why: Matthew pasted Ahrefs' install snippet with the new key and chose "Replace the key" (Claude session_017UoYKzCisV3nBJG6Dhco3K, 2026-10-28).
branch: claude/admiring-dirac-3vaz57
base: verdant-grow-diary
checkout: git fetch origin claude/admiring-dirac-3vaz57 verdant-grow-diary && git switch claude/admiring-dirac-3vaz57 && git merge --ff-only "$VERIFIED_SHA" && test "$(git rev-parse HEAD)" = "$VERIFIED_SHA" && git merge origin/verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2602 (from claude/admiring-dirac-3vaz57)
head_sha: read the PR head; this commit cannot name itself
state: pushed; marked ready for review 2026-10-29 18:06 UTC on Matthew's instruction
current_step: 35/35 required CI and an independent exact-head review (request: see the PR conversation)
next_action: independent exact-head review of the PR; after publish, check the live site per post_merge_check
post_merge_check: on https://verdantgrowdiary.com accept analytics and confirm script[src="https://analytics.ahrefs.com/analytics.js"] carries data-key KZfnjSoVSRYkyDJq+SUsow; NOT_MEASURED until live /version.json reports the merge SHA
active_writer: Claude (session_017UoYKzCisV3nBJG6Dhco3K)
decisions: keep the consent gate; a static tag would load before consent and contradict the privacy policy and consent settings page. CSP allowance for analytics.ahrefs.com goes in a separate PR (owner choice).
tried_and_rejected: pasting the snippet into src/routes/__root.tsx <head>; rejected for the consent reason above
commands: bunx vitest run src/test/ahrefs-analytics-loader.test.ts --reporter=dot; bun run typecheck; node scripts/scorer-lock.mjs --report --strict
files_touched: src/constants/analytics.ts, src/test/ahrefs-analytics-loader.test.ts, docs/agents/HANDOFF_LOG.md
files_remaining: none
blockers: none
open_questions: Ahrefs "Recheck installation" looks for the tag in static HTML, which this site does not serve before consent; whether Ahrefs accepts the consent-gated install is NOT_MEASURED
gotchas: the key test is scorer-locked; unlock recorded with reason before commit
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/2600 (docs: Ahrefs project of record; no code overlap)
artifacts: PR body
reviewer_seat: eligible independent session under OWNERSHIP.md section 4.3; this Claude session excluded
reviewer_sha: none yet
session_state: none
claimed_by: Claude, 2026-10-28 23:10 UTC
owner: Claude
last_updated: 2026-10-29 18:40 UTC, by Claude (pr link and ready state recorded)
```
