# CLAUDE-MD-COUNTS-REFRESH

```text
TASK CLAUDE-MD-COUNTS-REFRESH  priority: P3  status: CLOSED
goal: remove the stale file counts from CLAUDE.md's Codebase orientation and correct the one stale rule they hid
why: the counts were measured 2026-08-21 at f25f9ed and had drifted by about a third by 2026-11-05 (src ts/tsx 4,921 -> 6,392; workflows 86 -> 115; docs 397 -> 544; src/test 2,849 -> 3,963; root *Rules.ts 474 -> 640; package.json scripts 320 -> 334), so agents were reading wrong numbers on every session. "No root-level *Rules.ts imports the Supabase client" also stopped being true: src/lib/cultivarSlugRouteRules.ts imports it since #2777 (2026-11-03)
branch: claude/claude-md-refresh
base: verdant-grow-diary at 7d720e705c969321aa4411e35ca4bd52bfb622b7
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2882
head_sha: 381c23c8a2586250f680c75394da6ebe4c43ac30
state: CLOSED 2026-11-05 - merged through the queue at 07:02:32 UTC as 6365c37f0c43fe58170e6088873508112e883f16 (enqueued by cheekhimself). 35/35 required green at 381c23c8. No independent exact-head review recorded on GitHub
next_action: none for this task. Follow-up: #2883 (e4c2fc02) moved the cultivar slug route Supabase read into a service, so CLAUDE.md line "One root-level *Rules.ts imports the Supabase client: cultivarSlugRouteRules.ts" is now false and needs its own governance-bump PR
post_merge_check: none live; repository-only. After merge, CLAUDE.md on the deploy branch carries no file counts in Codebase orientation and all 18 governance files read Sentinel-Version 2026-11-05.1
active_writer: Claude session session_017UoYKvaD66HKYPL8bnvTH3
decisions: Matthew chose (2026-11-05) a new branch and "drop numbers" over restamping counts or deduping the shared routing / startup-gate blocks. Kept durable rules re-verified at 7d720e70: no file in src/components or src/pages mentions @tanstack/react-router; seven root *Rules.ts call Math.random (same named files); *Advisor.ts glob still empty. Kept dated practical observations that are not repo counts (2026-08-25 cache TTL, 2026-08-19 operating facts). AGENTS.md section 17 gets a 2026-11-05.1 entry as section 0.2 requires
tried_and_rejected: restamping the counts (accurate today, stale again within weeks); deduping the routing and startup-gate blocks (out of the chosen scope)
commands: node scripts/sync-sentinel-mirror.mjs --set-version=2026-11-05.1; node scripts/check-sentinel-version-parity.mjs origin/verdant-grow-diary; node_modules/.bin/vitest run $(grep -rl -E "AGENTS\.md|CLAUDE\.md|GEMINI\.md|Sentinel-Version|roles/claude" src/test) --reporter=dot; node --test scripts/check-sentinel-version-parity.test.mjs
evidence: parity OK, 2026-11-05.1 across 18 files, BUMP checked against 7d720e705 (3 governance files changed); 23 test files / 738 passed / 20 skipped (existing skips) / 0 failed; parity script tests 31 pass / 0 fail; prettier clean on every changed file
files_touched: CLAUDE.md, AGENTS.md (section 17 entry), GEMINI.md (mirror re-sync), the other 15 governance files (Sentinel-Version line only), docs/agents/handoffs/CLAUDE-MD-COUNTS-REFRESH.md
files_remaining: none
blockers: none
open_questions: none
gotchas: CLAUDE.md must stay Prettier-formatted (src/test/sentinel-mirror-prettier-fence.test.ts); no test pins the removed numbers. Separate from PR #2881 (Timeline fix), which this session also owns
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/2881
reviewer_seat: eligible non-contributing outside reviewer per OWNERSHIP.md 4.3 (excludes this session)
reviewer_sha: none yet
session_state: this session also watches #2881
claimed_by: Claude session_017UoYKvaD66HKYPL8bnvTH3, 2026-11-05 (assigned by Matthew)
owner: Claude
last_updated: 2026-11-05, by Claude (closure)
```
