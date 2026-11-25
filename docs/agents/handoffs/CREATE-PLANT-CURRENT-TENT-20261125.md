# CREATE-PLANT-CURRENT-TENT-20261125

```text
TASK CREATE-PLANT-CURRENT-TENT-20261125  priority: P2  status: OPEN
goal: New plant opened outside a tent starts its Tent field on the setup's only tent, so the new plant's Quick Log, Upload Photo and Harvest work on the first try.
why: issue #3063 item 1, reconfirmed by QA FA-20261124-M1 and FA-20261125-M1 (desktop Plants -> New plant defaulted to "No tent"; plant page then locked Quick Log, Upload Photo and Harvest). Matthew's decision: his #3063 comment (2026-11-24) "Fix: default Tent to the current tent", and his 2026-11-25 "Start the tent fix now".
branch: claude/create-plant-current-tent-default
base: verdant-grow-diary (started at 8c7a96ab49c3af9b6dc497535f7ea8cebe6238e6)
pr: read the draft PR linked from issue #3063 for the number and exact head
state: draft
current_step: code + additive test pushed; required CI on the head is pending at push time
next_action: independent exact-head review by an eligible Seat C or D session; stay draft until then
post_merge_check: on https://verdantgrowdiary.com once /version.json reports the merged SHA, with the disposable test account in a setup that has exactly one tent: Plants -> New plant shows that tent in Tent, and the created plant's page has Quick Log enabled. Tag any saved record "[smoke <timestamp>]". NOT_MEASURED until then.
active_writer: Claude thread session for Cheek's task "Default new plants to your current tent"
decisions: "current tent" = the target setup's only tent (same rule as mobileTentNavRules); several tents keep "No tent"; a supplied tent stays with resolveInitialPlantTentId (fail-closed, #642/#645) unchanged; the dialog applies the default but never retracts it to "No tent" (a refetch or read error must not turn a visible tent into a silent tentless write); a grower's own Tent choice, including "No tent", is never overridden.
tried_and_rejected: resetting to "No tent" when the default disappears (would silently make a tentless write after a read error and breaks the stale-cached-tent fail-closed test); guessing the first of several tents.
commands: bunx vitest run src/test/create-plant-current-tent-default.test.tsx src/test/create-grow-binding-dialogs.test.tsx src/test/create-plant-dialog-binding.rtl.test.tsx src/test/create-plant-dialog-fail-closed.test.tsx --reporter=dot
files_touched: src/lib/createPlantCurrentTentDefaultRules.ts (new), src/components/CreatePlantDialog.tsx, src/test/create-plant-current-tent-default.test.tsx (new), this file
files_remaining: none planned
blockers: local vitest not run (repo dependencies not installed in this session); CI is the test evidence
open_questions: none
claimed_by: Claude thread session, 2026-11-25 06:40 UTC
owner: Claude thread session
last_updated: 2026-11-25, by Claude
```
