# PHENO-CREATE-BLOCKED-REASONS-3083

```text
TASK PHENO-CREATE-BLOCKED-REASONS-3083  priority: P2  status: OPEN
goal: On /pheno-hunts/new, the disabled "Create Pheno Hunt" button must look disabled and the footer must say why it is disabled.
why: issue #3083. Create sits in the shared footer on every step and stays disabled until vm.canCreate. The disabled style still read as green on gradient-leaf, and the blocking reasons showed only on the checklist and confirmation steps, so a click on step 1 did nothing and showed nothing.
branch: posthog-self-driving/fixpheno-hunt-explain-why-create-is-6a937b (name fixed by the PostHog run that opened it)
base: verdant-grow-diary (started at 9c844347c691090eb56ecfa1b6eb63398d03e742)
checkout: git fetch origin posthog-self-driving/fixpheno-hunt-explain-why-create-is-6a937b verdant-grow-diary && git switch posthog-self-driving/fixpheno-hunt-explain-why-create-is-6a937b && git merge --ff-only "$VERIFIED_SHA" && test "$(git rev-parse HEAD)" = "$VERIFIED_SHA" && git merge origin/verdant-grow-diary
pr: see the draft PR from this branch (addresses #3083)
head_sha: see the PR head; this entry is in the first commit
state: pushed draft
current_step: first commit pushed with the fix, the new test and this entry
next_action: required CI at the PR head; then route an independent exact-head review per OWNERSHIP.md §4.3
post_merge_check: on https://verdantgrowdiary.com once /version.json reports the merged SHA, with the disposable test account and its fixture grow, open /pheno-hunts/new?growId=<fixture grow>: Create is outlined (not green) on step 1 and the footer lists "To create this hunt:" with the reasons. No write is needed. NOT_MEASURED until then.
active_writer: PostHog Desktop self-driving Claude session (this run)
decisions: (1) Both gates (#1840 goals review, #1160 confirm box) stay; only presentation changes. (2) Create stays in the footer on every step, because scorer-locked tests read ph-save-btn on early steps; it uses the outline variant without gradient-leaf while vm.canCreate is false. (3) The footer lists vm.blockingReasons under PHENO_CREATE_BLOCKED_HEADING on every step except checklist and confirmation, which already list them in-section (no duplicate list). (4) setupConfirmed is not saved in the draft: the #1160 confirm is a deliberate per-session act, and the confirm reason now shows when it resets.
tried_and_rejected: hiding Create on steps 1-5 (breaks scorer-locked pheno-hunt-onboarding-flow tests that read ph-save-btn before confirmation).
commands: bunx vitest run src/test/pheno-hunt-create-blocked-reasons.test.tsx --reporter=dot; bunx vitest run src/test/pheno-hunt* src/test/phenoHuntOnboardingViewModel.test.ts --reporter=dot; bun run typecheck
files_touched: src/pages/PhenoHuntNew.tsx, src/lib/phenoHuntOnboardingViewModel.ts, src/test/pheno-hunt-create-blocked-reasons.test.tsx, docs/agents/handoffs/PHENO-CREATE-BLOCKED-REASONS-3083.md
files_remaining: none planned
blockers: none
open_questions: none
gotchas: every file under src/test/ is a scorer path; this task adds a new file only and edits no existing test. phenoHuntOnboardingViewModel.ts is not in the edge shared-lib mirror.
links: https://github.com/Verdant-OS/verdant-grow-diary/issues/3083
artifacts: required CI on the draft PR at its head
reviewer_seat: eligible independent reviewer per the roster, not this session
reviewer_sha: none yet
session_state: PostHog Desktop self-driving run; no routines or paused workflows
claimed_by: PostHog Desktop self-driving Claude session, 2026-11-24
owner: PostHog Desktop self-driving Claude session
last_updated: 2026-11-24 09:30 CT, by PostHog Desktop self-driving Claude session
```
