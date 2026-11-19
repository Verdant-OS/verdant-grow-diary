# CODEQL-ACTION-V4-PINS

```text
TASK CODEQL-ACTION-V4-PINS  priority: P2  status: OPEN
goal: Every `github/codeql-action` use in this repository runs v4, so SARIF uploads and CodeQL analysis keep working after CodeQL Action v3 is deprecated in December 2026.
why: Run 31684266179 (Prefix Diff — SARIF upload) carries GitHub's annotation "CodeQL Action v3 will be deprecated in December 2026. Please update all occurrences of the CodeQL Action in your workflow files to v4." Matthew chose this slice on 2026-11-18 ("CodeQL v3 to v4 pins") after a review of the repository's Security and quality tab.
branch: claude/codeql-action-v4-pins
base: verdant-grow-diary at 0d9e9c081973ea3e4ff86f5cd8822d5cfab3f1be
pr: draft, opened after the first push; the head SHA is recorded on the pull request
state: pushed; draft PR open; no review requested yet
next_action: (1) 35/35 required checks at the PR head; (2) confirm the PR's own "Prefix Diff — SARIF upload" (offline lane) and "CodeQL" runs are green at that head, since both workflows trigger on changes to themselves; (3) one independent exact-head review by a session that did not write this; (4) Matthew's per-item yes naming the PR and SHA, then the Merge Steward queues it.
post_merge_check: on the deploy branch after merge, the push-triggered "Prefix Diff — SARIF upload" run and the "CodeQL" run both succeed and their annotations no longer include the CodeQL Action v3 deprecation warning. Until then: NOT_MEASURED.
decisions: (1) Pin to 33d7b85da1a04171e211befe2c739303b9a4c066, the commit behind tag v4.39.3 (`git ls-remote https://github.com/github/codeql-action 'refs/tags/v4.39.3^{}'`). codeql.yml already ran v3.39.3 (9418214d...), so this is the same release line on the v4 major. (2) prefix-diff-sarif.yml: two `upload-sarif` pins (offline and live jobs). codeql.yml: `init` and `analyze`. Two commits so the codeql.yml half can be dropped on its own: Matthew's choice described the upload-sarif pins, and codeql.yml is included because the deprecation covers every occurrence. (3) Comments now name the exact release (`# v4.39.3`) instead of the bare major.
not_in_scope: the stale `prefix-diff-live` code scanning error from the 2026-08-13 dispatch (it clears only with a founder-run live dispatch after SUPABASE_DB_URL is confirmed in verdant-production); the Node 20 deprecation of actions/checkout and actions/upload-artifact pins; the "Workflow does not contain permissions" alerts; the #1250 hold files (untouched); any other workflow change.
tests: 49 test files that read workflow files or action pins -> 49 passed, 1597 tests passed (bunx vitest, local, at the working tree before commit). No test pins the CodeQL action SHA, so there is no RED proof: the change is a version pin with no behaviour test in this repository. The real check is the two workflows running on the PR.
commands: grep -rn "codeql-action" .github ; git ls-remote https://github.com/github/codeql-action 'refs/tags/v4.39.3^{}' ; bunx vitest run <the 49 files> --reporter=dot
files_touched: .github/workflows/prefix-diff-sarif.yml; .github/workflows/codeql.yml; this file
files_remaining: none for this slice
gotchas: The live lane of prefix-diff-sarif.yml runs only on a manual dispatch from the deploy branch, so the PR exercises the offline `upload-sarif` pin only; the live pin is the same SHA. v4 of the action runs on Node 24.
blockers: none
reviewer_seat: not yet requested; any eligible session that did not author or repair this, under OWNERSHIP.md section 4.3
reviewer_sha: none yet
session_state: no routines, no paused workflows. Pending human decisions: Matthew's merge yes after review.
claimed_by: Claude security-review session (session_017UoYKvM6Z6u4mxaVKRPG1z), 2026-11-18 09:14 UTC
owner: Claude security-review session
last_updated: 2026-11-18 09:14 UTC, by Claude security-review session
```
