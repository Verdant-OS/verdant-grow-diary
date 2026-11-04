### CHEM-1769-SENSOR-HISTORY-REPAIR

```text
TASK CHEM-1769-SENSOR-HISTORY-REPAIR  priority: P2  status: CLOSED
goal: Preserve display-only rounding and invalid-reading disclosure while repairing whole-number format regressions in existing CSV unit and native browser coverage.
branch: copilot/imported-sensor-history-display-fix
base: verdant-grow-diary
checkout: None; closed (merged). Historical: git fetch origin copilot/imported-sensor-history-display-fix verdant-grow-diary && git switch copilot/imported-sensor-history-display-fix && git merge origin/verdant-grow-diary
state: CLOSED (merged). Last recorded open state: Draft 919ab0853611be50f4d04848a642844fbecd933f retains the compact-format repair. Local 7 files / 153 PASS / 0 FAIL / 0 SKIP, including 15 added cases; typecheck 0, lint 0/0 and formatting PASS. New-head native job 109222694539 PASS: 21/21, 0 failed, 0 skipped, 1 worker. At 21:46 CT all 35 required contexts SUCCESS. Root fast-uri and nested undici dependency audits FAIL; both current failed logs read.
next_action: None; closed. Production delivery of this change is NOT_MEASURED here.
files: src/components/ImportedSensorHistoryPanel.tsx; src/lib/importedSensorHistoryViewModel.ts; src/test/imported-sensor-history-panel.test.tsx; src/test/imported-sensor-history-view-model.test.ts; src/test/csv-history-ai-doctor-full-chain.test.tsx (two displayed VPD expectations only; raw/storage assertions retained).
blockers: Historical native browser run remains 14 PASS / 7 FAIL; current-head native execution is now PASS 21/21. Independent acceptance NOT_MEASURED. Root fast-uri and nested undici repairs remain locked; no dependency waiver, SQL, Supabase, auth, Edge, harness or Action Queue edit.
artifacts: https://github.com/Verdant-OS/verdant-grow-diary/pull/1769; C:/Users/G8/Downloads/CHEM-1769-repair-handoff-2026-09-28.md; final seven-file test, typecheck, lint and formatter receipts in Downloads.
reviewer_seat: Blue Dream (component and .tsx tests)
claimed_by: Codex, 2026-09-28 20:59 CT
last_updated: 2026-10-13 16:20 CT, by Claude (log maintenance on owner instruction; not a claim). Earlier entry: 2026-09-28 21:47 CT, by Codex
closure: #1769 merged as fa30e075eefa6aa545165b54cc6ca93aed649398 at 2026-09-30 01:08:46 UTC from final head 336cbecf3e9ebb04b4a4032114df16298e362e88. Verified on the deploy branch with git merge-base --is-ancestor at 2026-10-13 16:20 CT.
head_sha: 919ab0853611be50f4d04848a642844fbecd933f
```
