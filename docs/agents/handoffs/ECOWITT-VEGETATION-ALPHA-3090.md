```text
TASK ECOWITT-VEGETATION-ALPHA-3090  priority: other  status: OPEN
goal: Draft setup for forwarding the EcoWitt gateway to tent 78f51773-c576-4891-a9aa-240ed532337a. No production writes.
why: Issue #3090 replaces the Nov 6 Flower-only target eec6f7b3-b745-44ad-bab2-ed4ad79f88f5. Channel numbers are unconfirmed.
branch: cursor/ecowitt-vegetation-alpha-forward-c184
base: verdant-grow-diary
checkout: git fetch origin cursor/ecowitt-vegetation-alpha-forward-c184 verdant-grow-diary && git switch cursor/ecowitt-vegetation-alpha-forward-c184
pr: NOT_MEASURED until the draft PR exists
head_sha: local until pushed
state: local only
current_step: script, tests, and runbook
next_action: Matthew confirms Vegetation Alpha and Soil Alpha channel numbers from WS View, then runs the script and applies SQL himself
post_merge_check: NOT_APPLICABLE until Matthew runs a step; the doc does not ship behavior by itself
active_writer: cursor cloud agent on cursor/ecowitt-vegetation-alpha-forward-c184
decisions: Gateway customized upload uses create_ecowitt_custom_upload_claim, not mint-bridge-token. Channels have no defaults. Public hostname stays <PUBLIC_INGEST_HOST>.
tried_and_rejected: Hardcoding Nov 2 or Nov 6 channel numbers. Minting a vbt_ token for the ew/ path.
commands: bunx vitest run src/test/ecowitt-vegetation-alpha-forward.test.ts --reporter=dot
files_touched: src/lib/ecowittVegetationAlphaForwardRules.ts, scripts/prepare-ecowitt-vegetation-alpha-forward.ts, src/test/ecowitt-vegetation-alpha-forward.test.ts, docs/runbooks/ecowitt-vegetation-alpha-78f51773-forward.md, docs/agents/handoffs/ECOWITT-VEGETATION-ALPHA-3090.md
files_remaining: none in repo; production steps stay with Matthew
blockers: channel numbers unconfirmed; no production write, token mint, or device change is authorized
open_questions: public ingest hostname shown on the station card at apply time
gotchas: a second tent is also named Vegetation Alpha; use the UUID only
links: https://github.com/Verdant-OS/verdant-grow-diary/issues/3090
artifacts: docs/runbooks/ecowitt-vegetation-alpha-78f51773-forward.md
reviewer_seat:
reviewer_sha:
session_state: draft PR; Matthew approves config, token, and device one at a time
claimed_by: cursor cloud agent, 2026-11-24
owner: Matthew (production steps); repository draft held by this branch writer
last_updated: 2026-11-24 14:30 CT, by cursor cloud agent
```
