# GROK-REVIEW-OUTPUT-CAP-20261120

```text
TASK GROK-REVIEW-OUTPUT-CAP-20261120  priority: other  status: CLOSED
closed: 2026-11-23, merged. #3045 (https://github.com/Verdant-OS/verdant-grow-diary/pull/3045) landed on verdant-grow-diary as 10660c267eb80e9128a1ecdf067d50d17991218c at 2026-11-23 10:22:56 UTC through the merge queue (#3045's issue events, read 2026-11-23 10:24 UTC: added_to_merge_queue 10:17:05Z by cheekhimself; merged by cheekhimself and removed_from_merge_queue by github-merge-queue[bot] at 10:22:56Z). The merge commit has parents 228150ad and 3610e2133c7a6bb1af21ff8115e08bb2a1826cbe. It carried #3016's workflow too, at Matthew's choice. Matthew's answers conflicted: "Yes to #3045 at 3610e213" in the author session, and "Fix the P3s first" in the reviewer session. He settled it in the author session: "Merge it now, fix P3s after" (PR comment 7097796565).
goal: The Grok peer-review comment stays under GitHub's 65,536-character comment limit even when the model output is full of review markers, so the post step cannot fail on size once Grok is enabled.
why: Copilot finding r4636413221 on #3016. The workflow capped the raw output at 60000 bytes before defanging, and defanging lengthens each marker about 3x ("[PASS]" becomes "(model note: PASS)"), so marker-heavy output could reach about 180000 characters. Matthew chose to merge #3016 as is and fix this in a follow-up, before GROK_REVIEW_ENABLED is ever set.
branch: claude/grok-review-output-cap
base: stacked on claude/grok-review-hardened-workflow at 35f8b2c2a963cc745c0933ba6d2fa37054957320 (#3016, not yet merged when this branch was cut); the PR targets verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/3045
head_sha: 3610e2133c7a6bb1af21ff8115e08bb2a1826cbe (final checkpoint; observed with git ls-remote 2026-11-23 10:16 UTC; the tests in this entry ran at this head)
state: merged and closed
next_action: none for this task. The review's four P3s and Copilot r4639425905 are tracked in GROK-REVIEW-P3-FOLLOWUP-20261123.
post_merge_check: PASS, measured 2026-11-23 10:24 UTC on 10660c26: the "Build comment body" step pipes the defanged text through a second `head -c 60000`. Grok stays off, so no live run is implied.
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
reviewer_seat: session_017UoYKwrn1g9TEdpGQnGCyL, independent (PASS at 3610e213 with 0 P1 / 0 P2 / 4 P3, review 6019802425, verdict comment 7097712257). matt816cheek-bit approval 6019720580 at 3610e213.
reviewer_sha: 3610e2133c7a6bb1af21ff8115e08bb2a1826cbe
session_state: no production access used; no secrets read or set; no paused workflows.
claimed_by: Claude session_017UoYKwo4mYcULag9FoN2QE, 2026-11-20 06:47 UTC (Matthew's request)
owner: Claude session_017UoYKwo4mYcULag9FoN2QE
last_updated: 2026-11-23 10:24 UTC, by Claude session_017UoYKwo4mYcULag9FoN2QE (closed after #3045 landed; previous 2026-11-20 06:47 UTC)
```
