# CSV-IMPORT-TIME-INTEGRITY

```text
TASK CSV-IMPORT-TIME-INTEGRITY  priority: P1  status: OPEN
goal: Environment CSV import never saves a reading at a guessed time. Unzoned clock times need an explicit source time zone; DST folds/gaps are never guessed; soil-only and partly supported files say plainly what isn't imported.
why: Matthew's brief "Priority: fix Spider Farmer CSV import integrity" (2026-11-05, baseline cd6f8fab13a950c73033b91cdb130a6ef9ee35c1). csvParser.parseFlexibleDate built Date.UTC from local-looking "YYYY-MM-DD HH:mm:ss" strings, so a Chicago export landed 5-6 hours early, and the Nov 1 01:00-01:55 fold was silently accepted. The modal also masked the parser's soil-only reason with generic "couldn't read" copy and never listed omitted soil columns.
branch: claude/new-session-rd9w2e
base: verdant-grow-diary @ cd6f8fab13a950c73033b91cdb130a6ef9ee35c1
checkout: git fetch origin claude/new-session-rd9w2e verdant-grow-diary && git switch claude/new-session-rd9w2e
pr: draft, see branch on GitHub
head_sha: see the branch tip; local commit only until push
state: implementation and test renegotiation done; pushed as a draft PR awaiting CI and independent review.
current_step: Matthew approved the scorer unlock in-session (2026-11-05). Five locked tests renegotiated; scorer-lock --report --base cd6f8fab: 5 changed, 0 still locked.
next_action: watch required CI at the PR head; route an eligible independent reviewer (not this session) per OWNERSHIP.md §4.3.
post_merge_check: on https://verdantgrowdiary.com, once live /version.json reports the merge SHA: import a synthetic unzoned CSV into a verified disposable fixture tent, choose America/Chicago, confirm stored captured_at matches the preview's UTC instant. NOT_MEASURED until then.
active_writer: Claude session_017UoYKypTBCTMSkumzPzSJa
decisions:
  - New pure src/lib/csvTimestampRules.ts (interpretCsvTimestamp, isValidIanaTimeZone). Supported formats are an explicit list; the host-dependent Date.parse fallback is removed. Explicit Z/±HH:MM/±HHMM are instants and never re-shifted. Wall clock + Intl date-aware zone conversion; fold -> "ambiguous" with both candidates, gap -> "nonexistent". Strict calendar validation, no rollover. MM/DD/YYYY stays month-first (pre-existing contract), date-only = 00:00 wall clock; both need a zone.
  - Parser: unresolved rows go to result.unresolvedTimeRows (needs_source_time_zone | ambiguous_local_time | nonexistent_local_time), never to validRows. Every valid row carries time_provenance {source_text, basis, source_time_zone, utc_offset}. parseEnvironmentCSV/Text take { sourceTimeZone }; unknown zone -> file error invalid_time_zone.
  - View model: new phase time_confirm before unit_confirm. rowsToPersist returns [] and canConfirmImport is false while any time is unresolved. Safe initial behavior per brief: a fold/gap blocks the WHOLE file (no "import the rest" workflow; that is an open product decision).
  - Modal: native <select> of Intl zones, device zone listed first and labeled but never preselected; preview shows source text, zone, offset and ISO UTC for first row, each offset change and last row; parse-generation guard drops stale parses after file replacement/reset; Confirm disabled and re-checked in the handler.
  - Persistence: persistCsvEnvironmentRows refuses the whole batch (client never called) if any row's captured_at is not canonical ISO UTC or its time_provenance does not re-derive exactly that instant. time_provenance is copied into raw_payload. Rows with NO provenance (hand-built, legacy) still pass the provenance step; requiring it would touch ~35 locked test fixtures — follow-up.
  - Soil: modal shows CSV_SOIL_ONLY_MESSAGE instead of the generic no_sensor_data copy; preview lists unsupported (soil) columns. Preview partial copy is now preview-tense: "Ready to import. N rows will be skipped. Nothing is saved until you confirm." (pin renegotiated in environment-csv-import-view-model.test.ts).
tried_and_rejected: appending one fixed offset per file (wrong across DST); defaulting to browser zone (the brief forbids an unconfirmed suggestion becoming fact).
commands: bunx vitest run src/test/csv-import-source-time-zone.test.tsx --reporter=dot (also with TZ=America/Los_Angeles); the 34 CSV-related test files listed in this session; NODE_OPTIONS=--max-old-space-size=8192 bun run typecheck
files_touched: src/lib/csvTimestampRules.ts (new); src/lib/csvParser.ts; src/lib/environmentCsvImportViewModel.ts; src/lib/environmentCsvImportPersistence.ts; src/lib/environmentCsvPreviewCopyRules.ts; src/components/EnvironmentCsvImportModal.tsx; src/test/csv-import-source-time-zone.test.tsx (new); this file
files_remaining: none for this slice. Renegotiated (owner-approved unlock): src/test/csv-parser.test.ts, src/test/environment-csv-import-ui.test.tsx, src/test/environment-csv-import-view-model.test.ts, src/test/import-grow-sensor-csv-parser-copy.test.ts, src/test/import-grow-sensor-csv-unit-copy.test.ts
blockers: none in code. Independent review and required CI pending.
open_questions: (1) optional "exclude unresolved DST rows and import the rest" workflow; (2) require time_provenance at the write boundary for every row; (3) first-class soil import (separate reviewed slice).
gotchas: tsc needs NODE_OPTIONS=--max-old-space-size=8192. Do not whole-file prettier legacy files. Full-original replay of the 11 private Alpha/Bravo files is BLOCKED: the files were not supplied to this session; only synthetic fixtures ran.
links: brief CLAUDE_SPIDER_FARMER_CSV_FIX_BRIEF.md (owner upload); #2808 soil guard preserved; #2895 untouched; #2796 recovery tracking
artifacts: none in the repository besides the tests
reviewer_seat: not yet routed (no PR)
reviewer_sha: NOT_MEASURED
session_state: no production access; no writes outside this checkout
claimed_by: Claude session_017UoYKypTBCTMSkumzPzSJa, 2026-11-05 18:00 UTC
owner: Claude
last_updated: 2026-11-05 12:40 CT, by Claude
```
