# AI-DOCTOR-UNMOUNTED-PRESENTERS

```text
TASK AI-DOCTOR-UNMOUNTED-PRESENTERS  priority: other  status: OPEN
goal: Make AI Doctor freshness code match what growers see live. Remove the Plant Detail AI Doctor presenters no route mounts, and fix the one live freshness line that could describe a future-dated snapshot with an age.
why: #2956 (d725622) updated PlantDetailAiDoctorReadinessGate, PlantDetailDoctorLaunchDialog and the safe-review summary, but nothing mounts them; their new copy is absent from the live JS (measured 2026-11-12 on b7e0521). Meanwhile the live context panel (Plant Detail → AI review → "How this was decided") printed "Latest manual sensor snapshot: in 1 day" for a future-dated timeline snapshot.
branch: claude/optimistic-faraday-18filv
base: verdant-grow-diary at b7e05214ddb0c552d1c6d04a3101045a9f771ab8
checkout: git fetch origin claude/optimistic-faraday-18filv verdant-grow-diary && git switch claude/optimistic-faraday-18filv
pr: see the draft PR for this branch
head_sha: code at b82da2edb25d184cbf1441c5bbc794fdb97c3008; this entry's commit follows, read the current head from the PR
state: pushed draft
current_step: draft PR open; required CI runs once it is marked ready (CI skips drafts)
next_action: route one fresh independent exact-head review at the new head (P3-2 commit); then owner decides when to mark ready (OWNERSHIP.md §4.3; this session and its two builder subagents are excluded). Never mark ready, enqueue or merge from this session.
post_merge_check: after live /version.json reports the merge SHA, open a fixture plant's AI review section, expand "How this was decided": the latest-snapshot line shows a relative age for a past snapshot. The future-dated case has no grower path on the fixture: NOT_MEASURED live, unit/render tests only.
active_writer: Claude session_017UoYKxxpw2guRq48NBdZRB
decisions: (1) Matthew, 2026-11-13 (AskUserQuestion): "Remove them" incl. the 5 view models only they used; "Fix it here" for the live context-panel line. (2) Correction to the task brief: ContextPreview is not circular with the dialog; ContextPreview imports the dialog and nothing imports ContextPreview. (3) Live fix is presenter-only: new src/lib/aiDoctorLatestSnapshotLineViewModel.ts uses the existing latest.manualSnapshotFutureDated flag; no rules change. Assigned-tent current rows are already dropped when future-dated (manualTentSensorRowsToAiDoctorContextSnapshots); the timeline manual_sensor_snapshot path is what reached the screen. (4) No cascade beyond the 9 files: aiDoctorSnapshotFreshnessStatusViewModel, aiDoctorRootZoneReadinessScopeRules etc. keep live importers. (5) Mixed tests kept every evaluateAiDoctorContext / freshness-status assertion; gate-only its removed. One categorization it ("falls back to add-context…") was deleted because its only live assertion duplicated the "does NOT block when partial but meaningful" it with identical inputs.
tried_and_rejected: wiring a component back in (contradicts docs/specs/ai-doctor-readiness-single-summary.md and the information-architecture pin).
commands: bunx vitest run src/test/ai-doctor src/test/plant-detail src/test/coach src/test/timeline-ai-doctor --reporter=dot (345 files, 5271 passed); NODE_OPTIONS=--max-old-space-size=8192 bunx tsc -p tsconfig.json --noEmit (0); node scripts/verify-edge-shared-in-sync.mjs (OK 108); node scripts/sync-mcp-edge-bundle.mjs --check (matched); node scripts/scorer-lock.mjs --report --strict --base b7e05214ddb0c552d1c6d04a3101045a9f771ab8 (28 locked, listed in PR body); bunx eslint <modified> (0 errors)
files_touched: c6bb8ed: src/components/PlantDetailAiDoctorContextPanel.tsx, src/lib/aiDoctorLatestSnapshotLineViewModel.ts (new), src/test/ai-doctor-context-panel-future-snapshot.test.tsx (new). b82da2e: 9 modules + 13 tests deleted, 15 tests trimmed, docs/specs/legacy-quick-log-retirement.md. This file.
files_remaining: none
blockers: none
open_questions: none
gotchas: node_modules was absent after a container restart; `bun install --frozen-lockfile` worked (bun.lock unchanged). `bun run build` not run locally (CI's Lint/typecheck/test/build covers it). Subagents in this harness start near 157k context; keep briefs to ~3 files.
links: #2956 (d725622); docs/agents/handoffs/DEAD-MODULE-CLEANUP-ZERO-REFERENCE.md (precedent)
reviewer_seat: independent Claude review session session_017UoYKxjqLTdRmjWEVpZyYQ, PASS 0/0/3 at e0e7b3648e0f321d3b5d21147681d4ebd3ad4297 (COMMENT event: posted via the PR author account). Superseded by the P3-2 test commit; the new head needs a new review.
reviewer_sha: e0e7b3648e0f321d3b5d21147681d4ebd3ad4297 (historical)
session_state: safety-net check-in scheduled (send_later trig_01VCoPMVKNSCEehrA8drwkd2). P3-1 fixed in PR body; P3-2 done at Matthew's request 2026-11-13 (rename + within-skew cases, pin unchanged behavior, cannot be RED); P3-3 informational. Non-required check:deps red from hono advisories; Matthew chose not to fix here. Pending human decisions: mark ready, pins (28 scorer-locked tests), merge yes at the exact head.
claimed_by: Claude session_017UoYKxxpw2guRq48NBdZRB, 2026-11-13 01:20 UTC
```
