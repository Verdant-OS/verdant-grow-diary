# FIRST-USE-FRICTION-P3-20261119

```text
TASK FIRST-USE-FRICTION-P3-20261119  priority: other  status: OPEN
goal: Fix first-use friction items 2, 5, 6, 8 and 9 from walkthrough FA-20261119-M1 (build 679e8f51b17a, fresh Free account), and report item 7 (homepage Start Free utm_campaign=paid_launch) without changing attribution.
why: Matthew's brief of 2026-11-19 11:10 UTC. A new grower should see one word for one entry type, a sign-up tab title that says sign-up, labeled onboarding icons, and a start screen that behaves as chosen.
branch: claude/project-thread-uapqkb (carried from claude/project-thread-9pfj7c; #3033 closed as superseded)
base: verdant-grow-diary @ c47a44d7d (merged into the branch as a8d99730e0a35dae938958f2093faca859d5805a)
pr: #3034 (draft)
head_sha: last verified checkpoint 77a9780036e05612041284a37f0e1ede202a6416 (35/35 required checks green, items 2, 6, 8 fixed); then a8d99730e0a35dae938958f2093faca859d5805a (merge of the deploy branch, no task change). A later handoff-only commit may follow; compare with git ls-remote origin claude/project-thread-uapqkb.
state: items 2, 6, 8 fixed test-first (RED commits 1780695, dbcaef8, 5e2e84d; fixes ce0bd09, 8fa3519, 20c879a, 77a9780); item 7 closed (keep the tag); item 5 waiting on Matthew; item 9 waiting on a live check
next_action: (1) get an independent Reviewer A, D or C verdict at the exact current head (none yet; Reviewer F is Matthew's own account and is not independent); (2) item 5: Matthew picked the top-bar form (QuickLogV2Sheet) on 2026-11-19 23:41 UTC; the plant page Quick Log button (PlantQuickLog) is pinned by locked scorers e2e/one-tent-loop-golden-path-ui.spec.ts and e2e/one-tent-loop-interaction-counter.spec.ts, so the swap waits on his OK to unlock them (asked 2026-11-19 23:46 UTC); (3) item 9: live check once /version.json shows #3030's merge.
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
files_remaining: item 5, only on Matthew's unlock: src/pages/PlantDetail.tsx (Quick Log button opens QuickLogV2Sheet with plant:<id>), a new RED test, and the two e2e specs above. Plant-page CTAs that open legacy QuickLog with activity presets (verdant:open-quicklog) stay as they are: QuickLogV2 open intents only take action water, so moving them is a separate slice. Item 9 (saved start screen, localStorage, read in Auth.tsx) overlaps #3030 B1 dashboard landing; needs a live check after #3030 lands.
blockers: item 5 waits on Matthew's scorer unlock. #3030 and #3031 are merged, so no open-PR file collision remains.
open_questions: none for item 7. Matthew chose "Keep the tag" (2026-11-19 11:26 UTC): the Start Free paid_launch owned-link tag is intended; no change.
gotchas: stay clear of #3031 files (MobileNav.tsx, QuickLog.tsx, QuickLogAllActivitiesSection.tsx, mobileTentNavRules.ts, quickLogNoteSaveRules.ts) and #3030 files. Do not regress no-email-verification sign-up, the single Start your room form, note read-back, or Delete account.
exclusions_for_review: the Claude thread session for the first-use friction P3 task (author)
reviewer_seat: none requested yet
reviewer_sha: none
session_state: no production access used; no paused workflows; no scheduled routines; app could not be run locally.
claimed_by: the Claude thread session for the first-use friction P3 task, 2026-11-19 11:40 UTC
owner: the Claude thread session for the first-use friction P3 task
last_updated: 2026-11-19 23:55 UTC, by the Claude thread session for the first-use friction P3 task
```
