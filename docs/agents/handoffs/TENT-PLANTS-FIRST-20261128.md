# TENT-PLANTS-FIRST-20261128

```text
TASK TENT-PLANTS-FIRST-20261128  priority: other  status: OPEN
goal: Grow detail lists the grow's tents right under the grow name. Grow → Tent (/tents/:id) shows compact, tappable plant names right under the tent name (first names, a total and "See all plants" that expands on the page; more names on desktop), a compact sensor strip right below them, and the detailed metrics farther down. A compact Quick Log beside the tent name opens the existing Quick Log with the tent selected and no plant. First tent and plant names visible without scrolling at 375px and on desktop.
why: Cheek, 2026-11-28 17:00, 17:09, 17:12 and 17:14 UTC (coordinator relays): plants first on Grow → Tent; tents first on Grow detail; sensor strip with air temperature and RH, or VPD alone, with freshness and "VPD unavailable."; tent-level Quick Log beside the tent name.
branch: claude/project-thread-jk56y8
base: verdant-grow-diary (ee105823343e87f365bbf0815f6511d45a3ad858 at start, 2026-11-28 17:05 UTC)
checkout: git fetch origin claude/project-thread-jk56y8 verdant-grow-diary && git switch claude/project-thread-jk56y8
pr: #3131 (draft)
head_sha: see the PR; refreshed on each push
state: commits 1-2 moved the existing plant group up (RED 46168549510, GREEN 46168569104). Commit 3 adds the tests for the agreed layout (RED proof on CI); commit 4 implements it. Local tests, typecheck, lint and build NOT_MEASURED: bun install --frozen-lockfile BLOCKED (lockfile tarballs on europe-west4-npm.pkg.dev return 403 through the session proxy). Required CI and the dispatched 16-shard full suite provide them.
current_step: draft PR updated, waiting on the dispatched full suite at the new head
next_action: when the full suite is green at the head, relay the Seat A (Sour Diesel) review block to Cheek; do not ready, enqueue or merge. Signed-in viewport checks wait for a deploy the approved fixture can reach (fixture: matt+qa1128 account, owned and torn down by the notebook walkthrough thread; ask the coordinator).
post_merge_check: signed-in walk on verdantgrowdiary.com with the approved test account: at 375x812 and desktop, a long-named fixture tent shows the tent name, Quick Log and the first plant names without scrolling, then the sensor strip; a busy tent shows "See all N plants" and expands on the page; the grow page shows tent names under the grow name. A tent note from the header Quick Log lands on the tent Timeline with no plant; a plant note from Plant detail lands on that plant. Reopens with the same owner on FAIL.
active_writer: Claude thread session (coordinator relays of Cheek's 2026-11-28 messages)
decisions:
- New pure rules: src/lib/glanceNameListRules.ts (first 6 names on a phone, 12 from sm up, See all / Show fewer, "empty" only after a complete read) and src/lib/tentSensorStripRules.ts (strip freshness from the chips' own inputs; strip VPD from the page's resolved VPD).
- New presenters: GlanceNameList, GrowTentsGlance, TentSensorStrip, TentSensorStripFreshnessLine, TentDetailQuickLogButton.
- Sensor strip layout choice is a container query on the strip's width in rem (two values from 15rem): enlarged text also falls back to VPD alone. At 375px with default text the strip is about 20rem wide, so the two-value layout shows; the VPD layout shows on very narrow screens or large text.
- Strip VPD reuses headerVpdObservation from resolveTentDetailVpd (already same-capture with captureClimate). No VPD math added. PR #3122 (notebook card and plant page VPD) touches none of these files: no dependency.
- Header Quick Log is a new button (mirrors PlantDetailQuickLogButton) that opens QuickLogV2Sheet with tent:<id>, never a plant, even on a one-plant tent; the sheet mounts on first tap. Desktop FAB unchanged. Save handlers, the repeat-note block (#3105) and "What changed?" rules (#3113, #3120) untouched.
- Save destination before Save: QuickLogV2Sheet already shows the chosen target beside Save (qlv2-save-target), on both the tent and plant flows; not changed. Long names truncate there (friction note).
- Plant detail keeps its existing Quick Log (PlantDetailQuickLogButton, plant:<id>); no change.
- Full plant group stays below the next-step card and actions as the detailed roster; detailed metric chips stay in their original place above the manual-history notice.
- Grow tent list comes from the existing tent lookup in useGrowDetailData (select id, name); unavailable on error, never "none" from a failed read.
rejected: MetricChip inside the strip (duplicates test ids and labels the existing suites query); a viewport breakpoint for the strip layout (ignores text size).
files_touched: src/pages/TentDetail.tsx; src/pages/GrowDetail.tsx; src/hooks/useGrowDetailData.ts; src/components/{GlanceNameList,GrowTentsGlance,TentSensorStrip,TentSensorStripFreshnessLine,TentDetailQuickLogButton}.tsx; src/lib/{glanceNameListRules,tentSensorStripRules}.ts; src/test/{tent-detail-plants-first-order,glance-name-list-rules,tent-sensor-strip-rules,tent-sensor-strip,tent-detail-quick-log-button,grow-detail-tents-glance}.test.*; this file.
files_remaining: none for this slice.
open_questions: none blocking. Timed save-and-reopen and tent vs plant Timeline landing are BLOCKED until the fixture walk.
gotchas: tests that mount TentDetail mock QuickLogV2Fab but not QuickLogV2Sheet, which is why the header button mounts the sheet lazily.
reviewer: Seat A (Sour Diesel) via Cheek's relay; no verdict yet.
session_state: none paused; no routines.
last_updated: 2026-11-28 17:40 UTC, by Claude thread session
```
