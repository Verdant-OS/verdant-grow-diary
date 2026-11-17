# CLOSE-STALE-HANDOFF-BLOCKS-20261117

```text
TASK CLOSE-STALE-HANDOFF-BLOCKS-20261117  priority: other  status: CLOSED
closed: 2026-11-17, merged. PR https://github.com/Verdant-OS/verdant-grow-diary/pull/2995 landed on verdant-grow-diary as 2827b493d6d8f70be2d2d2884b92a9088c879cf7 (merge queue, 23:11 UTC) from approved head 79242c270e30dfad7bf9e598c81c66e4058bafbc. post_merge_check PASS on that tip: all six TASK lines read status: CLOSED and git grep lists none of them as OPEN.
goal: Close six handoff entries that still read OPEN on verdant-grow-diary although their PRs have merged, without losing their unfinished items.
why: AGENTS.md section 12 says a merged task is set to status: CLOSED the same day, with the final SHA. Matthew asked for this on 2026-11-17 ("Close the stale handoff entries next").
branch: claude/optimistic-faraday-18filv
base: verdant-grow-diary @ c96bcb8225d760c11c2945bd4c87cab5d56e14e2
checkout: git fetch origin claude/optimistic-faraday-18filv verdant-grow-diary && git switch claude/optimistic-faraday-18filv
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2995 (merged)
head_sha: 79242c270e30dfad7bf9e598c81c66e4058bafbc (approved and merged head)
state: merged; closed
next_action: none for this task. The six closed entries' own post-merge checks and deploy steps stay with their owners and Matthew.
post_merge_check: on the merged deploy tip, each of the six TASK lines below reads status: CLOSED, and git grep -lE '^TASK .*status: OPEN' -- docs/agents/handoffs/ lists none of them. Docs only; no production check.
decisions:
  - Same convention as #2928 and #2967. Each closed file changes in three places: the TASK line reads status: CLOSED, one closed: line is added under it, and last_updated is replaced with the old value kept in parentheses. No other line changes, so each entry's post_merge_check, blockers and open questions stay in place.
  - Landing SHA is the first-parent commit on origin/verdant-grow-diary whose subject ends with the PR number, read 2026-11-17.
  - Closed here: AUTH-EMAIL-MANAGED-ROUTE (#2981, c96bcb82), AUTH-EMAIL-NATIVE-HOOK (#2979, f1b8a6a9), FIELD-NOTEBOOK-RELOAD-DRAFT-2968 (#2975, c468bc90), QUICKLOG-DRAFT-WATER-FEED-DETAILS (#2936, 054e7dba), TIMELINE-ACTIVITY-PAGER (#2951, 1f138a54), WATER-UNIT-LITERS-DEFAULT (#2966, 2a6ed81c).
  - Left OPEN on purpose. DIARY-CALENDAR-DELETED-PLANT-LABEL is being closed in #2990, GGS-BLE-CSV-BRIDGE in #2993. CLOSE-STALE-HANDOFF-BLOCKS-20261112 is kept OPEN by its owner as the record of carried-forward items (#2989). STRIPE-LIVE-CHECKOUT-PLAN and STRIPE-PRO-CHECKOUT-BUILD are edited by open #2994. MQ-CODEQL-SENTINEL waits on its owner, because its post-merge check is not fully measured (evidence: https://github.com/Verdant-OS/verdant-grow-diary/pull/2960#issuecomment-6957760871).
  - Claim check before writing (2026-11-17): the eight open PRs into verdant-grow-diary (#2985, #2988, #2989, #2990, #2991, #2992, #2993, #2994) touch none of the six files.
tried_and_rejected: none
commands: git log origin/verdant-grow-diary --first-parent --format='%H %cI' --grep='(#<N>)$' -1
files_touched: docs/agents/handoffs/{AUTH-EMAIL-MANAGED-ROUTE,AUTH-EMAIL-NATIVE-HOOK,FIELD-NOTEBOOK-RELOAD-DRAFT-2968,QUICKLOG-DRAFT-WATER-FEED-DETAILS,TIMELINE-ACTIVITY-PAGER,WATER-UNIT-LITERS-DEFAULT}.md; this file (new)
files_remaining: none
blockers: none for the docs. Independent exact-head review and Matthew's per-item yes are the standing gates.
open_questions: none
gotchas: these six entries belong to other writers (Claude thread sessions and cursor cloud agents). This change marks them closed and adds nothing else to them. Closing does not mean their post-merge checks or deploy steps are done. WATER-UNIT-LITERS-DEFAULT.md had no code fence and already failed prettier --check on the deploy branch, so the commit hook would have re-indented lines this change does not touch. As #2967 did for FIELD-NOTEBOOK-SLICE-1.md, it is wrapped in a text fence; no existing line changes, and its TASK line is now line 2.
exclusions_for_review: Claude session_017UoYKxxpw2guRq48NBdZRB (this writer)
reviewer_seat: independent Claude review session session_017UoYKyU64drKZ51AJHYUz7, PASS 0 P1 / 0 P2 / 2 P3 (review 5945851852); approved on GitHub by matt816cheek-bit (review 5948086659)
reviewer_sha: 79242c270e30dfad7bf9e598c81c66e4058bafbc
session_state: no production access used; no paused workflows; no scheduled routines.
claimed_by: Claude session_017UoYKxxpw2guRq48NBdZRB, 2026-11-17 (Matthew's request)
owner: Claude session_017UoYKxxpw2guRq48NBdZRB
last_updated: 2026-11-17, by Claude session_017UoYKxxpw2guRq48NBdZRB (closed after merge)
```
