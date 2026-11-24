# ROSTER-MATTHEW-REVIEWER-ACCOUNTS-20261124

```text
TASK ROSTER-MATTHEW-REVIEWER-ACCOUNTS-20261124  priority: other  status: OPEN
goal: The roster says that the Reviewer E (VReviewer) and Reviewer F (matt816cheek-bit) GitHub accounts are Matthew's own, so reviewers stop flagging his approvals as coming from an unknown seat.
why: On 2026-11-24 a reviewer session flagged VReviewer's approvals on #3053 and #3070 as an unknown seat, because the roster listed the account names as holders and never said who held them. Matthew said "I am VReviewer" and asked to mark Reviewer E and F as his.
branch: claude/roster-matthew-reviewer-accounts
base: verdant-grow-diary @ 9c844347c691090eb56ecfa1b6eb63398d03e742
pr: see the PR opened from this branch
head_sha: read the current head from the PR and verify with git ls-remote
state: pushed; draft PR
next_action: an independent exact-head review by a session other than this writer, then Matthew's per-item yes, his approval from an account other than cheekhimself, and the merge queue.
post_merge_check: on the merged deploy tip, docs/agents/constitution/roster.md shows "Matthew (direct) · Reviewer (Main)" as the holder for Reviewer E (`VReviewer`) and Reviewer F (`matt816cheek-bit`), and no other line changed. Docs only; nothing ships to the app.
decisions:
  - Holder cells changed from the account names to "Matthew (direct) · Reviewer (Main)", following the existing "Matthew (direct)" wording on the Merge Steward row. The GitHub account column is unchanged.
  - Evidence in Matthew's own words, in session_017UoYKwrn1g9TEdpGQnGCyL: "I am VReviewer" (2026-11-24) and "approved as matt816cheek-bit" (2026-11-23). He picked "Yes, mark them as mine" on the card offering this change.
  - roster.md is not one of the eighteen Sentinel-versioned governance files, so there is no version bump.
tried_and_rejected:
  - Adding a new row: rejected; both accounts already have rows (added in e1c30b9). Only the holder label was missing.
commands: |
  git diff origin/verdant-grow-diary -- docs/agents/constitution/roster.md  -> 2 lines changed
  grep -rln "VReviewer|matt816cheek-bit|roster.md" in src/test, scripts and config -> no pinning tests
files_touched: docs/agents/constitution/roster.md; this file
files_remaining: none
blockers: none for the change. This session writes the change, so it cannot review it. It also posts as cheekhimself, so GitHub would refuse its approval.
open_questions: none
gotchas: the shared cheekhimself account cannot approve a PR it opened; Matthew approves as VReviewer or matt816cheek-bit.
exclusions_for_review: Claude session_017UoYKwrn1g9TEdpGQnGCyL (this writer)
reviewer_seat: none requested yet
reviewer_sha: none
session_state: no production access used; no secrets read or set; no paused workflows.
claimed_by: Claude session_017UoYKwrn1g9TEdpGQnGCyL, 2026-11-24 (Matthew's request)
owner: Claude session_017UoYKwrn1g9TEdpGQnGCyL
last_updated: 2026-11-24, by Claude session_017UoYKwrn1g9TEdpGQnGCyL
```
