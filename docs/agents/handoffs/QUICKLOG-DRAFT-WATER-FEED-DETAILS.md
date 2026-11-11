# QUICKLOG-DRAFT-WATER-FEED-DETAILS

```text
TASK QUICKLOG-DRAFT-WATER-FEED-DETAILS  priority: P2  status: OPEN
goal: The Quick Log sheet keeps typed Water details (volume, pH, EC, runoff, water temperature, pot feel) and Feed details (recipe, volume, pH, EC, runoff) when the sheet is closed or remounted and reopened for the same target.
why: Repository audit 2026-11-11 at c03ea6fd46707dde04eac0d0ef3e7c46db8b6bc8, finding 3; Matthew asked for this slice in the audit session. The session draft (src/lib/quickLogObservationDraftRules.ts) stored the note and basic readings only, and the open effect in src/components/QuickLogV2Sheet.tsx reset wateringForm and feedingForm, so a grower who typed volume, pH and runoff and brushed the sheet closed found blank fields with no notice.
branch: claude/quicklog-draft-water-feed
base: verdant-grow-diary at c03ea6fd46707dde04eac0d0ef3e7c46db8b6bc8
checkout: git fetch origin claude/quicklog-draft-water-feed verdant-grow-diary && git switch claude/quicklog-draft-water-feed
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2936 (draft)
head_sha: code at b59fd7ec02defb44e4ae01093bd5e88e20322e5f (2026-11-11); a docs-only commit recording this PR link follows it, so read the current head from the PR
state: implemented, local tests green, pushed draft
current_step: draft PR open, required CI and independent review pending
next_action: route one independent exact-head review once required checks are green
post_merge_check: after live /version.json reports the merge SHA, on the disposable fixture grow: open Quick Log for the fixture plant, choose Water, type a volume and pH, close the sheet without saving, reopen it for the same plant, and confirm both values and the "Restored your unsaved entry" notice. No save is needed. NOT_MEASURED until then.
active_writer: Claude session_017UoYKvCNSMryxiQZyBbit8
decisions: (1) The existing single session draft gains optional watering and feeding blocks plus the unit each temperature was typed in; older drafts without them still parse. (2) A block is stored only while its own action is active, and a stray block for another action is dropped on read. (3) A volume written only by the last-watering prefill, or a Feed form still equal to the applied last-used defaults, is not the grower's entry and never creates a draft, so reopening does not claim to restore something nobody typed. (4) The Feed note keeps travelling in form.note as before. (5) Details alone never take the one draft slot from an unsaved entry typed for a different target; src/test/quick-log-observation-draft-scope.test.tsx and src/test/quick-log-v2-sheet-watering.test.tsx pin that plant A's failed-save draft survives a Water or Feed saved for plant B, and both still pass unchanged. (6) Zero is content: a typed runoff of 0 is kept.
tried_and_rejected: letting details always write the draft (overwrote another target's failed-save draft; the two tests above caught it).
remaining_limit: with another target's unsaved entry in the slot, details typed for the current target are still not kept (same as before this change). Photos, the large-volume confirmation and maturity evidence are not part of the draft. Session storage only: a closed tab loses the draft.
commands: bunx vitest run src/test/quick-log-draft-water-feed-details.test.tsx --reporter=dot ; bun run typecheck:tsgo ; bunx eslint src/components/QuickLogV2Sheet.tsx src/lib/quickLogObservationDraftRules.ts src/test/quick-log-draft-water-feed-details.test.tsx
files_touched: src/lib/quickLogObservationDraftRules.ts; src/components/QuickLogV2Sheet.tsx; src/test/quick-log-draft-water-feed-details.test.tsx (new); docs/agents/handoffs/QUICKLOG-DRAFT-WATER-FEED-DETAILS.md (new)
files_remaining: none for this slice
blockers: none
open_questions: none
gotchas: `bun run typecheck` (tsc) runs out of heap at Node's default in the authoring container; export NODE_OPTIONS=--max-old-space-size=8192 before committing because the pre-commit hook runs tsc.
links: none besides the PR
artifacts: the test file above
reviewer_seat: none routed yet
reviewer_sha: none
session_state: PR activity subscription held by the authoring session; no routines, no paused workflows; pending human decisions: review routing and the per-item merge yes
claimed_by: Claude session_017UoYKvCNSMryxiQZyBbit8, 2026-11-11 20:40 UTC
owner: Claude session_017UoYKvCNSMryxiQZyBbit8
last_updated: 2026-11-11 14:40 CT, by Claude session_017UoYKvCNSMryxiQZyBbit8
```
