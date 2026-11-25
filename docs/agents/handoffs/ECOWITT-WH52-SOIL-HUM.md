```text
TASK ECOWITT-WH52-SOIL-HUM  priority: other  status: OPEN
goal: routeEcoWittPayloadToTents maps WH52 soil_ec_humN (N=1-8) to soil_moisture_pct for tents whose hardware_config.ecowitt.soil_channels includes N.
why: A WH52 probe publishes moisture as soil_ec_humN. The router only accepted soilmoisture1-8, so gateway Verdant / Soil Alpha on ch_soil_ec1 (31%) was dropped. Refs #3090. Draft #3091 pins the old drop and must not be edited.
branch: cursor/ecowitt-wh52-soil-ec-hum-6601
base: verdant-grow-diary
pr: set after open
head_sha: set after push
state: local implementation
current_step: router accepts soil_ec_humN; soil_ec_tempN and soil_ecN stay unmapped
next_action: push, open the PR with Refs #3090, watch required CI
post_merge_check: a WH52 custom-upload fixture with soil_ec_hum1 and soil_channels [1] stores one soil_moisture_pct row. NOT_MEASURED until merge; local vitest is the pre-merge check.
active_writer: Cursor Grok cloud agent
decisions: soilmoistureN wins when both keys exist for the same N, including when the WH51 value is invalid (WH52 is skipped, not a second reading). soil_ec_tempN and soil_ecN are not EcoWittRouterMetric values, so they are not mapped.
tried_and_rejected: widening EcoWittRouterMetric for soil temp and EC. Those names exist on other ingest paths, not on this router.
commands: bunx vitest run src/test/ecowitt-wh52-soil-moisture-routing.test.ts src/test/ecowitt-channel-tent-router.test.ts --reporter=dot
files_touched: supabase/functions/_shared/ecowittChannelTentRouter.ts; src/test/ecowitt-wh52-soil-moisture-routing.test.ts; this file
files_remaining: none for the mapping
blockers: none
open_questions: #3091's pin test src/test/ecowitt-wh52-soil-ec-namespace.test.ts must be flipped after both PRs land
gotchas: src/lib/ecowittChannelTentRouter.ts re-exports the _shared file. Do not edit supabase/functions/_shared/lib (generated mirror).
links: https://github.com/Verdant-OS/verdant-grow-diary/issues/3090
artifacts: none
reviewer_seat:
reviewer_sha:
session_state: cloud agent implementing the WH52 moisture map
claimed_by: Cursor Grok, 2026-11-25
owner: Cursor Grok
last_updated: 2026-11-24 19:30 CT, by Cursor Grok
```
