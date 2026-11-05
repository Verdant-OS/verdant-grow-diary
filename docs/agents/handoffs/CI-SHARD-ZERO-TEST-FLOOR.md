# CI-SHARD-ZERO-TEST-FLOOR

```text
TASK CI-SHARD-ZERO-TEST-FLOOR  priority: other  status: CLOSED
goal: A required "Full test suite (shard N/32)" check cannot go green while a sub-shard ran zero tests.
why: Deep audit 2026-11-05 at deploy tip e4c2fc02dda02d28bab3529f62ba311df6570a57, finding F-04. Each of the 256 sub-shards ran `vitest run --shard=n/256 ... --passWithNoTests` and nothing asserted a test count. Measured locally: on empty discovery vitest exits 0 and its JSON report shows numTotalTestSuites 0 and numTotalTests 0, so an include/exclude regression or a setup-file crash that yields zero files would pass all 32 required contexts.
branch: claude/ci-zero-test-floor
base: verdant-grow-diary
checkout: git fetch origin claude/ci-zero-test-floor verdant-grow-diary && git switch claude/ci-zero-test-floor
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2892 (readied 09:46 UTC; cheekhimself review 5783229146 "approved" and enqueued 10:13 UTC)
head_sha: 001d3aee4898aff7adfdb081cccdb57a7703e8f2 (final PR head; code commit bde441d4815863a84719530d56a909742716f26b)
state: CLOSED. Merged as e324f83fe65a4186046b10b6227009448f29ef24 (#2892) on 2026-11-05 (pull_request.closed event 10:29:54Z) through the merge queue. Closed 2026-11-05 by Claude session_017UoYKy4m7tV5CyJMwrFb2X (the slice author) in the closure PR named on GitHub; no code changed after 001d3aee.
current_step: merged. Required contexts at 001d3aee: ci.yml run 42005086158 success (readied run; the 32 shard jobs exercised the new assert); check_suite.completed reported nothing failed at 10:08 UTC. Codex code and security reviews completed with no findings (informational, not independent acceptance).
next_action: none; closed. The post_merge_check below still applies: the first merge_group or deploy run at or after e324f83f should show the assert line in all 32 shard jobs. NOT_MEASURED here.
post_merge_check: the next merge-queue run shows "assert-vitest-shard-ran-tests: <report>: N test file(s), M test(s)" in every one of the 32 shard jobs; a deliberate dry run with `--shard` pointed at an empty directory is not needed on production CI.
active_writer: Claude session_017UoYKy4m7tV5CyJMwrFb2X
decisions: Keep --passWithNoTests (its removal would change exit semantics for a reason this slice did not trace) and add a floor on the resolved JSON counters instead: each sub-shard writes `--reporter=default --reporter=json --outputFile=$RUNNER_TEMP/vitest-shard-<n>.json`, then `node scripts/assert-vitest-shard-ran-tests.mjs <report>` fails the step on a missing or malformed report, zero test files, or zero tests. The pure rule lives in scripts/lib/vitestShardFloorRules.mjs. The regression test parses ci.yml with the `yaml` package and asserts on the step's resolved `run` value, not a regex over the file.
tried_and_rejected: grepping vitest's console text for "No test files found" (wording-dependent); dropping --passWithNoTests (untraced reason for its presence).
commands: bunx vitest run src/test/vitest-shard-floor.test.ts --reporter=dot; node scripts/test-vitest-workflow-safety.mjs; node scripts/assert-vitest-shard-ran-tests.mjs <path-to-vitest-json>; node scripts/scorer-lock.mjs --report --strict
files_touched: .github/workflows/ci.yml (renegotiated locked check; declared with scripts/scorer-lock.mjs); scripts/assert-vitest-shard-ran-tests.mjs (new); scripts/lib/vitestShardFloorRules.mjs (new); src/test/vitest-shard-floor.test.ts (new; RED before the change: import failure, then the workflow assertion); docs/agents/handoffs/CI-SHARD-ZERO-TEST-FLOOR.md
files_remaining: none for this slice
blockers: none
open_questions: none
gotchas: The shard step uses only matrix.shard and RUNNER_TEMP, no event-derived input. The assert's exit code was verified locally: 1 on a zero-test report and on a missing file, 0 on a real report.
links: audit finding F-04; config/required-status-checks.json (the 32 shard contexts)
artifacts: none in the repository besides the test
reviewer_seat: Reviewer D (Maui Wowie) [ROUTE] posted 2026-11-05 ~09:35 UTC (PR comment 6654611572); no verdict was recorded before the merge. cheekhimself reviewed ("approved", state commented), enqueued and merged. Independent exact-head PASS at 001d3aee: NOT_MEASURED.
reviewer_sha: NOT_MEASURED
session_state: no production access
claimed_by: Claude session_017UoYKy4m7tV5CyJMwrFb2X, 2026-11-05 09:20 UTC
owner: Claude
last_updated: 2026-11-05 04:35 CT, by Claude
```
