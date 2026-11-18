# ONBOARDING-STARTER-GUIDE-DECISIONS-20261118

```text
TASK ONBOARDING-STARTER-GUIDE-DECISIONS-20261118  priority: other  status: OPEN
goal: Record Matthew's onboarding, starter-setup and checkout decisions (recommendations, not production authorization), including his answers to the three questions first left open, in one repo doc, so later slices do not have to guess.
why: Matthew sent the decisions on 2026-11-18 and chose "Record them in a docs PR". No existing doc on verdant-grow-diary held them.
branch: claude/onboarding-starter-guide-decisions
base: verdant-grow-diary @ 0d9e9c081973ea3e4ff86f5cd8822d5cfab3f1be
pr: see the PR opened from this branch
head_sha: read the current head from the PR and verify with git ls-remote
state: pushed draft; no review requested
next_action: one eligible independent reviewer (not this session) at the exact head; then Matthew's per-item yes and the merge queue.
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
reviewer_seat: none requested yet
reviewer_sha: none
session_state: no production access used; no paused workflows; no scheduled routines.
claimed_by: Claude session_017UoYKwo4mYcULag9FoN2QE, 2026-11-18 09:15 UTC (Matthew's request)
owner: Claude session_017UoYKwo4mYcULag9FoN2QE
last_updated: 2026-11-18 09:29 UTC, by Claude session_017UoYKwo4mYcULag9FoN2QE (previously 2026-11-18 09:15 UTC)
```
