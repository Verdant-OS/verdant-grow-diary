# REA-LIFECYCLE-MARKER-RACE

```text
TASK REA-LIFECYCLE-MARKER-RACE  priority: other  status: OPEN
goal: Remove the read race in scripts/rea/tests/lifecycle.test.mjs that intermittently fails the required "Lint, typecheck, test, build" check.
why: The test waited only for the marker file to exist, then read once; the fixture (fixtures/stubborn-child.mjs) rewrites it every 10 ms with writeFileSync, which truncates first, so a read could see ''. Failed required CI on #2818 (job 126276128198). Reproduced locally 1/60.
branch: claude/rea-lifecycle-marker-race
base: verdant-grow-diary
checkout: git fetch origin claude/rea-lifecycle-marker-race verdant-grow-diary && git switch claude/rea-lifecycle-marker-race
pr: #2837, open and non-draft; https://github.com/Verdant-OS/verdant-grow-diary/pull/2837
head_sha: read the current head on GitHub
state: fix committed; edits scorer-locked test scripts/rea/tests/lifecycle.test.mjs, which is still locked; no --unlock record or scorer-unlock.json in this diff; gated.
current_step: non-draft PR open; gated (it edits a scorer-locked test); review routed to Seats A, D and C.
next_action: gate is Seats A, D and C exact-head PASS plus Matthew's own-words yes naming the final SHA (#2815 precedent for locked-test changes), and 35/35 required green.
post_merge_check: required CI stops failing on this test; NOT_MEASURED until several post-merge runs.
active_writer: Claude session_017UoYKwwZkbqmWvtCRMw1DZ
decisions: Fix the test, not the fixture: poll until content is "alive" within the same 4 s deadline; assertions unchanged.
tried_and_rejected: a 60 ms widened fixture for RED proof (left almost no "alive" window, unrealistic); used 4 ms of each 10 ms cycle instead.
commands: node --test scripts/rea/tests/*.test.mjs; for i in $(seq 1 100); do node --test --test-name-pattern="owned process cleanup" scripts/rea/tests/lifecycle.test.mjs; done
files_touched: scripts/rea/tests/lifecycle.test.mjs; docs/agents/HANDOFF_LOG.md
files_remaining: none
blockers: none
open_questions: none
gotchas: run scorer-lock --lock after committing.
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/2818
artifacts: none
reviewer_seat: Seats A and D reviewed 851fbd1c3fb46b6d4297f6ed4cf37c844bdfc124; Seat C pending. The new head needs exact-head verdicts from Seats A, D and C.
reviewer_sha: 851fbd1c3fb46b6d4297f6ed4cf37c844bdfc124 (superseded by the docs-only fix commits; needs re-review)
session_state: no production access
claimed_by: Claude session_017UoYKwwZkbqmWvtCRMw1DZ, 2026-11-03 CT
owner: Claude
last_updated: 2026-11-03 22:50 CT, by Claude
```
