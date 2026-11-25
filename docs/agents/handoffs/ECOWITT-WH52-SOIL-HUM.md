```text
TASK ECOWITT-WH52-SOIL-HUM  priority: other  status: OPEN
goal: routeEcoWittPayloadToTents maps WH52 soil_ec_humN (N=1-8) to soil_moisture_pct for tents whose hardware_config.ecowitt.soil_channels includes N.
why: A WH52 probe publishes moisture as soil_ec_humN. The router only accepted soilmoisture1-8, so gateway Verdant / Soil Alpha on ch_soil_ec1 (31%) was dropped. Refs #3090. #3091 is open and not a draft. #3093 merges first. #3091 is then rebased onto that merge, and its WH52 namespace test is flipped in #3091 itself, because the merge queue runs #3091's assertion against the merged tree. Do not edit #3091 from this branch.
branch: cursor/ecowitt-wh52-soil-ec-hum-6601
base: verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/3093
head_sha: 65902390fffa2aa6f79c6955daf65c2b46e72260
state: pushed; Seat A PASS with P2s at that SHA; repair commit next
current_step: correct the #3091 merge-order claim in the PR body and this file; extend the WH52 routing test
next_action: one commit, push, wait for required CI, put run links in the PR body
post_merge_check: a WH52 custom-upload fixture with soil_ec_hum1 and soil_channels [1] stores one soil_moisture_pct row. NOT_MEASURED until merge; local vitest is the pre-merge check.
active_writer: Cursor Grok cloud agent
decisions: soilmoistureN wins when both keys exist for the same N, including when the WH51 value is invalid (WH52 is skipped, not a second reading). soil_ec_tempN and soil_ecN are not EcoWittRouterMetric values, so they are not mapped.
tried_and_rejected: widening EcoWittRouterMetric for soil temp and EC. Those names exist on other ingest paths, not on this router.
commands: bunx vitest run src/test/ecowitt-wh52-soil-moisture-routing.test.ts src/test/ecowitt-channel-tent-router.test.ts --reporter=dot
files_touched: supabase/functions/_shared/ecowittChannelTentRouter.ts; src/test/ecowitt-wh52-soil-moisture-routing.test.ts; this file
files_remaining: none for the mapping
blockers: none
open_questions: none on this branch. #3091's pin test src/test/ecowitt-wh52-soil-ec-namespace.test.ts is flipped in #3091 after #3093 merges and #3091 is rebased onto that tree.
gotchas: src/lib/ecowittChannelTentRouter.ts re-exports the _shared file. Do not edit supabase/functions/_shared/lib (generated mirror).
links: https://github.com/Verdant-OS/verdant-grow-diary/issues/3090
artifacts: none
reviewer_seat: Seat A
reviewer_sha: 65902390fffa2aa6f79c6955daf65c2b46e72260
session_state: Seat A PASS with P2s; repair is docs and PR body. The extra channel/key-order coverage was not added because src/test/ecowitt-wh52-soil-moisture-routing.test.ts is a locked scorer.
claimed_by: Cursor Grok, 2026-11-25
owner: Cursor Grok
last_updated: 2026-11-24 20:10 CT, by Cursor Grok
```
