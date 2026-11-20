# NOTEBOOK-FRICTION-BATCH-2-WORDING-AND-LINKS

```text
TASK NOTEBOOK-FRICTION-BATCH-2-WORDING-AND-LINKS  priority: other  status: OPEN
goal: Each page has one name, no button links to the page it sits on, status changes read as words, and the sign-in form comes first with one "Forgot password?" (friction items 3, 10 and 12 of the 2026-11-19 field-notebook walk).
why: The walk on the live build 0d9e9c0 found /daily-check called Quick Log, Daily Check and Log; a "Start Daily Grow Check" button on /daily-check linking to itself; "pending_approval → cancelled" in history rows; and three help paragraphs above the sign-in form plus a duplicate Forgot password tab.
branch: claude/notebook-batch-2-wording
base: verdant-grow-diary at 0d9e9c081973ea3e4ff86f5cd8822d5cfab3f1be
checkout: git fetch origin claude/notebook-batch-2-wording verdant-grow-diary && git switch claude/notebook-batch-2-wording
pr: the draft PR opened from this branch
head_sha: read the PR's current full head; a commit cannot name itself.
state: Implemented in four commits. Pure rules plus thin wiring. Pure tests pass locally (scratch vitest 4.1.12, node env, 79 across touched suites). Mounted .tsx suites, e2e, full tsc, lint and build NOT_MEASURED locally (bun install --frozen-lockfile BLOCKED by registry 403); required CI provides them.
current_step: Ready for review (Cheek, 2026-11-19: "Mark both ready"); required CI running. Shard 15 at efdf98c failed on two three-tab keyboard pins missed in the build; fixed.
next_action: Read required CI at the PR head; fix any mounted auth-test fallout. Then route one eligible independent reviewer. Stay draft. No merge without Matthew's yes naming the PR and full head SHA.
post_merge_check: After an approved release, read-only on production: /auth shows the email field before the help lines and exactly one "Forgot password?" control, which opens the reset form; /daily-check tab title reads "Quick Log | Verdant Grow Diary" and its onboarding card shows no self-link; an Action Queue history row reads in words.
active_writer: Claude thread session (Cheek, 2026-11-19 03:17 UTC: "build batch 2 on a second branch, claude/notebook-batch-2-wording, as its own draft PR").
decisions: (1) One name = "Quick Log", not the spec's "Daily Check" default: src/test/daily-check-quick-log-header.test.tsx records a prior deliberate choice of "Quick Log" for this page and rejects "Daily Grow Check"; only the browser tab title ("Daily Check") disagreed, so it now says Quick Log. Bottom-bar "Log" kept. (2) Self-link: DailyGrowCheckOnboardingCard takes currentPath; DailyCheck passes "/daily-check"; isCtaForCurrentPath hides only the button. (3) formatStatusTransition at six render sites; unknown tokens sentence case, missing = dash. (4) Auth: AUTH_MODES keeps three modes; AUTH_MODE_TABS shows two; help lines moved below the sign-in form unchanged.
tried_and_rejected: A stripMachineTags helper: action reasons are already stripped by actionQueueProvenanceRules.stripBackPointerTokens at every grower-facing site checked, so it would duplicate it. Renaming the page "Daily Check" (contradicts the pinned Quick Log decision).
commands: vitest run src/test/status-transition-labels.test.ts src/test/daily-grow-check-onboarding-cta-self-link.test.ts src/test/auth-mode-tab-rules.test.ts src/test/timeline-action-events.test.ts src/test/daily-grow-check-onboarding.test.ts src/test/daily-grow-check-consistency.test.ts src/test/daily-grow-check-history.test.ts
files_touched: src/lib/statusTransitionLabelRules.ts (new); src/lib/dailyGrowCheckOnboardingRules.ts; src/lib/appDocumentTitleRules.ts; src/lib/authModeTabRules.ts; src/components/DailyGrowCheckOnboardingCard.tsx; src/pages/Alerts.tsx, AlertDetail.tsx, Timeline.tsx, ActionDetail.tsx, ActionQueue.tsx, DailyCheck.tsx, Auth.tsx; new tests status-transition-labels, daily-grow-check-onboarding-cta-self-link; pins updated in auth-access, auth-a11y, auth-axe, auth-message-announcements, auth-mode-tab-rules, app-document-title tests and e2e auth-desktop, auth-loading specs (tab click -> link click); auth-keyboard-focus and auth-a11y tab-count pins (two tabs, found by CI shard 15 at efdf98c); action-detail transition pin (found by CI shard 27 at 1c14b47); this file.
files_remaining: none planned.
blockers: Local mounted tests, e2e, tsc, lint and build BLOCKED (no node_modules; registry 403).
open_questions: Cheek may still prefer "Daily Check" over "Quick Log" as the page name; one constant to flip.
gotchas: The walk's "raw alert tags" were not reproduced in source; the reason strippers already exist. Alerts.tsx and AlertDetail.tsx got a prettier-only follow-up commit on the touched lines.
links: Spec in the project's verdant-ui-notes/batch-2-wording-and-links-spec.md (outside the repo).
artifacts: none
reviewer_seat: an available independent non-contributing Claude or Grok session, or Codex; this Claude thread session is excluded.
reviewer_sha: NOT_MEASURED
session_state: Two builder subagents were started and stopped before any edit (context budget); their worktrees are gone. No routines or production actions.
claimed_by: Claude thread session, 2026-11-19 03:40 UTC
owner: Claude thread session
last_updated: 2026-11-19 04:01 UTC, by Claude thread session
```
