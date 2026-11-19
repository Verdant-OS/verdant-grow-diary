# CODEQL-ACTION-V4-PINS

```text
TASK CODEQL-ACTION-V4-PINS  priority: P2  status: CLOSED
goal: Every `github/codeql-action` use in this repository runs v4, so SARIF uploads and CodeQL analysis keep working after CodeQL Action v3 is deprecated in December 2026.
why: Run 31684266179 (Prefix Diff — SARIF upload) carries GitHub's annotation "CodeQL Action v3 will be deprecated in December 2026. Please update all occurrences of the CodeQL Action in your workflow files to v4." Matthew chose this slice on 2026-11-18 ("CodeQL v3 to v4 pins") after a review of the repository's Security and quality tab.
branch: claude/codeql-action-v4-pins
base: verdant-grow-diary at 0d9e9c081973ea3e4ff86f5cd8822d5cfab3f1be
pr: #3014, merged 2026-11-19 10:18 UTC as 53ce0c6dc37e0f18eb2418adb8a2c32d3f2d01b2 (reviewed head d62d208d8755904ac87ae1adb86c4a5dd978cd30)
state: CLOSED 2026-11-19: merged through the merge queue. Reason: work complete and post-merge check passed.
next_action: none
post_merge_check: PASS, measured 2026-11-19 on merge commit 53ce0c6d: push run 44504364775 (Prefix Diff — SARIF upload) success and push run 44504364568 (CodeQL: javascript-typescript, actions, python) success; annotations on both carry only the Node.js 20 deprecation warning, no CodeQL Action v3 warning. The live-lane upload pin is still NOT_MEASURED (manual dispatch only).
decisions: (1) Pin to 33d7b85da1a04171e211befe2c739303b9a4c066, the commit behind tag v4.39.3 (`git ls-remote https://github.com/github/codeql-action 'refs/tags/v4.39.3^{}'`). codeql.yml already ran v3.39.3 (9418214d...), so this is the same release line on the v4 major. (2) prefix-diff-sarif.yml: two `upload-sarif` pins (offline and live jobs). codeql.yml: `init` and `analyze`. Two commits so the codeql.yml half can be dropped on its own: Matthew's choice described the upload-sarif pins, and codeql.yml is included because the deprecation covers every occurrence. (3) Comments now name the exact release (`# v4.39.3`) instead of the bare major.
not_in_scope: the stale `prefix-diff-live` code scanning error from the 2026-08-13 dispatch (it clears only with a founder-run live dispatch after SUPABASE_DB_URL is confirmed in verdant-production); the Node 20 deprecation of actions/checkout and actions/upload-artifact pins; the "Workflow does not contain permissions" alerts; the #1250 hold files (untouched); any other workflow change.
tests: 49 test files that read workflow files or action pins -> 49 passed, 1597 tests passed (bunx vitest, local, at the working tree before commit). No test pins the CodeQL action SHA, so there is no RED proof: the change is a version pin with no behaviour test in this repository. The real check is the two workflows running on the PR.
commands: grep -rn "codeql-action" .github ; git ls-remote https://github.com/github/codeql-action 'refs/tags/v4.39.3^{}' ; bunx vitest run <the 49 files> --reporter=dot
files_touched: .github/workflows/prefix-diff-sarif.yml; .github/workflows/codeql.yml; this file
files_remaining: none for this slice
gotchas: The live lane of prefix-diff-sarif.yml runs only on a manual dispatch from the deploy branch, so the PR exercises the offline `upload-sarif` pin only; the live pin is the same SHA. v4 of the action runs on Node 24.
blockers: none. History: dequeued five times between 2026-11-18 19:51 and 2026-11-19 04:47 UTC by a base-branch failure of Dependency & Security CI (stale picomatch exception, repaired by #3020); no change to this branch was needed.
reviewer_seat: GitHub APPROVE by matt816cheek-bit at d62d208d on 2026-11-18 09:49 UTC, submitted with no written review record; Codex automatic code review completed with no findings at the same head
reviewer_sha: d62d208d8755904ac87ae1adb86c4a5dd978cd30
session_state: none pending
claimed_by: Claude security-review session (session_017UoYKvM6Z6u4mxaVKRPG1z), 2026-11-18 09:14 UTC
owner: Claude security-review session
last_updated: 2026-11-19 10:44 UTC, by Claude security-review session
```
