# TENT-PLANTS-FIRST-20261128

```text
TASK TENT-PLANTS-FIRST-20261128  priority: other  status: OPEN
goal: On Grow → Tent (/tents/:id), the Plants section sits directly under the tent header, ahead of the environment metrics, so the first plant name shows without scrolling at 375px and on desktop.
why: Cheek, 2026-11-28 17:00 UTC: "Top priority: put Plants first on Grow → Tent. Matthew's biggest friction is scrolling past environmental metrics to see which plants are in the tent."
branch: claude/project-thread-jk56y8
base: verdant-grow-diary (ee105823343e87f365bbf0815f6511d45a3ad858 at start, 2026-11-28 17:05 UTC)
checkout: git fetch origin claude/project-thread-jk56y8 verdant-grow-diary && git switch claude/project-thread-jk56y8
pr: the draft PR opened from this branch
head_sha: see the PR; refreshed on each push
state: commit 1 adds the order test only (RED proof on CI); commit 2 moves the plants block. Local tests, typecheck, lint and build NOT_MEASURED: bun install --frozen-lockfile BLOCKED (lockfile tarballs on europe-west4-npm.pkg.dev return 403 through the session proxy). Required CI provides them.
current_step: draft PR open, waiting on CI
next_action: when CI is green at the head, relay the Seat A (Sour Diesel) review block to Cheek; do not ready, enqueue or merge.
post_merge_check: signed-in walk on verdantgrowdiary.com with an approved test account: open a fixture tent at 375x812 and at desktop width; the first plant name shows without scrolling, and the Environment card is still below. Reopens with the same owner on FAIL.
active_writer: Claude thread session (coordinator relay of Cheek's 2026-11-28 17:00 UTC message)
decisions:
- Moved the whole existing plant group (read-status notice, plant tabs, Plant Roster, activity panels, "Plants in this tent" card) as one unit, internal order unchanged, into a wrapper right after the header block (back link, PageHeader, grow context line, data-source disclosure). Reason: smallest move that keeps every plant surface and behavior; the tab row puts the first plant name right under the header.
- The data-source disclosure stays with the header: it labels where the page's data comes from.
- FirstPlantMemoryCta stays where it was (bottom); it is a memory prompt, not the plant list, and keeping it out of the top block keeps the first plant name high.
- The grid card gained no margin; the wrapper carries mb-6 because the card used to end the page.
- No copy, schema, RLS, edge, auth or billing change.
rejected: splitting the roster from the grid (more judgment, more risk) — note the repeated lists as friction instead.
files_touched: src/pages/TentDetail.tsx; src/test/tent-detail-plants-first-order.test.tsx (new); this file.
files_remaining: none for this slice.
open_questions: with many plants the page lists them three times (tabs/roster, activity panels, grid) before the metrics; candidate follow-up slice, not in this PR.
gotchas: the plant-name span was re-wrapped to stay under 100 columns after the extra indent; no test pins that line.
reviewer: Seat A (Sour Diesel) requested via Cheek's relay; no verdict yet.
session_state: none paused; no routines.
last_updated: 2026-11-28 17:30 UTC, by Claude thread session
```
