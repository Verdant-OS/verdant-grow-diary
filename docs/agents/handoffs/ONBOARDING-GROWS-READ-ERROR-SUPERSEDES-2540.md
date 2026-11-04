### ONBOARDING-GROWS-READ-ERROR-SUPERSEDES-2540

```text
TASK ONBOARDING-GROWS-READ-ERROR-SUPERSEDES-2540  priority: P2  status: OPEN
goal: supersede draft #2540 (head b92cbcd186f3c157814916d06deaa9e5350774a5) with Sour Diesel review 5674522946's P2 fixed: a null/non-array grows read shows the error + Try again state, never the start screen/StartYourRoom; plus P3 Try again works without a provider refresh.
why: a malformed read could spend the Free plan's one grow. Matthew (2026-10-27) asked for separate PRs while Cursor is down.
branch: claude/onboarding-grows-read-error (created at b92cbcd186f3c157814916d06deaa9e5350774a5)
base: verdant-grow-diary
checkout: git fetch origin claude/onboarding-grows-read-error verdant-grow-diary && git switch claude/onboarding-grows-read-error && git merge --ff-only "$VERIFIED_SHA" && test "$(git rev-parse HEAD)" = "$VERIFIED_SHA" && git merge origin/verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2562 (ready for review since 2026-10-28; auto-merge off since the 06:21Z base merge, re-queue is the merge seat's call)
head_sha: dde99eb008a0e38338edf47a6c9456b01046e43d before the Codex-findings commit; read the current head from the PR
state: ready for review
current_step: awaiting CI and an independent exact-head review
next_action: re-review at the current head (Jack Herer PASS-pending-CI at dde99eb0 no longer covers it); Codex P2s fixed: growRepo keeps database error codes so permanent errors stop retrying, and Sign in again handles a failed sign-out via performSafeSignOut
post_merge_check: NOT_APPLICABLE for production without a forced malformed read; covered by onboarding-null-grows-render.test.tsx
active_writer: Claude session_017UoYKzLzTv1RAhx1Cc7Pme
decisions: malformed settled list -> existing error state (sentinel growsError); Try again falls back to window.location.reload() via pure retryOnboardingGrowsRead; abort of timed-out attempts deferred (growRepo fetchTents/fetchPlants take no AbortSignal; reviewer rated it bounded). PGRST301 (Matthew 2026-10-27: yes): the store keeps retrying it, and only after retries run out reports error "session_expired" (pure growsReadErrorValue); Onboarding then shows "Sign in again", which calls signOut so the existing !user branch routes to /auth. Explicit button, not an automatic sign-out.
tried_and_rejected: making PGRST301 non-retryable unilaterally (source comment says it is retried for the post-sign-in race).
commands: bunx vitest run src/test/onboarding-null-grows-render.test.tsx src/test/onboarding-grows-retry-rules.test.ts src/test/starter-setup-onboarding.test.tsx src/test/onboarding-grows-session-expired.test.tsx
files_touched: src/pages/Onboarding.tsx; src/lib/onboardingGrowsRetryRules.ts; src/test/onboarding-null-grows-render.test.tsx; src/test/onboarding-grows-retry-rules.test.ts; src/test/starter-setup-onboarding.test.tsx; src/lib/growsReadRetryRules.ts; src/store/grows.tsx; src/test/onboarding-grows-session-expired.test.tsx
files_remaining: src/lib/growsReadRetryRules.ts (PGRST301, abort) pending decision
blockers: PGRST301 design decision (Matthew)
open_questions: this PR modifies four scorer-locked tests relative to base (grow-data-deadline-late-meta, slow-loading-screen-gates, starter-setup-onboarding, tent-detail-plant-list-read-state); they need Matthew's OK or a revert before merge
gotchas: starter-setup-onboarding mock now passes grows: [] explicitly (a missing list now reads as malformed)
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/2540
artifacts: PR checks
reviewer_seat: not assigned (OG Kush routes; this session excluded as author)
reviewer_sha: none
session_state: no routines; no paused workflows
claimed_by: Claude session_017UoYKzLzTv1RAhx1Cc7Pme, 2026-10-27 17:00 CT (Matthew: separate PRs)
owner: Claude session_017UoYKzLzTv1RAhx1Cc7Pme
last_updated: 2026-10-27 18:20 CT, by Claude
```
