# VER-508-FIELD-NOTEBOOK-TIMELINE-A11Y

```text
TASK VER-508-FIELD-NOTEBOOK-TIMELINE-A11Y  priority: other  status: OPEN
goal: Field Notebook tent tabs follow the WAI-ARIA tabs pattern (one tab stop, arrow/Home/End keys, linked tabpanel); the note and actions use the shared ui focus ring; the save status is a polite live region that exists before the save. Timeline filter chips, size="sm" buttons, Load older and the mobile Summary link are at least 44px tall below the sm breakpoint. Two learning-loop badges use semantic tokens.
why: VER-508 / issue #3075 (P3). Keyboard, screen-reader and mobile users get a broken tab pattern and controls under 44px on two core-loop surfaces.
branch: posthog-self-driving/fixfield-notebook-add-keyboard-tabs-4422c4 (name fixed by the PostHog run harness)
base: verdant-grow-diary (started at 9c844347c691090eb56ecfa1b6eb63398d03e742)
checkout: git fetch origin posthog-self-driving/fixfield-notebook-add-keyboard-tabs-4422c4 verdant-grow-diary && git switch posthog-self-driving/fixfield-notebook-add-keyboard-tabs-4422c4 && git merge --ff-only "$VERIFIED_SHA" && test "$(git rev-parse HEAD)" = "$VERIFIED_SHA" && git merge origin/verdant-grow-diary
pr: see the open draft PR from the branch above (gh pr list --head posthog-self-driving/fixfield-notebook-add-keyboard-tabs-4422c4)
head_sha: read with git ls-remote origin posthog-self-driving/fixfield-notebook-add-keyboard-tabs-4422c4; this file does not name its own commit
state: pushed draft
current_step: first commit pushed; draft PR open.
next_action: required CI at the pushed head; then an eligible independent exact-head review per the roster.
post_merge_check: on https://verdantgrowdiary.com once /version.json reports the merged SHA, with the disposable test account at a 375px viewport: Tab reaches one notebook tent tab, ArrowRight moves to the next tent, and Timeline sensor-source chips measure at least 44px tall. Read-only; NOT_MEASURED until then
active_writer: PostHog Desktop self-driving Claude session (this run)
decisions: (1) Roving tabindex and keys are added to the existing raw tab buttons, not Radix ui/tabs: Radix Tabs triggers select on mousedown, and existing tests select with a click. (2) One tabpanel element; every tab has aria-controls to it, and aria-labelledby follows the selected tab. (3) The status <p> always renders with role=status and aria-live=polite; it is empty in editing/saving phases and uses empty:sr-only, so it adds no gap. A conditional mount would insert the region with its first message, which screen readers often do not announce. (4) The Button/Textarea/Label primitives give the shared focus-visible ring; h-auto min-h-11 whitespace-normal keeps the 44px height and lets long tent names wrap. (5) Timeline uses the existing precedent min-h-11 sm:min-h-9 (ActionQueue.tsx) on Button size=sm, and min-h-11 sm:min-h-0 on chips and links, so desktop is unchanged. (6) Grower-response badge teal -> info token; loop-decision badge purple -> primary token. Yellow/cyan badges were left; the report named teal and purple only.
tried_and_rejected: asserting no h-9 class on sm buttons; min-height overrides height, so h-9 with min-h-11 still renders 44px.
commands: bunx vitest run src/test/field-notebook-tabs-a11y.test.tsx src/test/field-notebook.test.tsx src/test/timeline-page-read-state.test.tsx; bun run typecheck; bunx eslint src/components/FieldNotebook.tsx src/pages/Timeline.tsx
files_touched: src/components/FieldNotebook.tsx, src/pages/Timeline.tsx, src/test/field-notebook-tabs-a11y.test.tsx, src/test/field-notebook.test.tsx, src/test/timeline-page-read-state.test.tsx, docs/agents/handoffs/VER-508-FIELD-NOTEBOOK-TIMELINE-A11Y.md
files_remaining: none planned
blockers: none
open_questions: Timeline stage-progress dots and other text-[11px] badges are not interactive, so they were not changed.
gotchas: field-notebook.test.tsx used findByTestId for the status line; the line now always exists, so that test waits for the text instead. PR #3022 (open) also edits src/pages/Timeline.tsx; expect a merge conflict in the later PR. No save logic, schema, RLS, auth, Edge or production change.
links: https://github.com/Verdant-OS/verdant-grow-diary/issues/3075; https://linear.app/verdantgrowdiary/issue/VER-508
artifacts: required CI on the draft PR at the pushed head
reviewer_seat: eligible independent reviewer per the roster, not this session
reviewer_sha: none yet
session_state: PostHog Desktop self-driving run; no routines or paused workflows; no pending human decision
claimed_by: PostHog Desktop self-driving Claude session, 2026-11-24
owner: PostHog Desktop self-driving Claude session
last_updated: 2026-11-24, by PostHog Desktop self-driving Claude session
```
