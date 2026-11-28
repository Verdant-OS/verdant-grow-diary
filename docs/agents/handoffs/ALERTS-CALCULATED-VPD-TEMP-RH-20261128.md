# ALERTS-CALCULATED-VPD-TEMP-RH-20261128

```text
TASK ALERTS-CALCULATED-VPD-TEMP-RH-20261128  priority: P2  status: OPEN
goal: a manual temperature and RH reading with no stored VPD raises the VPD alert that the tent page already shows ("Above Veg VPD range").
why: issue #3124. QA on production, 2 of 2: about 1.46 and 1.49 kPa against the 0.8–1.2 kPa Veg range, and no alert. The alert path read VPD only from a stored vpd_kpa row, so buildDefaultThresholdAlerts and compareSnapshotToTargets skipped VPD on null. This breaks Sensor Snapshot -> Alert in the core loop.
fix: new pure src/lib/alertSnapshotDerivedVpdRules.ts. withCaptureDerivedVpd fills snapshot.vpd with calculateVpdKpa (the tent page's function) only when vpd is null and temperature and RH share one capture instant (per-metric refs, else ts), and marks vpd_origin "calculated_from_temp_rh". The two alert evaluation owners apply it before the checks: AlertsAutoPersistForGrow and Dashboard (persistence plus the Environment Alerts card). VPD alert reasons on both paths append CALCULATED_VPD_ALERT_NOTE. Titles and ids do not change, so dedupe does not change.
branch: posthog-self-driving/fixalerts-derive-vpd-from-temp-and-rh-9af655 (name fixed by the PostHog run)
base: verdant-grow-diary at ee105823343e87f365bbf0815f6511d45a3ad858
pr: draft from this branch; the PR body carries the head SHA
state: pushed draft
next_action: dispatch ci.yml on the branch (draft PRs skip it), then request one independent exact-head review.
post_merge_check: once live /version.json reports the merged SHA, signed in as the disposable fixture account on the fixture grow (Veg, no VPD target): log a manual temperature and RH that calculates above 1.2 kPa on Fixture Tent A, open /alerts, and expect one open "VPD above stage range" alert whose reason has the calculated-VPD note. NOT_MEASURED until then.
decisions: (1) Derive at the alert evaluation sites, not in snapshotFromReadings or compareSnapshotToTargets: both of those are mirrored into supabase/functions/_shared/lib (CURRENT_STATE gates Edge and supabase/ changes), and snapshotFromReadings also feeds display and AI Doctor surfaces. (2) No metric_refs.vpd is added: no sensor_readings row backs the value. (3) The Dashboard Target Comparison card still shows the stored VPD only (Unknown when none); it is a display card and the #3122 display work is separate.
tried_and_rejected: changing snapshotFromReadings (widens to every snapshot consumer and the edge mirror).
tests: src/test/alert-calculated-vpd-from-temp-rh.test.ts (new); src/test/dashboard-sensor-provenance-fence.test.ts (pin renegotiated: alerts read dashboardAlertSnapshot = withCaptureDerivedVpd(dashboardHealthSnapshot)).
red_green: RED with the derivation stubbed out: 2 failed, 3 passed. GREEN: 135 related files, 1805 tests pass; bun run typecheck clean; eslint clean on changed files; edge mirror check in sync; v0 operating loop contract 26 pass.
commands: bunx vitest run src/test/alert-calculated-vpd-from-temp-rh.test.ts src/test/dashboard-sensor-provenance-fence.test.ts --reporter=dot ; bun run typecheck ; node scripts/verify-edge-shared-in-sync.mjs --check-only
files_touched: src/lib/alertSnapshotDerivedVpdRules.ts; src/lib/defaultEnvironmentThresholds.ts; src/lib/environmentAlerts.ts; src/components/AlertsAutoPersistForGrow.tsx; src/pages/Dashboard.tsx; the two tests above; this file
files_remaining: none planned
not_in_scope: an alert-persisted analytics event (suggested next step); Quick Log merged snapshots stay alert-ineligible (alert_persistence_eligible false, unchanged); schema, RLS, auth, edge, migrations.
blockers: none in code
reviewer_seat: one eligible independent reviewer at the exact head (not this session)
reviewer_sha: none yet
session_state: PostHog self-driving cloud run; no routines, no paused workflows
claimed_by: Claude (PostHog self-driving run), 2026-11-28 15:30 UTC
owner: Claude (PostHog self-driving run)
last_updated: 2026-11-28 15:30 UTC, by Claude (holder)
```
