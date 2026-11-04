# SENSORS-PAGE-SECTIONS-SPEC

```text
TASK SENSORS-PAGE-SECTIONS-SPEC  priority: other  status: OPEN
goal: Spec splitting Sensors into Daily readings, History & import, and Connect & diagnostics, with founder decisions D1-D3.
why: Live audit 2026-11-03 finding 7. Source-traced: SensorsTestbenchPanel (testbench, bridge tokens, command examples) renders for any grower whose server live-sensor gate is open, on the same scroll as daily readings; operator diagnostics are already role-gated.
branch: claude/sensors-page-sections-spec
base: verdant-grow-diary
checkout: git fetch origin claude/sensors-page-sections-spec verdant-grow-diary && git switch claude/sensors-page-sections-spec
pr: #2833, open and non-draft; https://github.com/Verdant-OS/verdant-grow-diary/pull/2833
head_sha: read the current head on GitHub
state: spec committed; D1-D3 awaiting Matthew.
current_step: non-draft PR open; review routed to Seat A.
next_action: record D1-D3; then implementation.
post_merge_check: none (docs only).
active_writer: Claude session_017UoYKwwZkbqmWvtCRMw1DZ
decisions: Collision check: none of #2732, #2751, #2752, #2757 edits src/pages/Sensors.tsx; Sensors.tsx mounts none of the #2732 EcoWitt station cards (EcowittTentSnapshotV0Card is only at TentDetail.tsx:762; the Upload Station files arrive with #2732); its own EcoWitt panels move only as whole components. Fences keep source labels beside values, access gates unchanged, no credentials outside Connect.
tried_and_rejected: none
commands: none (docs only)
files_touched: docs/specs/sensors-page-sections.md; docs/agents/HANDOFF_LOG.md
files_remaining: none for the spec
blockers: founder decisions D1-D3
open_questions: uncertainty: ManualSensorReadingCard.tsx:976 says pH/EC are not stored as sensor metrics, while manualSensorFreshnessRules.ts:10 tracks ph and ec; trace before changing either.
gotchas: a bash command containing the word for the HTTP CLI tool is blocked by a hook; use the Grep tool for that search.
links: none
artifacts: none
reviewer_seat: Seat A requested
reviewer_sha: see PR
session_state: no production access
claimed_by: Claude session_017UoYKwwZkbqmWvtCRMw1DZ, 2026-11-04
owner: Claude
last_updated: 2026-11-03 22:55 CT, by Claude
```
