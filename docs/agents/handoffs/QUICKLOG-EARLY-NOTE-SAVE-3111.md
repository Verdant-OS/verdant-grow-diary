# QUICKLOG-EARLY-NOTE-SAVE-3111

```text
TASK QUICKLOG-EARLY-NOTE-SAVE-3111  priority: P2  status: OPEN
goal: Save log in the plant-page Quick Log saves an entry when the grower typed text only in the early-stage "What changed?" field (#3111).
why: runSubmit in src/components/QuickLog.tsx checked only the Short note value. The "What changed?" text is in a different state value (earlyNotes) and already reaches the saved diary note as "Early note: ..." through buildEarlyStageNoteSuffix. The save was rejected with "Add a quick note" and focus moved to Short note, although the field says "Optional".
branch: posthog-self-driving/fixquick-log-accept-what-changed-text-a538f1 (name fixed by the PostHog run harness)
base: verdant-grow-diary (started at 19dd62a9e65d4d102c75f41eeb85cc2d89488034)
checkout: git fetch origin posthog-self-driving/fixquick-log-accept-what-changed-text-a538f1 verdant-grow-diary && git switch posthog-self-driving/fixquick-log-accept-what-changed-text-a538f1 && git merge --ff-only "$VERIFIED_SHA" && test "$(git rev-parse HEAD)" = "$VERIFIED_SHA" && git merge origin/verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/3113 (draft)
head_sha: code commit 7cd32532f86a493babde7eae1c8ff464ca712da2 (observed on the remote 2026-11-27 21:25 CT); this handoff update sits on top of it. Use the PR's live head for review.
state: pushed draft
current_step: fix and test committed together; RED proven locally (2 of 7 new tests fail without the QuickLog.tsx wiring)
next_action: confirm CI is green at the PR head, then request an eligible independent exact-head review
post_merge_check: on https://verdantgrowdiary.com once /version.json reports the merged SHA, with the disposable test account and a seedling-stage fixture plant: open Quick Log, type a [smoke <timestamp>] note only in "What changed?", tap Save log; one entry saves and Timeline shows "Early note: [smoke <timestamp>] ...". With both note fields empty, Save log still shows "Add a quick note".
active_writer: PostHog self-driving Claude session (inbox report 01a22012-24ee-7265-a9b4-9ca21c9d3b0c)
decisions: a pure helper hasQuickLogNoteText({ note, earlyNotes }) in src/lib/earlyStageQuickLogRules.ts decides the note gate; QuickLog.tsx only calls it. The validation preview gets the early note when Short note is empty, so it stops showing "Add a quick note before saving." while the grower has typed note text. quickLogPreviewRules.ts is unchanged. The "Early note:" prefix in the saved note is kept (it is intended). The helper lives in the early-stage rules file, not in quickLogNoteSaveRules.ts, to stay clear of open PR #3105.
tried_and_rejected: copying "What changed?" text into Short note (changes the saved note shape and the early_stage envelope); making Short note required and relabeling (changes copy and does not match the field's "Optional" promise).
commands: bunx vitest run src/test/quick-log-early-note-save.test.tsx src/test/quick-log-early-stage-milestones.test.tsx --reporter=dot && bun run typecheck
files_touched: src/lib/earlyStageQuickLogRules.ts, src/components/QuickLog.tsx, src/test/quick-log-early-note-save.test.tsx
files_remaining: none planned
blockers: none. 10 tests in quick-log-starter-water-uncertain-recovery.test.tsx and quick-log-recent-target-chip.test.tsx fail on the base commit too under Node 26 in the sandbox; CI is the evidence.
open_questions: none
gotchas: open PR #3105 also edits QuickLog.tsx (runSubmit area); the second PR to land needs a rebase. The header Quick Log (QuickLogV2Sheet.tsx) has no "What changed?" field and is out of scope. No schema, RLS, edge, auth, billing or production change. No migration.
links: https://github.com/Verdant-OS/verdant-grow-diary/issues/3111
artifacts: PR checks on the draft PR
reviewer_seat: eligible independent reviewer, not this session
reviewer_sha: none yet
session_state: PostHog self-driving run; no routines or paused workflows
claimed_by: PostHog self-driving Claude session, 2026-11-27 21:18 CT
owner: PostHog self-driving Claude session
last_updated: 2026-11-27 21:30 CT, by Claude
```
