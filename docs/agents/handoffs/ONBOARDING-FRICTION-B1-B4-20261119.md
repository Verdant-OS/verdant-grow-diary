# ONBOARDING-FRICTION-B1-B4-20261119

```text
TASK ONBOARDING-FRICTION-B1-B4-20261119  priority: P2  status: OPEN
goal: a fresh Free grower goes from sign-up through /start-room and the first Quick Log to the dashboard in one pass, sees what Verdant named their grow and tent, sees a real week/age/start date on the dashboard tent card, and finds Quick Log's reading time filled with now.
why: QA pass on prod 679e8f51b17a (2026-11-19, 3:50-3:58 AM CT, fresh Free account, desktop), Part B of Matthew's builder brief: B1 onboarding never reaches the dashboard; B2 tent card shows "Week —" and "Age: — · Started: —"; B3 grow and tent names are hidden in a collapsed group; B4 Quick Log "Reading time" is blank by default.
diagnosis: B1 src/pages/StartYourRoom.tsx sends the grower to /plants/<id>?open=quick-log and nothing ever routes on to "/". B2 src/components/FieldNotebookMount.tsx hard-coded "Week —", "Age: —", "—" although grows.started_at is a required column filled at creation. B3 src/pages/StartYourRoom.tsx shows the defaults only inside the collapsed <details>. B4 src/components/QuickLogV2Sheet.tsx renders the datetime-local input with an empty value (empty already meant "now at save").
fix: client only. B1 new src/lib/startRoomDashboardHandoff.ts: Start your room writes a one-shot sessionStorage marker naming the new plant; AppShell takes it when it consumes that plant's Quick Log intent and, on the first close of that legacy Quick Log (saved or dismissed), navigates to "/". The marker is removed on first read and only matches the same plant id. B2 new src/lib/fieldNotebookTentAgeRules.ts derives Week N / Age / Started from grows.started_at in the grower's zone; FieldNotebookScope reads it from the grows store; missing date reads "Start date not set" (no dashes). B3 startRoomPendingNamesLine in src/lib/startYourRoomRules.ts; the page shows "Creates grow “My grow” and tent “Tent 1”." above the optional group, live with typed names. B4 QuickLogReadingTime.toLocalInputValue; the sheet shows now (and max=now) while its state stays empty, so save time, retry locking and #2976 refusal are unchanged; helper line "Now, unless you change it.".
branch: claude/project-thread-vjgpfg
base: verdant-grow-diary at 679e8f51b17a
pr: draft; head SHA recorded on the pull request
state: pushed tests-first commit for RED proof, then the wiring commit
next_action: (1) 35/35 required checks at the PR head; (2) one independent exact-head review by a session that did not write this (OWNERSHIP.md section 4.3); (3) Matthew's per-item yes naming the PR and SHA, then the Merge Steward queues it.
post_merge_check: once live /version.json reports the merged SHA, a fresh Free account: /start-room shows the "Creates grow … and tent …" line; after Create plant the first Quick Log close lands on "/"; the dashboard tent card shows "Week 1", "Age: started today", today's date and no "—"; Quick Log V2's Reading time shows the current local time, and the saved entry's time matches on Timeline after a refresh. Both desktop and 393x852.
decisions: (1) Auto-land on the dashboard after the first close rather than adding a CTA: the brief's acceptance is "one pass, no dead ends", and a later Quick Log never redirects. (2) Marker in sessionStorage, not a new URL param, so the existing locked tests that pin /plants/<id>?open=quick-log stay unchanged and no shared intent parser changes. (3) No start-date write: grows.started_at already holds the creation time and is editable; the card now reads it. (4) Reading time keeps the empty state meaning "now at save" so retry locking (QUICK_LOG_RETRY_READING_TIME_REFUSAL) is untouched.
not_in_scope: Part A calibration 404 (separate thread, PR #3029); dashboard checklist redesign; any schema, RLS, auth, edge or migration change; billing.
tests: new src/test/onboarding-dashboard-handoff.test.tsx, src/test/onboarding-start-room-names-and-handoff.test.tsx, src/test/onboarding-tent-card-start-date.test.tsx, src/test/onboarding-quick-log-reading-time-default.test.tsx. RED proof: tests-first commit pushed before the wiring commit; CI result in the PR body.
commands: bunx vitest run src/test/onboarding-dashboard-handoff.test.tsx src/test/onboarding-start-room-names-and-handoff.test.tsx src/test/onboarding-tent-card-start-date.test.tsx src/test/onboarding-quick-log-reading-time-default.test.tsx --reporter=dot ; bun run typecheck
files_touched: src/lib/startRoomDashboardHandoff.ts; src/lib/fieldNotebookTentAgeRules.ts; src/lib/startYourRoomRules.ts; src/lib/quickLogReadingTime.ts; src/components/AppShell.tsx; src/pages/StartYourRoom.tsx; src/components/FieldNotebookMount.tsx; src/components/QuickLogV2Sheet.tsx; the four tests above; this file
files_remaining: none for this slice
gotchas: `bun install --frozen-lockfile` 403s on the lovable-core-prod mirror in this cloud box, so local vitest, typecheck, lint and build are BLOCKED here; CI is the evidence. Do not regenerate bun.lock. PR #3021 also edits src/pages/Dashboard.tsx; this slice does not touch Dashboard.tsx.
blockers: local test/typecheck/lint/build BLOCKED as above; before/after screenshots NOT_MEASURED (no local app run, prod does not carry the change).
reviewer_seat: any eligible session that did not author or repair this change
reviewer_sha: none yet
session_state: no routines, no paused workflows. Pending human decisions: Matthew's merge yes after review.
claimed_by: Claude thread session (onboarding friction B1-B4), 2026-11-19 11:00 UTC
owner: Claude thread session (onboarding friction B1-B4); workstream seat Pineapple Express (Product) per the brief
last_updated: 2026-11-19 11:00 UTC, by Claude thread session (onboarding friction B1-B4)
```
