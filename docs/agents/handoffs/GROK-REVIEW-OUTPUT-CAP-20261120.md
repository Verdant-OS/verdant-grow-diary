# GROK-REVIEW-OUTPUT-CAP-20261120

```text
TASK GROK-REVIEW-OUTPUT-CAP-20261120  priority: other  status: OPEN
goal: The Grok peer-review comment stays under GitHub's 65,536-character comment limit even when the model output is full of review markers, so the post step cannot fail on size once Grok is enabled.
why: Copilot finding r4636413221 on #3016. The workflow capped the raw output at 60000 bytes before defanging, and defanging lengthens each marker about 3x ("[PASS]" becomes "(model note: PASS)"), so marker-heavy output could reach about 180000 characters. Matthew chose to merge #3016 as is and fix this in a follow-up, before GROK_REVIEW_ENABLED is ever set.
branch: claude/grok-review-output-cap
base: stacked on claude/grok-review-hardened-workflow at 35f8b2c2a963cc745c0933ba6d2fa37054957320 (#3016, not yet merged when this branch was cut); the PR targets verdant-grow-diary
pr: see the PR opened from this branch
head_sha: read the current head from the PR and verify with git ls-remote
state: pushed; draft PR open; no review requested yet
next_action: once #3016 merges, merge verdant-grow-diary into this branch so the diff is only this change; then one eligible independent reviewer for this protected .github scope, Matthew's per-item yes and the merge queue.
post_merge_check: on the merged deploy tip, .github/workflows/grok-review.yml's "Build comment body" step pipes the defanged text through a second `head -c 60000`, and src/test/grok-review-workflow-safety.test.ts passes. Grok stays off (GROK_REVIEW_ENABLED unset); no live run is implied.
decisions:
  - Cap again after the sed rewrite with `head -c 60000`. That leaves about 5.5k characters for the header and footer under 65536. The first cap stays, so sed never reads more than 60000 bytes.
  - New contract test: it runs the real "Build comment body" script on 20000 copies of "[PASS]" and asserts comment.md is at most 65536 characters, still ends its details block, and still defangs. RED before the fix: "expected 180274 to be less than or equal to 65536" (1 failed, 17 passed). GREEN after: 18/18.
tried_and_rejected:
  - Capping only after sed: rejected, because sed would then read unbounded model output.
commands: |
  bunx vitest run src/test/grok-review-workflow-safety.test.ts src/test/ci-pr-concurrency.test.ts src/test/github-actions-reference-policy.test.ts src/test/workflow-branch-filter-liveness.test.ts --reporter=dot  -> 4 files, 79 passed
files_touched: .github/workflows/grok-review.yml; src/test/grok-review-workflow-safety.test.ts; this file
files_remaining: none
blockers: none. Grok itself stays gated off: its sandbox cannot enforce the /proc read-deny on GitHub runners (see GROK-REVIEW-HARDENED-WORKFLOW-20261118).
open_questions: none
gotchas: a byte cap can cut a multi-byte character at the end of the comment; GitHub accepts that. The test uses ASCII.
exclusions_for_review: Claude session_017UoYKwo4mYcULag9FoN2QE (this writer)
reviewer_seat: none requested yet
reviewer_sha: none
session_state: no production access used; no secrets read or set; no paused workflows.
claimed_by: Claude session_017UoYKwo4mYcULag9FoN2QE, 2026-11-20 06:30 UTC (Matthew's request)
owner: Claude session_017UoYKwo4mYcULag9FoN2QE
last_updated: 2026-11-20 06:30 UTC, by Claude session_017UoYKwo4mYcULag9FoN2QE
```
