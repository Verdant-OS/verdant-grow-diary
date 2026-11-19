# FIRST-USE-FRICTION-P3-20261119

```text
TASK FIRST-USE-FRICTION-P3-20261119  priority: other  status: OPEN
goal: Fix first-use friction items 2, 5, 6, 8 and 9 from walkthrough FA-20261119-M1 (build 679e8f51b17a, fresh Free account), and report item 7 (homepage Start Free utm_campaign=paid_launch) without changing attribution.
why: Matthew's brief of 2026-11-19 11:10 UTC. A new grower should see one word for one entry type, a sign-up tab title that says sign-up, labeled onboarding icons, and a start screen that behaves as chosen.
branch: claude/project-thread-9pfj7c
base: verdant-grow-diary @ 53ce0c6
pr: the draft PR for this branch (number in the PR body)
head_sha: read the current head from the PR and verify with git ls-remote
state: in progress; item 6 committed first
next_action: push item 6 test-first (CI RED), then the fix (CI GREEN); continue with items 8, 2, 5, 9 in separate commits on this branch.
post_merge_check: once /version.json reports the merged SHA, /auth?mode=signup shows a tab title containing "Create your Verdant Grow Diary account" and /auth still shows "Sign in to Verdant Grow Diary".
decisions:
  - One push branch is allowed, so the parts land as separate commits in one draft PR, each named in the PR body. This replaces one PR per part.
  - Item 6 title copy lives in src/lib/authModeTabRules.ts (getAuthPageTitle) beside the existing mode rules; noindex, path and description are unchanged.
  - Item 7 is report only: the paid_launch campaign is the owned-link mapping in src/lib/paidAcquisitionAttributionRules.ts and is test-pinned. No attribution change without Matthew's yes.
tried_and_rejected:
  - Local bun install --frozen-lockfile fails with ProxyConnectFailed 403 on registry tarballs, so local vitest and typecheck are BLOCKED; CI is the RED/GREEN evidence. No npm fallback.
commands: bunx vitest run src/test/auth-page-title-mode.test.tsx --reporter=dot (CI); bun run typecheck (CI)
files_touched: src/lib/authModeTabRules.ts; src/pages/Auth.tsx; src/test/auth-page-title-mode.test.tsx; this file (new)
files_remaining: item 8 onboarding header labels; item 2 entry-type word; item 5 Quick Log form label; item 9 start-screen preference
blockers: none for item 6. Items 5 and 9 may collide with #3030 (QuickLogV2Sheet.tsx, AppShell.tsx, startRoomDashboardHandoff.ts); collisions are reported, not worked around.
open_questions: item 7 (keep internal UTMs on owned links or switch to a non-UTM signal) is Matthew's call.
gotchas: stay clear of #3031 files (MobileNav.tsx, QuickLog.tsx, QuickLogAllActivitiesSection.tsx, mobileTentNavRules.ts, quickLogNoteSaveRules.ts) and #3030 files. Do not regress no-email-verification sign-up, the single Start your room form, note read-back, or Delete account.
exclusions_for_review: the Claude thread session for the first-use friction P3 task (author)
reviewer_seat: none requested yet
reviewer_sha: none
session_state: no production access used; no paused workflows; no scheduled routines; app could not be run locally.
claimed_by: the Claude thread session for the first-use friction P3 task, 2026-11-19 11:40 UTC
owner: the Claude thread session for the first-use friction P3 task
last_updated: 2026-11-19 11:40 UTC, by the Claude thread session for the first-use friction P3 task
```
