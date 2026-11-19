# FIRST-USE-FRICTION-P3-20261119

```text
TASK FIRST-USE-FRICTION-P3-20261119  priority: other  status: OPEN
goal: Fix first-use friction items 2, 5, 6, 8 and 9 from walkthrough FA-20261119-M1 (build 679e8f51b17a, fresh Free account), and report item 7 (homepage Start Free utm_campaign=paid_launch) without changing attribution.
why: Matthew's brief of 2026-11-19 11:10 UTC. A new grower should see one word for one entry type, a sign-up tab title that says sign-up, labeled onboarding icons, and a start screen that behaves as chosen.
branch: claude/project-thread-uapqkb (carried from claude/project-thread-9pfj7c; #3033 closed as superseded)
base: verdant-grow-diary @ 53ce0c6
pr: #3034 (draft)
head_sha: read the current head from the PR and verify with git ls-remote
state: items 6, 8, 2 test-first commits and fixes on the branch; items 5, 7, 9 report only
next_action: confirm CI RED on the item 8 and item 2 test commits, push the fixes, confirm 35/35 green, then request Reviewer A, D or C at the exact head.
post_merge_check: once /version.json reports the merged SHA, /auth?mode=signup shows a tab title containing "Create your Verdant Grow Diary account" and /auth still shows "Sign in to Verdant Grow Diary".
decisions:
  - One push branch is allowed, so the parts land as separate commits in one draft PR, each named in the PR body. This replaces one PR per part.
  - Item 6 title copy lives in src/lib/authModeTabRules.ts (getAuthPageTitle) beside the existing mode rules; noindex, path and description are unchanged.
  - Item 2: Note-tile entries persist as observation + note marker (quickLogNoteMarkerRules); Last activity now maps marked observations to "note", as the Timeline does. Issue subtype is unchanged there (out of scope).
  - Item 8: the header icon controls are AppShell's (Onboarding has none of its own); #3030's AppShell hunks do not touch the header block.
  - Item 7 is report only: the paid_launch campaign is the owned-link mapping in src/lib/paidAcquisitionAttributionRules.ts and is test-pinned. No attribution change without Matthew's yes.
tried_and_rejected:
  - Local bun install --frozen-lockfile fails with ProxyConnectFailed 403 on registry tarballs, so local vitest and typecheck are BLOCKED; CI is the RED/GREEN evidence. No npm fallback.
commands: bunx vitest run src/test/auth-page-title-mode.test.tsx --reporter=dot (CI); bun run typecheck (CI)
files_touched: src/lib/authModeTabRules.ts; src/pages/Auth.tsx; src/test/auth-page-title-mode.test.tsx; src/components/AppShell.tsx (header icon labels only); src/test/app-shell-global-search-trigger.test.tsx; src/lib/plantLastActivityRules.ts; src/test/plant-detail-last-activity-pairing.test.tsx; this file
files_remaining: none planned. Item 5 (header Quick Log opens QuickLogV2Sheet; plant page opens legacy QuickLog) needs Matthew to pick the canonical form, and both files are in #3030/#3031. Item 9 (saved start screen, localStorage, read in Auth.tsx) overlaps #3030 B1 dashboard landing; needs a live check after #3030 lands.
blockers: none for item 6. Items 5 and 9 may collide with #3030 (QuickLogV2Sheet.tsx, AppShell.tsx, startRoomDashboardHandoff.ts); collisions are reported, not worked around.
open_questions: item 7 (keep internal UTMs on owned links or switch to a non-UTM signal) is Matthew's call.
gotchas: stay clear of #3031 files (MobileNav.tsx, QuickLog.tsx, QuickLogAllActivitiesSection.tsx, mobileTentNavRules.ts, quickLogNoteSaveRules.ts) and #3030 files. Do not regress no-email-verification sign-up, the single Start your room form, note read-back, or Delete account.
exclusions_for_review: the Claude thread session for the first-use friction P3 task (author)
reviewer_seat: none requested yet
reviewer_sha: none
session_state: no production access used; no paused workflows; no scheduled routines; app could not be run locally.
claimed_by: the Claude thread session for the first-use friction P3 task, 2026-11-19 11:40 UTC
owner: the Claude thread session for the first-use friction P3 task
last_updated: 2026-11-19 11:55 UTC, by the Claude thread session for the first-use friction P3 task
```
