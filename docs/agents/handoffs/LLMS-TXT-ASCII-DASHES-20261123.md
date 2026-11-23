# LLMS-TXT-ASCII-DASHES-20261123

```text
TASK LLMS-TXT-ASCII-DASHES-20261123  priority: P3  status: OPEN
goal: https://verdantgrowdiary.com/llms.txt reads cleanly, with no garbled characters where dashes were.
why: after #3048 merged (abc31f05), Matthew saw mojibake in the live llms.txt. public/llms.txt had four U+2014 em dashes (lines 3, 9, 11, 12) and no other non-ASCII characters. Neither vercel.json nor public/_headers sets a charset for llms.txt, so a client that decodes text/plain without a charset as Latin-1 shows each em dash as three garbage characters.
fix: each " em-dash " in public/llms.txt becomes " - " (4 lines; wording, links and prices unchanged). New guard test src/test/llms-txt-ascii.test.ts fails on any non-ASCII character in public/llms.txt and names line and code point.
branch: claude/llms-txt-dashes-wfzph4
base: verdant-grow-diary at abc31f05
pr: see the PR for this branch (draft). Its body carries the head SHA.
state: committed and pushed; draft PR open
next_action: (1) required checks green at the PR head; (2) one independent exact-head review by a session that did not write this; (3) Matthew's per-item yes naming the PR and SHA, then the Merge Steward queues it.
post_merge_check: once live /version.json reports the merged SHA, fetch https://verdantgrowdiary.com/llms.txt and confirm it has no bytes above 0x7F and lines 3, 9, 11 and 12 read " - " between phrases.
decisions: (1) Use ASCII " - " rather than adding a charset header, because hosting config is out of scope for this slice and ASCII is safe under any decoding. (2) Guard the whole file, not just dashes, since curly quotes would garble the same way.
not_in_scope: vercel.json or _headers charset; other public text files; any copy or price change.
tests: src/test/llms-txt-ascii.test.ts. RED at base abc31f05 (4 offenders: lines 3, 9, 11, 12, U+2014), GREEN with the fix. Run with bun test because local vitest is unavailable (see gotchas).
commands: bun test src/test/llms-txt-ascii.test.ts ; bunx vitest run src/test/llms-txt-ascii.test.ts --reporter=dot (CI)
files_touched: public/llms.txt; src/test/llms-txt-ascii.test.ts; this file
files_remaining: none for this slice
gotchas: bun install 403s at the proxy in this cloud box and node_modules lacks vitest, so local vitest, typecheck, lint and build are BLOCKED here; CI is the evidence. Do not regenerate bun.lock.
blockers: local vitest/typecheck/lint/build BLOCKED as above.
reviewer_seat: an eligible independent reviewer session (Reviewer C, fallback A or D) that did not author or repair this change
reviewer_sha: none yet
session_state: no routines, no paused workflows. Pending human decision: Matthew's merge yes after review.
claimed_by: Claude thread session (llms.txt dashes), 2026-11-23 03:45 UTC
owner: Claude thread session (llms.txt dashes)
last_updated: 2026-11-23 03:45 UTC, by Claude thread session (llms.txt dashes)
```
