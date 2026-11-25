# START-SCREEN-QUICKLOG-COPY-20261125

```text
TASK START-SCREEN-QUICKLOG-COPY-20261125  priority: other  status: CLOSED
goal: The "Quick Log" start-screen option says what it does: on /onboarding, Continue opens Quick Log now and later sign-ins open the dashboard, one tap from Quick Log; in Settings (saving opens nothing), only what sign-in does.
why: First-use friction item 9 (walkthrough FA-20261119-M1, build 679e8f51b17a). After a later sign-in the walkthrough landed on the dashboard while "Quick Log" was the chosen start screen. That landing is intended (ecdd084a3, 2026-11-10, pinned by src/lib/returningSignInNoAutoOpen.test.ts); the option's words did not say so. Coordinator go-ahead 2026-11-25 08:23 UTC under Matthew's "Keep building until we achieve perfection." (08:19 UTC).
branch: claude/project-thread-uapqkb (restarted from verdant-grow-diary @ 8c7a96ab49c3af9b6dc497535f7ea8cebe6238e6 after #3034 and #3088 merged)
base: verdant-grow-diary @ 8c7a96ab49c3af9b6dc497535f7ea8cebe6238e6
pr: #3104 (merged 2026-11-25 10:10:48 UTC as 3903e71222c3966db8c90cef38d43172dd3e16b9)
head_sha: d218d912dbd79cd52962b98c852d03e89e99fa0a (final PR head); merged to verdant-grow-diary as 3903e71222c3966db8c90cef38d43172dd3e16b9
state: CLOSED 2026-11-25: merged by the merge queue. RED at 326ea4c602e2f5bdffe9a9362170dd49c028bc44 (CI run 45576019956, shard 15/32: 2 failed / 2 passed in the new test); GREEN at d218d912dbd79cd52962b98c852d03e89e99fa0a (CI run 45576062938: 35/35 required success). Matthew asked to pull it from the queue (09:57 UTC); auto-merge was turned off and the PR converted to draft at 09:58 UTC, but the queue merged it at 10:10:48 UTC. Nothing was undone. Local vitest/typecheck BLOCKED (node_modules partial, bun install 403).
next_action: post-merge check only (below), once /version.json reports 3903e71222c3966db8c90cef38d43172dd3e16b9 or later. A failed check reopens this task with the same owner.
post_merge_check: once /version.json reports the merged SHA, /onboarding (fresh Free account, 393x852) shows "Opens Quick Log now. Later sign-ins open your dashboard, one tap from Quick Log." under Quick Log; /settings Start screen shows "Diary-first. Sign-ins open your dashboard, one tap from Quick Log."
decisions:
  - Copy only. Routing is unchanged: routeForStartScreen("quickLog") stays /dashboard?open=quick-log and resolveReturningSignInRoute(quickLog) stays /dashboard; the new test pins both beside the copy.
  - One shared option list, two strings: `description` (sign-in truth, used by Settings) and optional `onboardingDescription` (Onboarding only). Settings never shows "now", because saving there opens nothing.
  - Timeline, Dashboard and Onboarding options keep their copy (they route where they say).
tried_and_rejected:
  - Reopening Quick Log on every sign-in: reverses a deliberate, test-pinned decision; offered to Matthew as an option, not chosen.
commands: bunx vitest run src/test/start-screen-quick-log-option-copy.test.tsx src/test/start-screen-preferences.test.ts src/test/onboarding-keyboard.test.tsx src/test/settings-start-screen-control.test.tsx --reporter=dot (CI)
files_touched: src/lib/startScreenPreferences.ts; src/pages/Onboarding.tsx (description line only); src/test/start-screen-quick-log-option-copy.test.tsx (new); this file
files_remaining: none
blockers: none
open_questions: none
gotchas: Do not regress no-email-verification sign-up, the single Start your room form, note read-back, or Delete account. Open PRs #3022 (Auth.tsx) and #3100-#3102 (Quick Log note, create plant) do not touch these files.
exclusions_for_review: the Claude thread session for the first-use friction P3 task (author)
reviewer_seat: no Seat A verdict was recorded; VReviewer APPROVED at d218d912 (review 6055361672), which is not an independent review. Codex code and security reviews found nothing at d218d912.
reviewer_sha: d218d912dbd79cd52962b98c852d03e89e99fa0a (VReviewer approval only)
session_state: no production access used; no paused workflows; no scheduled routines; app not run locally.
claimed_by: the Claude thread session for the first-use friction P3 task, 2026-11-25 08:30 UTC
owner: the Claude thread session for the first-use friction P3 task
last_updated: 2026-11-25 10:15 UTC, by the Claude thread session for the first-use friction P3 task
```
