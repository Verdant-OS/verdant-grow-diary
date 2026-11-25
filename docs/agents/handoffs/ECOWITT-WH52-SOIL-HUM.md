```text
TASK ECOWITT-WH52-SOIL-HUM  priority: other  status: OPEN
goal: routeEcoWittPayloadToTents maps WH52 soil_ec_humN (N=1-8) to soil_moisture_pct for tents whose hardware_config.ecowitt.soil_channels includes N.
why: A WH52 probe publishes moisture as soil_ec_humN. The router only accepted soilmoisture1-8, so gateway Verdant / Soil Alpha on ch_soil_ec1 (31%) was dropped. Refs #3090. #3093 merges first. Before #3091 merges, #3091 drops or updates its pin test src/test/ecowitt-wh52-soil-ec-namespace.test.ts. This branch does not edit #3091.
branch: cursor/ecowitt-wh52-soil-ec-hum-6601
base: verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/3093
head_sha: parent 6e7d46c54bae8261e20afc581430a546b4023f31; this commit restores the locked routing test and adds the mutation file
state: pushed repair for Seat A P3 and Seat C P2/P3
current_step: mutation coverage lives in src/test/ecowitt-wh52-soil-moisture-mutations.test.ts
next_action: watch required CI at the new head and put the run links in the PR body
post_merge_check: a WH52 custom-upload fixture with soil_ec_hum1 and soil_channels [1] stores one soil_moisture_pct row. NOT_MEASURED until merge; local vitest is the pre-merge check.
active_writer: Cursor Grok cloud agent
decisions: soilmoistureN wins when both keys exist for the same N, including when the WH51 value is invalid (WH52 is skipped, not a second reading). soil_ec_tempN and soil_ecN are not EcoWittRouterMetric values, so they are not mapped.
tried_and_rejected: widening EcoWittRouterMetric for soil temp and EC. Those names exist on other ingest paths, not on this router.
commands: bunx vitest run src/test/ecowitt-wh52-soil-moisture-mutations.test.ts src/test/ecowitt-wh52-soil-moisture-routing.test.ts src/test/ecowitt-channel-tent-router.test.ts --reporter=dot
files_touched: supabase/functions/_shared/ecowittChannelTentRouter.ts; src/test/ecowitt-wh52-soil-moisture-mutations.test.ts; this file. src/test/ecowitt-wh52-soil-moisture-routing.test.ts stays byte-identical to 97444dcd757499a4714ebbe5be2362d0782a3beb.
files_remaining: none for the mapping
blockers: none
open_questions: none on this branch. #3093 merges first. #3091 then updates src/test/ecowitt-wh52-soil-ec-namespace.test.ts lines 52-71 in its own push.
gotchas: src/lib/ecowittChannelTentRouter.ts re-exports the _shared file. Do not edit supabase/functions/_shared/lib (generated mirror).
links: https://github.com/Verdant-OS/verdant-grow-diary/issues/3090
artifacts: none
reviewer_seat: Seat A
reviewer_sha: 65902390fffa2aa6f79c6955daf65c2b46e72260
session_state: Seat A P3 and Seat C P2/P3 repaired without editing the locked routing test. The P1 remains the owner gate on supabase/functions/_shared/ecowittChannelTentRouter.ts.
claimed_by: Cursor Grok, 2026-11-25
owner: Cursor Grok
last_updated: 2026-11-24 20:15 CT, by Cursor Grok
```
