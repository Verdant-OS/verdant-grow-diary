# BLUEPRINT-GATE-TEST-COVERAGE-3128

```text
TASK BLUEPRINT-GATE-TEST-COVERAGE-3128  priority: P2  status: OPEN
goal: Close the test gaps on the live Blueprint server gate from #3094 (issue #3128) with new test files only. No app code changes.
why: #3094 merged as 3c3bd0a476610680a4fa776f73760bb843ec0165 without tests on getBlueprintAccess and without killing tests for the pending render and the enabled flip. A later change to this paid-access gate could break it with no test failing.
branch: posthog-self-driving/testblueprint-cover-the-server-access-75ccd1
base: verdant-grow-diary at ee1058233 (#3118)
checkout: git fetch origin posthog-self-driving/testblueprint-cover-the-server-access-75ccd1 && git switch posthog-self-driving/testblueprint-cover-the-server-access-75ccd1
pr: read from the branch (draft)
head_sha: read from the PR
state: pushed draft
current_step: waiting on CI and review
next_action: (1) 35/35 required checks at the head; (2) Seat A and Seat C exact-head reviews (exclude this session, the author); (3) Matthew's per-item yes naming the PR and full SHA (billing scope); the Merge Steward queues it.
post_merge_check: NOT_APPLICABLE (tests only; no runtime change). The #3094 post-merge check stays with CRAFT-BLUEPRINT-SERVER-GATE-20261125.
active_writer: PostHog Desktop self-driving session (Claude), inbox report 01a222a5-60b1-7041-907d-065ef5acac8b
decisions: (1) New files only. Every tracked file under src/test/ is a locked scorer, and the #3094 unlock lived in the git-ignored .claude/scorer-unlock.json, so no locked test is edited and scorer-lock --strict exits 0 with no unlock. (2) The server-function test replaces createServerFn / createMiddleware with builders that keep the middleware and handler, then runs the real requireSupabaseAuth and the real handler with a fake Supabase client. (3) This PR does not edit CRAFT-BLUEPRINT-SERVER-GATE-20261125.md: open #3123 (another holder, branch claude/project-thread-l98mix) edits that file. The full test command is below.
tried_and_rejected: adding the unknown price_id case to src/test/blueprint-access-rules.test.ts, as #3128 suggests: that file is a locked scorer, so the case lives in blueprint-access-rules-edge-cases.test.ts.
commands: bunx vitest run src/test/blueprint-access-server-fn.test.ts src/test/blueprint-access-rules-edge-cases.test.ts src/test/use-blueprint-server-access-disable.test.tsx src/test/plant-blueprint-overlay-server-pending.test.tsx src/test/blueprint-access-rules.test.ts src/test/get-paddle-price-craft-catalog.test.ts src/test/paddle-craft-plan-mapping.test.ts src/test/use-blueprint-server-access.test.tsx src/test/plant-blueprint-overlay-section.test.tsx src/test/blueprint-evidence-truth.test.tsx; node scripts/scorer-lock.mjs --report --strict; bun run typecheck
files_touched: src/test/blueprint-access-server-fn.test.ts; src/test/blueprint-access-rules-edge-cases.test.ts; src/test/use-blueprint-server-access-disable.test.tsx; src/test/plant-blueprint-overlay-server-pending.test.tsx; this file
files_remaining: none
blockers: none for the code. Seat C's packet 3094-4569ae8-C.md is on the agents' shared box and was not readable here, so its mutant ids (M2, M3, M5, M11, M12, M13, M14, M21) are mapped by the descriptions in #3128, not by the packet.
open_questions: Seat C to confirm that the 19 mutations in the PR body cover its listed mutants.
gotchas: bun is not on the sandbox PATH; npm i -g bun, then bun install --frozen-lockfile works against the public registry.
links: https://github.com/Verdant-OS/verdant-grow-diary/issues/3128; https://github.com/Verdant-OS/verdant-grow-diary/pull/3094; https://github.com/Verdant-OS/verdant-grow-diary/pull/3123
artifacts: PR body (mutation table)
reviewer_seat: Seat A and Seat C, routed by the Coordinator
reviewer_sha: none yet
session_state: no routines, no paused workflows. Pending human decision: Matthew's merge yes.
claimed_by: PostHog Desktop self-driving session (Claude), 2026-11-28
owner: PostHog Desktop self-driving session (Claude)
last_updated: 2026-11-28, by PostHog Desktop self-driving session (Claude)
```
