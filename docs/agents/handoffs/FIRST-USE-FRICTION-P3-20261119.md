# FIRST-USE-FRICTION-P3-20261119

```text
TASK FIRST-USE-FRICTION-P3-20261119  priority: other  status: OPEN
goal: Fix first-use friction items 2, 5, 6, 8 and 9 from walkthrough FA-20261119-M1 (build 679e8f51b17a, fresh Free account), and report item 7 (homepage Start Free utm_campaign=paid_launch) without changing attribution.
why: Matthew's brief of 2026-11-19 11:10 UTC. A new grower should see one word for one entry type, a sign-up tab title that says sign-up, labeled onboarding icons, and a start screen that behaves as chosen.
branch: claude/project-thread-uapqkb (carried from claude/project-thread-9pfj7c; #3033 closed as superseded)
base: verdant-grow-diary @ c47a44d7d (merged into the branch as a8d99730e0a35dae938958f2093faca859d5805a)
pr: #3034 (draft)
head_sha: last verified checkpoint 81880116d51d6877aaab1d87fc90094747ac2ebe (35/35 required checks green; Mocked E2E closure green with S1a/S7 receipts unchanged). A later docs-only commit (baseline re-pin + this file) may follow; compare with git ls-remote origin claude/project-thread-uapqkb.
state: items 2, 5, 6, 8 fixed test-first; item 7 closed (keep the tag); item 9 waits on a live check
next_action: (1) independent Reviewer A, D or C verdict at the exact current head (Reviewer F is Matthew's own account, not independent); (2) item 9 live check once /version.json shows #3030's merge; (3) after merge, post-merge checks below.
post_merge_check: once /version.json reports the merged SHA, /auth?mode=signup shows a tab title containing "Create your Verdant Grow Diary account" and /auth still shows "Sign in to Verdant Grow Diary"; on a phone the header shows Search, Alerts and Sign out labels; with the disposable test account, a plant page Quick Log opens the same form as the header Quick Log and a [smoke <timestamp>] note shows as "Note" in Last activity.
decisions:
  - One push branch is allowed, so the parts land as separate commits in one draft PR, each named in the PR body. This replaces one PR per part.
  - Item 6 title copy lives in src/lib/authModeTabRules.ts (getAuthPageTitle) beside the existing mode rules; noindex, path and description are unchanged.
  - Item 2: Note-tile entries persist as observation + note marker (quickLogNoteMarkerRules); Last activity now maps marked observations to "note", as the Timeline does. Issue subtype is unchanged there (out of scope).
  - Item 8: the header icon controls are AppShell's (Onboarding has none of its own); #3030's AppShell hunks do not touch the header block.
  - Item 5 (Matthew picked the top-bar form 2026-11-19 23:41 UTC; "Unlock the two tests" 2026-11-23 13:13 UTC): new src/components/PlantDetailQuickLogButton.tsx opens QuickLogV2Sheet with defaultTargetKey plant:<id>. Add quick check, photo upload and sensor Update still open PlantQuickLog. Scorer unlock recorded with scripts/scorer-lock.mjs for e2e/one-tent-loop-golden-path-ui.spec.ts, e2e/one-tent-loop-interaction-counter.spec.ts and src/test/one-tent-golden-path-objective-contract.test.ts (it pins the golden-path spec selectors; the third file is flagged to the reviewer). I told Matthew the swap would cost a 5th tap and he accepted it; CI showed the header form closes on save, so S7 stays 4 clicks and the baseline is unchanged (re-pinned in docs/one-tent-loop-efficiency-baseline.md at 8188011).
  - Item 7 is report only: the paid_launch campaign is the owned-link mapping in src/lib/paidAcquisitionAttributionRules.ts and is test-pinned. No attribution change without Matthew's yes.
tried_and_rejected:
  - Local bun install --frozen-lockfile fails with ProxyConnectFailed 403 on registry tarballs, so local vitest and typecheck are BLOCKED; CI is the RED/GREEN evidence. No npm fallback.
commands: bunx vitest run src/test/auth-page-title-mode.test.tsx --reporter=dot (CI); bun run typecheck (CI)
files_touched: src/components/PlantDetailQuickLogButton.tsx; src/pages/PlantDetail.tsx (button only); src/test/plant-detail-quick-log-opens-top-bar-form.test.tsx; e2e/one-tent-loop-interaction-counter.spec.ts; e2e/one-tent-loop-golden-path-ui.spec.ts; src/test/one-tent-golden-path-objective-contract.test.ts; docs/one-tent-loop-efficiency-baseline.md; src/lib/authModeTabRules.ts; src/pages/Auth.tsx; src/test/auth-page-title-mode.test.tsx; src/components/AppShell.tsx (header icon labels only); src/test/app-shell-global-search-trigger.test.tsx; src/lib/plantLastActivityRules.ts; src/test/plant-detail-last-activity-pairing.test.tsx; this file
files_remaining: none for items 2, 5, 6, 8. Plant-page CTAs that open legacy QuickLog with activity presets (verdant:open-quicklog) were left as they are: QuickLogV2 open intents only take action water; moving them is a separate slice.
blockers: none in this PR. Authenticated golden-path e2e cannot run here (owner credentials); it is a post-deploy signal.
open_questions: none for item 7. Matthew chose "Keep the tag" (2026-11-19 11:26 UTC): the Start Free paid_launch owned-link tag is intended; no change.
gotchas: stay clear of #3031 files (MobileNav.tsx, QuickLog.tsx, QuickLogAllActivitiesSection.tsx, mobileTentNavRules.ts, quickLogNoteSaveRules.ts) and #3030 files. Do not regress no-email-verification sign-up, the single Start your room form, note read-back, or Delete account.
exclusions_for_review: the Claude thread session for the first-use friction P3 task (author)
reviewer_seat: none requested yet
reviewer_sha: none
session_state: no production access used; no paused workflows; no scheduled routines; app could not be run locally.
claimed_by: the Claude thread session for the first-use friction P3 task, 2026-11-19 11:40 UTC
owner: the Claude thread session for the first-use friction P3 task
last_updated: 2026-11-23 15:30 UTC, by the Claude thread session for the first-use friction P3 task
```
