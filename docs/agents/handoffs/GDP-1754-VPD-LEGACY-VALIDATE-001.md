### GDP-1754-VPD-LEGACY-VALIDATE-001

```text
TASK GDP-1754-VPD-LEGACY-VALIDATE-001  priority: publish-gate  status: CLOSED
goal: Clear Blue Dream's invalid VPD/CO2 and legacy manual validation P1 findings.
branch: copilot/gdp-1727-fix-null-metrics
base: verdant-grow-diary
checkout: git fetch origin copilot/gdp-1727-fix-null-metrics verdant-grow-diary && git switch copilot/gdp-1727-fix-null-metrics && git merge origin/verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/1754
head_sha: 0384753ae911eca2a989694f8514f116dc903757
state: #1754 merged from unchanged head 0384753ae911eca2a989694f8514f116dc903757 at 2026-09-28 21:13:59 CT as 8b73b25a879e8d1fc526fdd7035ae1d368eab3f6. GDP merge record explicitly reports Blue Dream FAIL with remaining P1-A and Matthew ship-as-is override, not a reviewer PASS. Required checks 35/35; dependency advisory failures retained.
next_action: CLOSED as an owner-override merge. Remaining non-manual snapshot validation P1 belongs to separate GDP-1754-NONLIVE-SNAPSHOT-VALIDATE-001, requested as the first slice tomorrow. Local P2 candidate 34d7e2e81044cccd54670677e43e236896a2c350 stays preserved and unpushed; reconcile its alias assertions with that P1 before advancing.
files: Local P2 candidate: src/lib/timelineManualSensorMeasurementRules.ts; src/lib/timelineSensorSnapshotViewModel.ts; three focused existing Timeline test files. No Timeline presenter, SQL, Supabase, auth or lockfile change.
blockers: Production acceptance remains NOT_MEASURED: latest live identity at 21:17:30 CT is still 6ca97026437ab556f7fbac752abfbe8085c1f271. Known P1-A is not waived as passing code. Existing local P2 proof 252/252 does not cover that P1.
artifacts: https://github.com/Verdant-OS/verdant-grow-diary/pull/1754#issuecomment-5882244703; original P2 patch in Downloads remains local only.
reviewer_seat: Blue Dream
claimed_by: Codex, 2026-09-28 18:46 CT
last_updated: 2026-09-28 21:22 CT, by Codex
```
