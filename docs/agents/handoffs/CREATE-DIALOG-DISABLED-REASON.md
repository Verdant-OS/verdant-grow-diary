# CREATE-DIALOG-DISABLED-REASON

```text
TASK CREATE-DIALOG-DISABLED-REASON  priority: P2  status: CLOSED
goal: disabled primary buttons in New grow, New tent, and New plant state their reason, and each name field has a visible label that is its accessible name.
why: Issue 3 (FA-F01, FA-F02, FA-F05). Cheeko approved building only (2026-10-31). Create tent and Create plant were disabled with no description, and the name fields were announced as their placeholders.
branch: ultra/create-dialog-reasons
base: verdant-grow-diary
checkout: git fetch origin ultra/create-dialog-reasons verdant-grow-diary && git switch ultra/create-dialog-reasons
pr: draft; read the URL from GitHub after push
head_sha: the commit that adds this block; read git rev-parse HEAD after checkout
state: CLOSED. Merged as d3c9899351bae225f47c1eacfa2d34dcee9373f2 (#2648) on 2026-10-31T12:00:40Z. Closed 2026-11-04 by Claude session_017UoYKv4arxJYBMGNNh1bvN on Matthew's instruction (Grok no longer active); copied from its HANDOFF_LOG.md block, which stays unedited per docs/agents/handoffs/README.md.
current_step: view-model, dialog wiring, and new unit tests are in the working tree
next_action: none; closed. Any post_merge_check below still applies to its recorded owner.
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
