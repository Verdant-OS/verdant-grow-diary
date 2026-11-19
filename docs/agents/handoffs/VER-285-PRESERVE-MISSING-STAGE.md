# VER-285-PRESERVE-MISSING-STAGE

```text
TASK VER-285-PRESERVE-MISSING-STAGE  priority: P2  status: CLOSED
closed: merged. #2537 merged into verdant-grow-diary on 2026-10-27 as cbdd6acb0e22cfaef381f3704a0c33394f54cd26 (final SHA; first-parent commit on origin/verdant-grow-diary, read 2026-11-11; merge date from the GitHub search API). Closed by Claude session_017UoYKuyQKXVV93JSwJJztt on 2026-11-11 at Matthew's request (source claim: his answer in that session). This close does not resolve the post_merge_check, open_questions or blockers below; they are carried forward in docs/agents/handoffs/CLOSE-STALE-HANDOFF-BLOCKS-20261111.md.
goal: Preserve an absent historical stage when editing unrelated Timeline fields; save deliberate stage changes only.
why: EntryEditDialog initializes falsy stages to veg and includes stage in every update, silently creating historical data.
branch: codex/ver-285-preserve-missing-stage
base: verdant-grow-diary at 21b267a217f4d2d1b1a53a4ba77b85e9903cd418
checkout: git fetch origin codex/ver-285-preserve-missing-stage verdant-grow-diary && git switch codex/ver-285-preserve-missing-stage
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2537 (draft)
head_sha: Read the full current head of draft #2537; this implementation commit cannot name itself. Parent is 1630600154a112d6bdbb4881e7fb408627660cd0.
state: Implemented and locally validated: 104 tests pass, full TypeScript check passes, scoped ESLint/Prettier pass. Hosted checks and independent acceptance are NOT_MEASURED at this new head.
current_step: The 19 new mounted regressions failed 17/19 against base (2 explicit-stage controls passed). Final focused suite: 9 files, 104 passed / 0 failed / 0 skipped.
next_action: Read #2537 full head and required CI; after green, route one eligible independent non-contributing Claude/Grok review. Stay draft; no merge or deploy.
post_merge_check: After separately authorized release, verify a note-only edit keeps an unrecorded stage and stage counts unchanged after reload. No production write is authorized by this task.
active_writer: Codex VER-285 session; Matthew explicitly requested the narrow correction and authorized draft workflow.
decisions: Use an explicit unrecorded UI state; omit stage from UPDATE and callback unless the grower changes it. Preserve raw absent/legacy values on unrelated edits. Keep new tests separate from locked existing tests.
tried_and_rejected: No plant-stage lookup exists here; current-stage attribution was coincidental. Do not backfill rows or change Timeline filters, creation defaults, schema, or linked Quick Log revision paths.
commands: node node_modules/vitest/vitest.mjs run src/test/entry-edit-stage-preservation.test.tsx src/test/entry-edit-linked-quicklog-guard.test.tsx src/test/timeline-stage-not-recorded.test.ts src/test/timeline-stage-label-render.test.tsx src/test/timeline-chip-counts-match-list.test.tsx src/test/quicklog-corrections-static-safety.test.ts src/test/timeline-photo-edit-resign.test.ts src/test/timeline-photo-edit-signing-followups.test.ts src/test/v0-operating-loop-contract.test.ts --reporter=dot; node --max-old-space-size=6144 node_modules/typescript/bin/tsc -p tsconfig.json --noEmit; node node_modules/eslint/bin/eslint.js src/components/EntryEditDialog.tsx src/test/entry-edit-stage-preservation.test.tsx; node scripts/scorer-lock.mjs --report --base 21b267a217f4d2d1b1a53a4ba77b85e9903cd418 --strict
files_touched: src/components/EntryEditDialog.tsx; src/test/entry-edit-stage-preservation.test.tsx (new); docs/agents/HANDOFF_LOG.md (this block only)
files_remaining: None planned; no new rules helper needed because the existing stage presentation helper is reused.
blockers: Required CI and eligible independent exact-head acceptance remain pending. Local full test suite and build SKIPPED; required hosted CI must provide these gates. Default Node heap exhausted during initial tsc; 6144 MB rerun exposed four invalid test-query options, corrected before the final clean full tsc run. No production verification permitted in this task.
open_questions: None for historical-stage behavior.
gotchas: Supabase update returns only id. Tests serialize actual editor UPDATE payloads into a synthetic persistence store, then remount from a separate read; this is not a real DB or production readback receipt. Untouched null, empty, omitted, unknown, whitespace and legacy stage values are preserved. Clearing a stage explicitly writes null; the UI sentinel never reaches persistence. Existing details serialization is outside scope.
links: https://linear.app/verdantgrowdiary/issue/VER-285/editing-a-timeline-entry-with-no-stage-silently-saves-the-stage-the
artifacts: New mounted test file and PR validation summary. Existing linked-Quick-Log and zero-row guards pass unchanged. Lint/format/whitespace, scorer lock and docs-safety PASS. All 126 open PR file lists inspected, no editor or stage-helper overlap. VER-285 was unassigned at intake; Linear now shows assignee Verdant after draft linking, no competing writer comment observed.
reviewer_seat: An actually available independent non-contributing Claude or Grok session; this Codex author is excluded. No request sent.
reviewer_sha: NOT_MEASURED
session_state: No subagents, review requests, production actions, or automations started. Public claim is in this draft handoff/body; no separate PR comments authorized.
claimed_by: Codex VER-285, 2026-10-25 01:52 CT
owner: Codex VER-285
last_updated: 2026-11-11, by Claude session_017UoYKuyQKXVV93JSwJJztt (close-out; previous 2026-10-25 01:52 CT, by Codex VER-285)
```
