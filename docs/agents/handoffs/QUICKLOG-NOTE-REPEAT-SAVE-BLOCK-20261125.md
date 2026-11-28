# QUICKLOG-NOTE-REPEAT-SAVE-BLOCK-20261125

```text
TASK QUICKLOG-NOTE-REPEAT-SAVE-BLOCK-20261125  priority: P2  status: OPEN (unclaimed)
goal: the same note, on the same plant, saved again after Quick Log was closed and reopened, is blocked instead of making a second diary entry.
why: Matthew's decision, 2026-11-25 02:13 CT: "it should be blocked to avoid duplication." Live check that day on prod 8c7a96ab49c3: #3031's guard (isDuplicateOfPanelSavedNote) only holds while one Quick Log stays open. Note-box Save now closes Quick Log (45c217f7), and reset() in src/components/QuickLog.tsx clears panelSavedNote and rotates the save key on close. So reopening and saving the same text writes a second entry, by design today. The in-dialog duplicate path can no longer be reached.
evidence: live run 2026-11-25 02:09 CT (cheekhimself@gmail.com, owner-approved, plant BREAK-4pm-2 / Fixture Tent A): step 1 pass, step 3 pass, step 2 not run because it would have written a duplicate. 8 test files / 150 tests green locally at 8c7a96ab. Results sheet: https://claude.ai/artifact/2396Qu6GXN6yWtkwLYNzx5
task_file_branch: claude/quicklog-note-repeat-save-block-task (docs-only; the build gets its own branch)
task_file_pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/3102 (draft)
base: verdant-grow-diary at 8c7a96ab49c3af9b6dc497535f7ea8cebe6238e6
acceptance:
  1. Save note text T on plant P (Note box or Save log). Close Quick Log. Reopen it on P and save T again: no second entry is written, and the grower sees why (reuse QUICK_LOG_NOTE_ALREADY_SAVED_COPY or a close variant).
  2. Comparison uses normalizeQuickLogNoteText (it trims and collapses whitespace; decide case sensitivity in the spec).
  3. A different note on P, the same note on another plant, and structured entries (watering, feeding, environment, photo) still save.
  4. The block survives a page reload, so it reads saved entries, not component state.
  5. A 10-minute window bounds it (Matthew, 2026-11-25): after 10 minutes the same text saves.
  6. A failed or uncertain earlier save never blocks a retry of that same save (keep the idempotency-key recovery path working).
  7. Hard block: no "Save anyway" button. The grower changes the text to log another entry.
  8. Both Quick Logs: the plant-page Quick Log (QuickLog.tsx) and the header Quick Log (QuickLogV2Sheet.tsx / quicklog_save_manual path).
approach (proposed): a pure rule in src/lib/quickLogNoteSaveRules.ts, e.g. isRepeatOfRecentSavedNote({ note, plantId, eventType, recentEntries, now, windowMinutes }), fed by the plant's recent diary entries already loaded for Recent Activity / history. QuickLog.tsx and QuickLogV2Sheet.tsx only call it and show the message. Client-side only.
non_goals: no schema, RLS, edge-function, auth, billing or migration change (server-side dedupe would be a separate, explicitly approved task). No change to the in-dialog guard from #3031.
tests: pure-rule unit tests (same text in window, outside window, other plant, other text, structured types, whitespace variants, null/absent inputs); component test: save, close, reopen, same text -> blocked, no RPC call; regression: different text still calls the RPC once.
commands: bunx vitest run src/test/quick-log-note-save-rules.test.ts src/test/quick-log-note-panel-single-save.test.tsx <new test files> --reporter=dot
decisions (Matthew, 2026-11-25 02:13-02:20 CT): block repeats; 10-minute window; hard block, no override; cover both Quick Logs.
open_questions: case sensitivity of the comparison (default: case-sensitive, as normalizeQuickLogNoteText leaves case alone).
gotchas: #3031's handoff (QUICKLOG-NOTE-SINGLE-SAVE-TENT-NAV-20261119.md) still says OPEN; it merged 2026-11-19. Its owner should close it; this task does not edit it.
owner: none yet
claimed_by: none
reviewer_seat: eligible independent reviewer, not the builder
last_updated: 2026-11-25 02:30 CT, drafted by Claude (session_017UoYKx19oMzCZE2sgrszVD)
```
