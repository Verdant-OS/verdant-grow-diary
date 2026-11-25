# QUICKLOG-NOTE-REPEAT-SAVE-BLOCK-20261125

```text
TASK QUICKLOG-NOTE-REPEAT-SAVE-BLOCK-20261125  priority: P2  status: OPEN
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
open_questions: none. Case sensitivity decided: case-sensitive, as normalizeQuickLogNoteText leaves case alone (recorded in the PR body).
build_pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/3105 (branch cursor/quicklog-note-repeat-save-f2cc; the PR stays as it was opened, not draft; gated)
takeover: Cheek's word 2026-11-25 04:22 CT ("Take over #3105"). Taken from Pineapple Express (Cursor agent) at head 75e1e08a98585cdeef8d28ec98425dfffb0a5754, which Claude checked had not moved before pushing. Pineapple stands down on this branch. VReviewer's approval at 75e1e08a is now historical.
build_decisions (Claude, 2026-11-25):
  - Source of truth is saved diary rows: the diary_entries query (the one Recent Activity uses), subscribed while each Quick Log is open, so it refetches on open and holds after a reload and across devices. #3105's localStorage copy is removed. Client-side read only; no schema, RLS, edge, auth or migration change.
  - Only a plain note can repeat. A row or save with a photo, typed readings (manual_sensor_snapshot / manual_provenance / p_temperature_c etc.), water, an issue subtype or a structured check never matches. The tent snapshot a legacy note attaches on its own (details.sensor) does not count as structure. This fixed shard 17 at 75e1e08a: PlantQuickLog blocked a second photo save with the same caption (plant-quick-log-photo-source-picker.integration.test.tsx, unchanged).
  - The 10-minute window counts from the row's created_at (entry_at only as fallback), so a backdated note counts from when it was saved; |now - saved| also covers a device clock up to 10 minutes ahead.
  - A retry of the same unconfirmed save (same idempotency key: lastFailedSaveSigRef in QuickLog.tsx, saveKeyRef signature in PlantQuickLog.tsx, activitySaveKeyRef signature in QuickLogAllActivitiesSection.tsx, pendingManualSubmission in QuickLogV2Sheet.tsx) is never blocked, even when the lost-response row already reached the diary.
residual_risks: a save in the first moments after opening, before the diary read lands, is not blocked; a backdated note older than the newest ~1000 diary rows by entry_at is not in the read. Both fail open (the note saves).
verified: package install refused from this workspace (lockfile points at the Lovable private npm cache; proxy 403), so vitest and tsc were not run locally. Prettier 3.8.1 --check passes on every file this build touched. CI on the pushed head is the test record.
gotchas: #3031's handoff (QUICKLOG-NOTE-SINGLE-SAVE-TENT-NAV-20261119.md) still says OPEN; it merged 2026-11-19. Its owner should close it; this task does not edit it.
owner: Claude (thread session for task ub771b46c6cccc79dd0f5f49cc89a2d06)
claimed_by: Claude, 2026-11-25 10:28 UTC
reviewer_seat: eligible independent reviewer, not the builder
excluded_from_review: Pineapple Express (authored 6fc23f2 through 75e1e08a) and this Claude session (repairer); routing is Seats A and C via UK Cheese, at the exact pushed head
last_updated: 2026-11-25 04:28 CT, Claude took over #3105 and pushed the saved-entries rebuild (previous: 2026-11-25 02:30 CT, drafted by Claude session_017UoYKx19oMzCZE2sgrszVD)
```
