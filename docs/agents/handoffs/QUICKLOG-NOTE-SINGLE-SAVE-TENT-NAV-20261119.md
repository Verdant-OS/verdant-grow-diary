# QUICKLOG-NOTE-SINGLE-SAVE-TENT-NAV-20261119

```text
TASK QUICKLOG-NOTE-SINGLE-SAVE-TENT-NAV-20261119  priority: P2  status: OPEN
goal: one note makes one Quick Log entry; both save confirmations show the note text; the mobile bottom-bar Tent button opens the grower's tent and falls back to Home.
why: Matthew's phone pass on prod (2026-11-19). (1) The All activity types Note panel's Save already saved an entry, but the legacy form below kept showing "Add a quick note before saving", so he typed the note again, pressed Save log and got two entries. (2) Neither confirmation showed the note text. (3) Tent in the mobile bottom bar always went to the Dashboard ("/").
branch: claude/project-thread-2qa65s
base: verdant-grow-diary (started at 53ce0c6)
checkout: git fetch origin claude/project-thread-2qa65s verdant-grow-diary && git switch claude/project-thread-2qa65s && git merge --ff-only "$VERIFIED_SHA" && test "$(git rev-parse HEAD)" = "$VERIFIED_SHA" && git merge origin/verdant-grow-diary
pr: see the draft PR from claude/project-thread-2qa65s (number recorded on update)
head_sha: recorded on the PR; this file is written before the first push
state: pushed draft (tests first, then fix)
current_step: RED commit (tests + pure rules), then the component wiring commit
next_action: confirm CI shows the new component tests RED on the tests-only commit and GREEN after the wiring commit; then request an eligible independent review (Reviewer A, D or C) at the exact head
post_merge_check: on https://verdantgrowdiary.com once /version.json reports the merged SHA, with the disposable test account and its fixture plant: save a [smoke <timestamp>] note from the Note panel, confirm the hint changes to "Note saved", Save log with the same text does not add a second Timeline entry, the confirmation shows the note text, and the bottom-bar Tent opens /tents/<fixture tent id>
active_writer: Claude thread session (cmsg_01P7pGxx3V5wxVuLXvJUxaGsRWY2cCBRH1mCQXgiEbuwZU)
decisions: pure rules in src/lib/quickLogNoteSaveRules.ts and src/lib/mobileTentNavRules.ts; components only present. src/lib/quickLogPreviewRules.ts is unchanged (pinned): the panel-saved line replaces note:missing after evaluation. The duplicate guard only blocks Save log when the text equals the panel-saved note for the same plant and the entry type is observation/note, so a different note or a structured entry still saves. Tent never guesses between several tents: current tent page, else the only tent, else the active grow's only tent, else "/". MobileNav's exported primary[] keeps to:"/" (pinned by tonight-tent-mobile-primary-nav.test.tsx).
tried_and_rejected: hardcoding a last-visited tent in storage (adds a write path and a stale-target risk; not needed for the one-tent Free account).
commands: bunx vitest run src/test/quick-log-note-save-rules.test.ts src/test/mobile-tent-nav-rules.test.tsx src/test/quick-log-note-panel-single-save.test.tsx src/test/tonight-tent-mobile-primary-nav.test.tsx src/test/mobile-nav.test.tsx src/test/quick-log-all-activities-integration.test.tsx src/test/quicklog-tentless-plant-save.test.tsx --reporter=dot
files_touched: src/lib/quickLogNoteSaveRules.ts, src/lib/mobileTentNavRules.ts, src/components/QuickLog.tsx, src/components/QuickLogAllActivitiesSection.tsx, src/components/MobileNav.tsx, src/test/quick-log-note-save-rules.test.ts, src/test/mobile-tent-nav-rules.test.tsx, src/test/quick-log-note-panel-single-save.test.tsx
files_remaining: none planned
blockers: local vitest/typecheck/lint BLOCKED in this container (bun install --frozen-lockfile gets 403 from the pinned registry); CI is the evidence. Pure rules were checked with a bun scratch script.
open_questions: should Tent remember the last tent visited for growers with several tents? Left out; Home is the fallback.
gotchas: do not touch #3030's files (AppShell.tsx, QuickLogV2Sheet.tsx, StartYourRoom.tsx, FieldNotebookMount.tsx). No schema, RLS, edge, auth, billing or production change. No migration.
links: draft PR #3030 (onboarding B1-B4) is a separate workstream with no file overlap.
artifacts: PR checks on the draft PR
reviewer_seat: eligible independent reviewer (Reviewer A, D or C), not this session
reviewer_sha: none yet
session_state: Claude thread session for task u22aaa4237983c87f39f1ba8055a2b2ec; subscribed to the PR's activity
claimed_by: Claude thread session, 2026-11-19 04:45 CT
owner: Claude thread session
last_updated: 2026-11-19 04:45 CT, by Claude
```
