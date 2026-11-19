# CALIBRATION-404-FREE-GATE-20261119

```text
TASK CALIBRATION-404-FREE-GATE-20261119  priority: P2  status: OPEN
goal: a new Free grower with no soil moisture sensor opens a plant or tent page and gets no soil_moisture_calibrations request (so no 404 and no console error) and no "Calibration records are unavailable" notice. Growers with soil readings and saved calibrations keep seeing them applied.
why: QA on prod 679e8f51b17a (2026-11-19) and issues #2009 / #2699: every plant and tent page load made a request to soil_moisture_calibrations, which 404s (PGRST205) on prod, and the dryback strip showed the unavailable notice to growers who have no soil sensor at all.
diagnosis: (a) the migration exists and is not applied on prod. supabase/migrations/20260619083000_add_soil_moisture_calibration_v1.sql:5 creates the table; 20260728090000_production_schema_reconciliation.sql reconciles it; docs/agents/CURRENT_STATE_ARCHIVE.md:7230-7231 records 20260728090000 absent on prod. Not (b). Not (c) in the entitlement sense: the table is not tier-gated; the lookup simply ran for tents with no soil readings (src/components/DrybackMonitoringStrip.tsx called useSoilMoistureCalibrations unconditionally).
fix: client only. useSoilMoistureCalibrations takes an optional `enabled` (default true). DrybackMonitoringStrip passes enabled only when the tent's sensor rows include a soil moisture reading (new pure helper hasDrybackSoilMoistureReadings in src/lib/drybackMonitoringRules.ts). No migration, schema, RLS, edge or auth change.
branch: claude/project-thread-7ywbpp
base: verdant-grow-diary at 679e8f51b17a
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/3029 (draft). Commits: fec519bf4eda3a2af87100ab0229bd14c4c1ba16 (tests only, RED), d4dc80809c2cc4945b71d68e1e9a54c7768497d9 (fix), then a Codex P2 follow-up (test-only commit, then fix commit) that this entry cannot name. The current full head SHA and last reviewed SHA are in the PR body
state: pushed; draft PR open; 35/35 required checks were green at d4dc808; Codex P2 follow-ups pushed after that
next_action: (1) 35/35 required checks at the PR head; (2) one independent exact-head review by a session that did not write this (OWNERSHIP.md section 4.3); (3) Matthew's per-item yes naming the PR and SHA, then the Merge Steward queues it.
post_merge_check: once live /version.json reports the merged SHA, a fresh Free account with no soil sensor opens the plant page and the tent page: zero requests to rest/v1/soil_moisture_calibrations, no 404 in the console, no "Calibration records are unavailable" text.
decisions: (1) Gate on soil readings rather than on plan tier: calibration is meaningful only for soil moisture, and a paid grower without a soil probe has the same need. (2) Keep the unavailable notice for growers who do have soil readings while the table is missing on prod, because hiding it would present raw soil moisture without saying calibration status is unknown. (3) Sensors page left unchanged: its calibration capture card is meant to work before any soil reading exists, and the brief scoped plant and tent pages.
not_in_scope: applying the pending migration to prod (Matthew only); live-sensor-entitlement 403s from #2699; Sensors page lookup; calibration UI redesign; paid sensor features.
tests: new src/test/dryback-calibration-soil-gate.test.tsx (helper, hook enabled=false makes no request, PGRST205 404 degrades to schema_unavailable with no error, strip no-soil gate, regression: saved calibrations still applied, soil readings + missing table still shows the honest notice). RED proof: pushed test-only first, see PR body.
commands: bunx vitest run src/test/dryback-calibration-soil-gate.test.tsx src/test/dryback-calibration-schema-availability.test.tsx src/test/soil-moisture-calibration-schema-session-cache.test.tsx --reporter=dot ; bun run typecheck ; node scripts/scorer-lock.mjs --report --strict
files_touched: src/lib/drybackMonitoringRules.ts; src/hooks/useSoilMoistureCalibrations.ts; src/components/DrybackMonitoringStrip.tsx; src/test/dryback-calibration-soil-gate.test.tsx; this file
files_remaining: none for this slice
gotchas: `bun install --frozen-lockfile` 403s on the lovable-core-prod mirror in this cloud box, so local vitest, typecheck, lint and build are BLOCKED here; CI is the evidence. Do not regenerate bun.lock.
blockers: local test/typecheck/lint/build BLOCKED as above.
reviewer_seat: any eligible session that did not author or repair this change
reviewer_sha: none yet
session_state: no routines, no paused workflows. Pending human decisions: Matthew's merge yes after review; whether and when to apply the calibration migration to prod.
claimed_by: Claude thread session (calibration 404), 2026-11-19 10:30 UTC
owner: Claude thread session (calibration 404). The brief names "Sour Tangie (Sensors)" as workstream owner; that name is not in docs/agents/constitution/roster.md, so it is recorded here as the brief's label only, not a roster seat
last_updated: 2026-11-19 10:30 UTC, by Claude thread session (calibration 404)
```
