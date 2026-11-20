# ONBOARDING-STARTER-GUIDE-DECISIONS-20261118

```text
TASK ONBOARDING-STARTER-GUIDE-DECISIONS-20261118  priority: other  status: CLOSED
closed: 2026-11-20, merged. #3015 (https://github.com/Verdant-OS/verdant-grow-diary/pull/3015) landed on verdant-grow-diary as 2aee8f3e873a7b26610c0ffafe74b3c10acb4242 at 2026-11-20 06:26 UTC through the merge queue. That is a two-parent merge commit; the final PR head was adcb56b4c92fa5fc077e4a91243441b928802086. post_merge_check PASS, measured 2026-11-20 06:27 UTC on 2aee8f3e: docs/specs/onboarding-starter-guide-decisions.md exists, has 10 numbered decisions and is labeled "recommendations, not production authorization". Docs only; nothing deployed and no hold lifted.
goal: Record Matthew's onboarding, starter-setup and checkout decisions (recommendations, not production authorization), including his answers to the three questions first left open, in one repo doc, so later slices do not have to guess.
why: Matthew sent the decisions on 2026-11-18 and chose "Record them in a docs PR". No existing doc on verdant-grow-diary held them.
branch: claude/onboarding-starter-guide-decisions
base: verdant-grow-diary @ 0d9e9c081973ea3e4ff86f5cd8822d5cfab3f1be
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/3015
head_sha: adcb56b4c92fa5fc077e4a91243441b928802086 (final; observed with git ls-remote 2026-11-20 06:19 UTC). Earlier heads: 0a4b81c6, 98fd9521, 1aaf6982, then 56f03a7a, a Cursor commit pushed by a non-holder that adcb56b4 reverts with a tree identical to 1aaf6982.
state: merged and closed
next_action: none. A later slice that builds the starter setup or guide reads docs/specs/onboarding-starter-guide-decisions.md.
post_merge_check: on the merged deploy tip, docs/specs/onboarding-starter-guide-decisions.md exists and lists all 10 decisions. Docs only; no production check.
decisions:
  - Recorded as Matthew wrote them, with evidence labels added only where a claim is about code or live state (decision 1).
  - New file under docs/specs/. No code, copy, schema or entitlement change.
  - Collision check (2026-11-18): open PRs #3003, #3004, #3011, #3012, #3013 and #3014 do not touch onboarding or checkout decision docs; a git grep for "Use this starter setup", "Restart guide" and "spotlight guidance" found nothing on the deploy branch.
tried_and_rejected: none
commands: git grep -niE "Use this starter setup|Restart guide|spotlight guidance" origin/verdant-grow-diary -- docs src
files_touched: docs/specs/onboarding-starter-guide-decisions.md (new); this file (new)
files_remaining: none
blockers: none for the docs. Independent exact-head review and Matthew's per-item yes are the standing gates.
open_questions: none. Matthew answered the three on 2026-11-18 (Restart guide in both Help and Settings; existing accounts are offered the guide; drafts stay on the device), recorded as decisions 8 to 10 in a second commit.
gotchas: these are recommendations, not production authorization. The paid-checkout release hold stays. Decision 1 and 7's claims about code and limits are unverified here.
exclusions_for_review: Claude session_017UoYKwo4mYcULag9FoN2QE (this writer)
reviewer_seat: independent Claude review sessions session_017UoYKwSx4SszGYZisFpeKv (PASS at 98fd9521 and 1aaf6982) and session_017UoYKwqJDMTkufnq8te2uu (PASS at adcb56b4, review 5974678712). No Seat A review exists on #3015.
reviewer_sha: adcb56b4c92fa5fc077e4a91243441b928802086
session_state: no production access used; no paused workflows; no scheduled routines.
claimed_by: Claude session_017UoYKwo4mYcULag9FoN2QE, 2026-11-18 09:15 UTC (Matthew's request)
owner: Claude session_017UoYKwo4mYcULag9FoN2QE
last_updated: 2026-11-20 07:14 UTC, by Claude session_017UoYKwo4mYcULag9FoN2QE (closed after #3015 merged; previous 2026-11-18 10:08 UTC)
```
