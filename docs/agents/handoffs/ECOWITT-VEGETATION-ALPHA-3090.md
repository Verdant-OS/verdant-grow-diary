```text
TASK ECOWITT-VEGETATION-ALPHA-3090  priority: other  status: OPEN
goal: Setup PR for forwarding the EcoWitt gateway to tent 78f51773-c576-4891-a9aa-240ed532337a. No production writes.
why: Issue #3090 replaces the Nov 6 Flower-only target eec6f7b3-b745-44ad-bab2-ed4ad79f88f5.
branch: cursor/ecowitt-vegetation-alpha-forward-c184
base: verdant-grow-diary
checkout: git fetch origin cursor/ecowitt-vegetation-alpha-forward-c184 verdant-grow-diary && git switch cursor/ecowitt-vegetation-alpha-forward-c184
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/3091 (non-draft; Matthew marked it ready)
head_sha: the commit on this branch that contains this handoff update; confirm with git rev-parse HEAD
state: pushed, ready for review, not merged
current_step: review fixes so rejected passkeys never enter Error.message, shell history, or a committed 32-hex fixture
next_action: merge #3093 first, then this PR; Matthew still runs config, claim mint, and the gateway himself
post_merge_check: after #3093 and this PR are live, a Soil Alpha soil_ec_hum1 packet stores soil_moisture_pct on 78f51773 and not on Flower eec6f7b3. NOT_MEASURED until Matthew runs that step.
active_writer: cursor cloud agent on cursor/ecowitt-vegetation-alpha-forward-c184
decisions: Gateway path uses create_ecowitt_custom_upload_claim, not mint-bridge-token. ecowitt.net on 2026-11-24 read Vegetation Alpha air as CH5 (ch_temp_humidity5) and Soil Alpha as WH52 CH1 (ch_soil_ec1). #3093 merges first and maps soil_ec_humN. This PR drops the old "WH52 dropped" test so the two can combine. Passkey must be 32 hex, is lowercased before ewfp_, and is never an argv flag (`--passkey` or `--passkey=`). A rejected passkey throws the fixed message "Passkey rejected." with no input interpolation. The runbook reads it with ECOWITT_PASSKEY="$(cat)". Tests build the fixture at runtime.
tried_and_rejected: Hardcoding Nov 2 or Nov 6 channel numbers. Minting a vbt_ token for the ew/ path. Keeping src/test/ecowitt-wh52-soil-ec-namespace.test.ts, which pinned soil_ec_hum1 as dropped and would fail at the empty-groups assertion once #3093 lands. Mapping coverage lives in #3093 src/test/ecowitt-wh52-soil-moisture-routing.test.ts.
commands: bunx vitest run src/test/ecowitt-vegetation-alpha-forward.test.ts --reporter=dot
files_touched: src/lib/ecowittVegetationAlphaForwardRules.ts, scripts/prepare-ecowitt-vegetation-alpha-forward.ts, src/test/ecowitt-vegetation-alpha-forward.test.ts, docs/runbooks/ecowitt-vegetation-alpha-78f51773-forward.md, docs/agents/handoffs/ECOWITT-VEGETATION-ALPHA-3090.md. Removed src/test/ecowitt-wh52-soil-ec-namespace.test.ts.
files_remaining: none in this PR; do not edit #3093
blockers: production config, token, and device stay with Matthew. Soil moisture rows appear only after #3093 has merged.
open_questions: public ingest hostname shown on the station card at apply time
gotchas: a second tent is also named Vegetation Alpha; use the UUID only. soil_ec_hum1 is not soilmoisture1.
links: https://github.com/Verdant-OS/verdant-grow-diary/issues/3090 https://github.com/Verdant-OS/verdant-grow-diary/pull/3091 https://github.com/Verdant-OS/verdant-grow-diary/pull/3093
artifacts: docs/runbooks/ecowitt-vegetation-alpha-78f51773-forward.md
reviewer_seat: Seat A FAIL and Seat C FAIL at 06432e8edf82b57a0cd4fc9cb90912a541df6a3e (passkey in Error.message, heredoc history, gitleaks on the fixture)
reviewer_sha: 06432e8edf82b57a0cd4fc9cb90912a541df6a3e
session_state: non-draft PR #3091; Matthew approves config, token, and device one at a time; #3093 merges first
claimed_by: cursor cloud agent, 2026-11-24
owner: Matthew (production steps); repository branch held by this writer
last_updated: 2026-11-24 20:30 CT, by cursor cloud agent
```
