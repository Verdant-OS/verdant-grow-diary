# NAV-PLANT-BACK-TO-TENT-20261125

```text
TASK NAV-PLANT-BACK-TO-TENT-20261125  priority: other  status: OPEN
goal: On a plant page, the top back link goes to the plant's own tent, by name, instead of the whole Plants list. A plant with no tent keeps "Plants".
why: Field-notebook walk (Cheek's UI friction list): the plant page's only near-the-top way out was "Plants"; the way back to its tent ("View Tent") sat about a phone screen lower. Tent -> plant -> back is the core loop, so this saves a scroll and a tap on every plant visit.
branch: claude/project-thread-cv7kqk
base: verdant-grow-diary at 8c7a96ab49c3af9b6dc497535f7ea8cebe6238e6
checkout: git fetch origin claude/project-thread-cv7kqk verdant-grow-diary && git switch claude/project-thread-cv7kqk
pr: the draft PR opened from this branch
head_sha: read the PR's current full head; a commit cannot name itself.
state: Implemented. Pure rule test 5/5 pass, and 5/5 fail with the rule set aside (scratch vitest 4.1.12, node env). Mounted cases in plant-detail-assigned-tent-read-state.test.tsx, typecheck, lint and build NOT_MEASURED locally (repo node_modules incomplete: no @testing-library, no typescript, vitest missing pathe); required CI provides them once the PR is out of draft.
current_step: Draft PR open; draft-scope checks running.
next_action: Read the draft checks; then ask Cheek whether to mark it ready so the 32 shards and the build run (drafts skip 33 of 35 required checks). Then route one eligible independent reviewer (Seat A per Cheek's 2026-11-24 merge gate) at the exact head. Stay draft until Cheek's word for this PR. No merge by this session.
post_merge_check: After a release whose /version.json reports the merge SHA, read-only on https://verdantgrowdiary.com with the disposable test account at phone width: open a plant that sits in a tent; the top back link reads the tent's name and opens /tents/<that tent>. A plant with no tent shows "Plants" and opens /plants.
active_writer: Claude thread session (coordinator relay of Cheek's "Keep building", 2026-11-25 08:19 UTC).
decisions: (1) Reuse resolveBackContext (the blocked-state rule that already sends archived/slow plants "Back to tent") so there is one back-target rule; the new resolvePlantDetailTopBack only relabels it. (2) Plant's own tent id only: the ?tentId= context is ignored on a ready page, so a plant with no tent never links to some other tent; no remembered targets (banned and test-pinned). (3) Label is the tent name when the tent row matching the plant's tent id has loaded, else "Tent"; a wrong-id row never names the link. (4) Archived plants get the same link, matching the archived blocked state's existing "Back to tent".
tried_and_rejected: A separate tent-back rule (would duplicate resolveBackContext). Using ?tentId= on the ready page (could send a tentless plant to an unrelated tent).
commands: T=src/test/plant-detail-top-back-to-tent.test.ts vitest run (scratch config, node env). CI: src/test/plant-detail-assigned-tent-read-state.test.tsx (three new mounted cases).
files_touched: src/lib/plantDetailBlockedStateViewModel.ts (resolvePlantDetailTopBack); src/pages/PlantDetail.tsx (top back button reads it); src/test/plant-detail-top-back-to-tent.test.ts (new); src/test/plant-detail-assigned-tent-read-state.test.tsx (new describe block); this file.
files_remaining: none planned.
blockers: Local mounted tests, tsc, lint and build BLOCKED (incomplete node_modules; frozen install hits the registry 403).
open_questions: none.
gotchas: plantDetailBlockedStateViewModel.ts was not prettier-clean on the base (a pre-existing union wrap); left as it was to avoid moving pins.
links: Friction list in the project's verdant-ui-notes/friction-notes.md (outside the repo), lines on the plant breadcrumb and "View Tent".
artifacts: none
reviewer_seat: one eligible independent reviewer who did not author or repair this (Seat A, Sour Diesel, per Cheek's 2026-11-24 routine merge gate); this Claude thread session is excluded.
reviewer_sha: NOT_MEASURED
session_state: No routines, no production actions, no browser use for this slice.
claimed_by: Claude thread session, 2026-11-25 08:30 UTC
owner: Claude thread session
last_updated: 2026-11-25 08:30 UTC, by Claude thread session
```
