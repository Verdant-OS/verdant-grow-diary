### CHEM-1773-UNKNOWN-FRESHNESS

```text
TASK CHEM-1773-UNKNOWN-FRESHNESS  priority: P2  status: CLOSED
goal: Block standard retry when accepted evidence freshness cannot be established.
branch: copilot/ai-doctor-retry-guard-helper
base: verdant-grow-diary
checkout: git fetch origin copilot/ai-doctor-retry-guard-helper verdant-grow-diary && git switch copilot/ai-doctor-retry-guard-helper && git merge origin/verdant-grow-diary
state: Owner merge observed: #1773 landed as 61821446ebd7e4fb30a36a5a95b7526a34515df5 from c2fa6e134e7637ed229339a41517eecf22b8d94d. Supplied correction patch sha256 66d2e98e307db02088afb1df7d9605726d3926e7ce4dbf8230f1bf359360dd9b retained. Earlier exact-head local validation: 16 files / 360 PASS / 0 FAIL / 0 SKIP; tsgo 0, lint 0/0, format 5 files. Codex did not merge or issue independent acceptance. Production behavior NOT_MEASURED.
next_action: Repository implementation task closed at owner merge 61821446; release verification continues in CHEM-RELEASE-001. Preserve accepted visibility and historical-review exemption.
files: src/components/PlantDetailAiDoctorLiveReview.tsx; src/lib/aiDoctorLiveReviewRecoveryRules.ts; the existing three focused AI Doctor tests.
blockers: Live credit/runtime acceptance and independent review receipt remain NOT_MEASURED; a merged commit is not production acceptance.
artifacts: https://github.com/Verdant-OS/verdant-grow-diary/pull/1773; C:/Users/G8/Downloads/CHEM-1773-current-head-regression-2026-09-28.log
reviewer_seat: Blue Dream (component and .tsx tests)
claimed_by: Codex, 2026-09-28 20:41 CT (verification follow-up; preserve the submitted correction)
last_updated: 2026-09-28 22:13 CT, by Codex
```
