# GROWER-DEAD-ENDS-VER-287-VER-276

```text
TASK GROWER-DEAD-ENDS-VER-287-VER-276  priority: P2  status: CLOSED
goal: One draft PR. Dashboard recovers from one transient tent or plant read instead of sticking on "grow data unavailable". Onboarding renders when the grows list is null.
why: VER-287 is an intermittent dashboard dead end after a single failed read. VER-276 is Sentry VERDANT-WEB-1, a TypeError on /onboarding whose message and stack are redacted.
branch: cursor/grower-dead-end-retries-4922
base: verdant-grow-diary
checkout: git fetch origin cursor/grower-dead-end-retries-4922 verdant-grow-diary && git switch cursor/grower-dead-end-retries-4922 && git merge --ff-only "$VERIFIED_SHA" && test "$(git rev-parse HEAD)" = "$VERIFIED_SHA" && git merge origin/verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2540 (draft)
head_sha: 020c1d7da8285dfd7ff6a97722d0fde5fe0286c3
state: CLOSED. Merged as d590b2c105435cb2b22d1f265a4dea48948ccd3a (#2540) on 2026-10-28T07:02:38Z. Closed 2026-11-04 by Claude session_017UoYKv4arxJYBMGNNh1bvN on Matthew's instruction (Grok no longer active); copied from its HANDOFF_LOG.md block, which stays unedited per docs/agents/handoffs/README.md.
current_step: Each tent and plant attempt is capped with growReadAttemptDeadlineMs. A hung read errors inside GROW_READ_BUDGET_MS. Onboarding calls refreshGrows only when it is present. A log-only commit may follow this head_sha.
next_action: none; closed. Any post_merge_check below still applies to its recorded owner.
post_merge_check: After merge, a signed-out check is NOT_APPLICABLE. On the next production deploy, confirm /onboarding renders for a new account and the dashboard does not stick on the unavailable card after one slow tent or plant read. Until that deploy, NOT_MEASURED.
active_writer: Cursor Grok cloud agent
decisions: Retry inside useGrowTents and useGrowPlants so the dashboard stays on the loading state until the bounded sequence finishes, then shows the existing Try again button. Do not retry permission or other non-retryable codes. Do not create a grow. Onboarding null-safety is local to the page because Sentry has no stack.
tried_and_rejected: Sentry issue VERDANT-WEB-1 has no stacktrace and a redacted message, so a line-level production cause is unconfirmed. The grows list already retried; the card still appears when tents or plants fail once.
commands: NODE_OPTIONS=--max-old-space-size=8192 bun run typecheck; bunx vitest run src/test/dashboard-transient-grow-read-retry.test.tsx src/test/onboarding-null-grows-render.test.tsx src/test/grow-data-deadline-late-meta.test.tsx --reporter=dot
files_touched: src/lib/growsReadRetryRules.ts; src/hooks/useGrowData.ts; src/pages/Onboarding.tsx; src/test/dashboard-transient-grow-read-retry.test.tsx; src/test/onboarding-null-grows-render.test.tsx; src/test/grow-data-deadline-late-meta.test.tsx; src/test/slow-loading-screen-gates.test.tsx; src/test/tent-detail-plant-list-read-state.test.tsx; src/test/grow-data-retry-budget-hooks.test.tsx; docs/agents/HANDOFF_LOG.md
files_remaining: none planned
blockers: none for the repository change. Independent exact-head review is not requested. GitHub comments stay unposted.
open_questions: production cause of VER-287 is unconfirmed (one timed-out or dropped tent/plant read is the code path that matches the card). VERDANT-WEB-1 stack remains unavailable.
gotchas: grow-data-deadline-late-meta now advances past the first deadline plus one backoff before it expects isError. Scorer unlock is local and git-ignored; name the pin in the PR body.
links: https://linear.app/verdantgrowdiary/issue/VER-287 ; https://linear.app/verdantgrowdiary/issue/VER-276 ; https://verdant-grow-diary.sentry.io/issues/VERDANT-WEB-1
artifacts: this block
reviewer_seat: Jack Herer failed review 5669711049 at b16b6277de4e2ab913086f943f2be232687dbf9f. A new exact-head review is required after 020c1d7da8285dfd7ff6a97722d0fde5fe0286c3.
reviewer_sha: NOT_MEASURED for 020c1d7da8285dfd7ff6a97722d0fde5fe0286c3
session_state: Cursor cloud agent; no paused workflow
claimed_by: Cursor Grok cloud agent, 2026-10-26
owner: Cursor Grok cloud agent
last_updated: 2026-10-27 10:28 CT, by Cursor Grok cloud agent
```
