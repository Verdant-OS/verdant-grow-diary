### CHEM-CI-QUEUE-CONCURRENCY

```text
TASK CHEM-CI-QUEUE-CONCURRENCY  priority: P1  status: CLOSED
goal: Cancel superseded PR runs without cancelling deploy SHA runs or suppressing required checks.
branch: codex/chem-ci-queue-concurrency
base: verdant-grow-diary
checkout: git fetch origin codex/chem-ci-queue-concurrency verdant-grow-diary && git switch codex/chem-ci-queue-concurrency && git merge origin/verdant-grow-diary
state: #1782 merged from a1486393de83668377f15ba1a900b9b69231f46f at 2026-09-28 21:13:58 CT as 5feb5471096735558021806b6dc2e90a009dd097. Protected-queue integration is confirmed. Required contexts 35/35 SUCCESS. Local scoped proof 57 PASS / 0 FAIL / 0 SKIP. The auxiliary native run remains 20 PASS / 1 FAIL / 0 SKIP and is not converted to acceptance by this merge.
next_action: CLOSED for scoped concurrency integration. Native retraction observation continues in existing #1738; production fixture-guard and locked dependency failures remain separate OPEN work. Runtime/queue reduction and production acceptance stay NOT_MEASURED.
files: Eligible PR workflow YAML and focused workflow-contract tests; exclude migration writers, apply lanes, dispatch-only groups, HOLD #1250 files and lockfiles.
blockers: Native job 109211384629 timed out waiting for disabled quicklog-retract-confirm after selecting accidental reason; cause NOT_MEASURED, not a proven flake. Locked dependency audits FAIL. Quick Log fixture check: 1 PASS / 1 FAIL / 0 SKIP; helper rejects production URL before write-producing smoke. Separate fixture-contract repair needed; do not change CI variables or bypass identity/ownership/tagging fences. Preview build and public/authenticated census remain pending at 21:12 CT.
artifacts: https://github.com/Verdant-OS/verdant-grow-diary/pull/1782; C:/Users/G8/Downloads/CHEM-CI-queue-measurement-2026-09-28.json; C:/Users/G8/Downloads/CHEM-1782-production-fixture-smoke-failure-2026-09-28.md
claimed_by: Codex, 2026-09-28 19:10 CT
last_updated: 2026-09-28 21:22 CT, by Codex
reviewer_seat: Blue Dream (P1 CI slice)
```
