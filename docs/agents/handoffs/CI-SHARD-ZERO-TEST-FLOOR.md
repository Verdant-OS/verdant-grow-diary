# CI-SHARD-ZERO-TEST-FLOOR

```text
TASK CI-SHARD-ZERO-TEST-FLOOR  priority: other  status: OPEN
goal: A required "Full test suite (shard N/32)" check cannot go green while a sub-shard ran zero tests.
why: Deep audit 2026-11-05 at deploy tip e4c2fc02dda02d28bab3529f62ba311df6570a57, finding F-04. Each of the 256 sub-shards ran `vitest run --shard=n/256 ... --passWithNoTests` and nothing asserted a test count. Measured locally: on empty discovery vitest exits 0 and its JSON report shows numTotalTestSuites 0 and numTotalTests 0, so an include/exclude regression or a setup-file crash that yields zero files would pass all 32 required contexts.
branch: claude/ci-zero-test-floor
base: verdant-grow-diary
checkout: git fetch origin claude/ci-zero-test-floor verdant-grow-diary && git switch claude/ci-zero-test-floor
pr: opened as a draft after this commit; read the URL from GitHub
head_sha: read the current head on GitHub
state: pushed draft
current_step: draft PR open; Matthew lifted the GitHub posting hold and approved pushing this branch 2026-11-05; reviewer routing pending.
next_action: route an eligible outside reviewer under OWNERSHIP.md §4.3 (.github is a protected scope; not the Graft low-risk lane); PR body names the renegotiated check .github/workflows/ci.yml.
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
reviewer_seat: not requested
reviewer_sha: NOT_MEASURED
session_state: no production access
claimed_by: Claude session_017UoYKy4m7tV5CyJMwrFb2X, 2026-11-05 09:20 UTC
owner: Claude
last_updated: 2026-11-05 03:45 CT, by Claude
```
