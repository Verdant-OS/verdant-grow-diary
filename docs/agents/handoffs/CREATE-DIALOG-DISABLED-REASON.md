### CREATE-DIALOG-DISABLED-REASON

```text
TASK QUICK-LOG-TARGET-SAVE  priority: P1  status: OPEN
goal: One draft PR for Quick Log target selection, one save, optional reading time, one time-label class, and correction temperature units.
why: Issues 2778, 2779, 2780, 2781, and part of 2706. A tent open was resolving to the sole or recent plant, and a successful save left the sheet open.
branch: cursor/quick-log-target-save-1baf
base: verdant-grow-diary
checkout: git fetch origin cursor/quick-log-target-save-1baf verdant-grow-diary && git switch cursor/quick-log-target-save-1baf
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2793 ready
head_sha: d6b9abb71 is the implementation; 504ecc08c stamps this block; the pin-fix commit is the child of 504ecc08c. Read origin/cursor/quick-log-target-save-1baf for the exact head. This line cannot name that child.
state: ready PR 2793, no auto-merge
current_step: three CI pins updated after measured tap counts; required CI recheck follows the pin-fix push
next_action: keep the PR draft until required checks are green at the exact head and Moonbow routes review
post_merge_check: bunx vitest run src/test/quick-log-target-save-reading-time.test.tsx
active_writer: Grok cloud agent on cursor/quick-log-target-save-1baf
decisions: tent context is never rewritten to a plant; last-used target applies only when the route has no tent or plant; success closes the sheet and names the target in the toast; reading time is sheet state wired to occurredAt; GrowerTimeLabel is the shared formatter; correction temperature displays the grower unit and converts once to Celsius on save
tried_and_rejected: leaving the sole-plant pins unchanged would keep the bug
commands: NODE_OPTIONS=--max-old-space-size=8192 bun run typecheck; bunx vitest run src/test/quick-log-target-save-reading-time.test.tsx src/test/quick-log-v2-rules.test.ts src/test/quick-log-route-target-rules.test.ts src/test/mobile-quick-log-single-fab.test.ts src/test/app-shell-mobile-quick-log-routing.test.tsx src/test/quick-log-v2-sheet-watering.test.tsx src/test/quick-log-v2-sheet-feeding.test.tsx src/test/quick-log-v2-refresh-sheet.test.tsx src/test/quick-log-timeline-cta-integration.test.tsx
files_touched: src/components/AppShell.tsx src/components/QuickLogEntryIntegrityControls.tsx src/components/QuickLogV2Sheet.tsx src/pages/TentDetail.tsx src/lib/quickLogV2Rules.ts src/lib/quickLogRouteTargetRules.ts src/lib/growerTimeLabel.ts src/lib/quickLogReadingTime.ts src/lib/timelineEntryTimestampFormat.ts src/lib/quickLogGroupedTimelineFilterViewModel.ts src/lib/quickLogSnapshotStripAdapter.ts src/lib/wateringCadenceHistoryRules.ts src/lib/growDiaryPdfExport.ts and the renegotiated tests named in the PR
files_remaining: none for this slice
blockers: none for repository work. Moonbow routes review and merge. No production write.
open_questions: none
gotchas: scorer pins that encoded sole-plant launch and a stay-open sheet were renegotiated in the same change. .claude/scorer-unlock.json is local only.
links: issues 2778 2779 2780 2781 2706
artifacts: src/test/quick-log-target-save-reading-time.test.tsx
reviewer_seat: not requested
reviewer_sha: none
session_state: Grok implementation session
claimed_by: Grok 2026-11-02
owner: Grok
last_updated: 2026-11-02 21:36 CT, by Grok

TASK CREATE-DIALOG-DISABLED-REASON  priority: P2  status: OPEN
goal: disabled primary buttons in New grow, New tent, and New plant state their reason, and each name field has a visible label that is its accessible name.
why: Issue 3 (FA-F01, FA-F02, FA-F05). Cheeko approved building only (2026-10-31). Create tent and Create plant were disabled with no description, and the name fields were announced as their placeholders.
branch: ultra/create-dialog-reasons
base: verdant-grow-diary
checkout: git fetch origin ultra/create-dialog-reasons verdant-grow-diary && git switch ultra/create-dialog-reasons
pr: draft; read the URL from GitHub after push
head_sha: the commit that adds this block; read git rev-parse HEAD after checkout
state: local until pushed; draft only
current_step: view-model, dialog wiring, and new unit tests are in the working tree
next_action: confirm the draft PR stays draft; do not mark ready, request review, or merge
post_merge_check: after Publish, open New tent on the fixture account, leave the name blank, and confirm the Create tent button is disabled with the visible reason "Enter a tent name." Type a name and confirm the button enables. NOT_MEASURED until live /version.json reports the SHA.
active_writer: Grok cloud agent on this branch
decisions: disabled-reason and helper copy live in src/lib/createDialogPrimaryButtonViewModel.ts. Create tent and Create plant keep their pinned disabled expressions. Create grow now disables until the name is non-blank, matching the other two dialogs. A plan limit replaces the "only a name" helper. An optional plant tent no longer says "Create a tent first." Invalid optional tent size is shown on the size field and does not change the pinned disable expression.
tried_and_rejected: adding the size check to Create tent's disabled expression. Source scans pin that expression, and existing tests cannot be edited in this task.
commands: bunx vitest run src/test/create-dialog-primary-button-view-model.test.ts --reporter=dot
files_touched: src/lib/createDialogPrimaryButtonViewModel.ts; src/test/create-dialog-primary-button-view-model.test.ts; src/components/CreateTentDialog.tsx; src/components/CreatePlantDialog.tsx; src/pages/Grows.tsx; docs/agents/HANDOFF_LOG.md
files_remaining: none
blockers: none for repository work
open_questions: none
gotchas: do not edit the pinned disabled JSX in CreateTentDialog or CreatePlantDialog. Do not modify tests that already exist on the base.
links: uploads brief Issue 3
artifacts: accessibility captures are local to the agent run, not this repo
reviewer_seat: not requested; this draft does not ask for review
reviewer_sha: NOT_MEASURED
session_state: no paused workflows; no production writes
claimed_by: Grok, 2026-10-31
owner: Grok
last_updated: 2026-10-31 01:40 CT, by Grok
```
