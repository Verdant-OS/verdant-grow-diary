# ROSTER-MATTHEW-REVIEWER-ACCOUNTS-20261124

```text
TASK ROSTER-MATTHEW-REVIEWER-ACCOUNTS-20261124  priority: other  status: OPEN
goal: The roster records the VReviewer and matt816cheek-bit GitHub accounts as Matthew's own owner accounts, not Reviewer seats, so reviewers stop flagging his approvals as an unknown seat and never count them as an independent review.
why: On 2026-11-24 a reviewer session flagged VReviewer's approvals on #3053 and #3070 as an unknown seat. Matthew said "I am VReviewer". While #3081 was open, Cursor Agent commit d97693424ec0cd8e287c8d82825d273e0a75a4bf landed on the deploy branch: it removed Reviewer E and added an "Owner accounts" section listing VReviewer. That made #3081's first approach (relabel E and F as "Matthew (direct)") conflict with the base. Matthew chose "Rework: move matt816cheek-bit too".
branch: claude/roster-matthew-reviewer-accounts
base: verdant-grow-diary @ 465248817b95b00fe8dd6cebd9315e84d160d295 (merged into the branch; the original base was 9c844347c691090eb56ecfa1b6eb63398d03e742)
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/3081
head_sha: read the current head from the PR and verify with git ls-remote
state: pushed; PR #3081 ready; reworked after the base conflict; the round-2 PASS at d95d1f2b and Matthew's yes at d95d1f2b are historical; a fresh review is needed
next_action: an independent exact-head review by a session other than this writer, then Matthew's per-item yes at the new head, his approval from VReviewer or another owner account, 35/35 required checks, and the merge queue.
post_merge_check: on the merged deploy tip, docs/agents/constitution/roster.md has no Reviewer E or Reviewer F row; the Owner accounts section lists `matt816cheek-bit` as Matthew's own account; the rules line names Reviewer C, Reviewer D and QA as active and records E and F as retired; the stable-label table reads "Reviewer A, B, C, D". Docs only; nothing ships to the app.
decisions:
  - Rework at the new base (Matthew's choice, 2026-11-24): keep d976934's Owner accounts section, add `matt816cheek-bit` to it, remove the Reviewer F row, retire E and F in the rules line, and drop F from the stable-label table. The earlier holder-cell relabel and the line 44 sentence are dropped, because the Owner accounts section already says an owner-account approval is never an independent review.
  - Holder cells changed from the account names to "Matthew (direct) · Reviewer (Main)", following the existing "Matthew (direct)" wording on the Merge Steward row. The GitHub account column is unchanged.
  - Evidence in Matthew's own words, in session_017UoYKwrn1g9TEdpGQnGCyL: "I am VReviewer" (2026-11-24) and "approved as matt816cheek-bit" (2026-11-23). He picked "Yes, mark them as mine" on the card offering this change.
  - Round 1 P3s (session_017UoYKwo4mYcULag9FoN2QE, verdict comment 7134666611): Matthew chose "Fix both". Line 44 gains one sentence saying an E/F approval is Matthew's own approval, not the independent session PASS; this entry's pr line names #3081.
  - roster.md is not one of the eighteen Sentinel-versioned governance files, so there is no version bump.
tried_and_rejected:
  - Adding a new row: rejected; both accounts already have rows (added in e1c30b9). Only the holder label was missing.
commands: |
  git merge-tree origin/verdant-grow-diary d95d1f2b -> CONFLICT in roster.md (d976934); resolved by taking the base file and applying the rework
  grep -rln "VReviewer|matt816cheek-bit|roster.md" in src/test, scripts and config -> no pinning tests
files_touched: docs/agents/constitution/roster.md; this file
files_remaining: none
blockers: none for the change. This session writes the change, so it cannot review it. It also posts as cheekhimself, so GitHub would refuse its approval.
open_questions: none
gotchas: the shared cheekhimself account cannot approve a PR it opened; Matthew approves as VReviewer or matt816cheek-bit.
exclusions_for_review: Claude session_017UoYKwrn1g9TEdpGQnGCyL (this writer)
reviewer_seat: Claude review session_017UoYKwo4mYcULag9FoN2QE (did not author or repair this change)
reviewer_sha: d95d1f2b98097816449070441940d927a597b981 (round-2 PASS 0/0/1, review 6041268252, historical after the rework); e134d920 round-1 PASS also historical
session_state: no production access used; no secrets read or set; no paused workflows.
claimed_by: Claude session_017UoYKwrn1g9TEdpGQnGCyL, 2026-11-24 (Matthew's request)
owner: Claude session_017UoYKwrn1g9TEdpGQnGCyL
last_updated: 2026-11-24, by Claude session_017UoYKwrn1g9TEdpGQnGCyL
```
