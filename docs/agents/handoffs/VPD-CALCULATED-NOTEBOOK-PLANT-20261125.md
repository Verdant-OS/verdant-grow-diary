# VPD-CALCULATED-NOTEBOOK-PLANT-20261125

```text
TASK VPD-CALCULATED-NOTEBOOK-PLANT-20261125  priority: P2  status: OPEN
goal: a Quick Log temperature and RH shows the same calculated VPD on the Dashboard field notebook card and on the plant page Current Environment panel as the Dashboard tent panel already shows.
why: QA on production (issue #3108, VER-513; VER-514): the card said VPD "Missing" and the plant panel said "Unknown" while the tent panel showed 1.31 kPa from the same reading. This breaks the #3069 rule that the card and the panel do not disagree.
root_cause: (1) Card: the panel's canonical VPD comes from the diary-inclusive snapshot, whose capture refs name a diary entry ("diary:<id>"). The Quick Log cohort rows carry synthetic "sensor:<ms>:manual" refs. Both sides are known and never match, so buildTentSnapshotView labels the VPD as another capture (ownCaptureVpdMetric) and fieldNotebookReadingSlotsRules drops every ok VPD with a status label. (2) Plant panel: buildPlantTentEnvironmentView showed only a stored vpd_kpa.
fix: client only. buildTentSnapshotView marks an own-capture VPD `cohortInstant` when it has the cohort's instant and source and the cohort is one capture; the card keeps such a VPD when it is ok. The panel output is unchanged. buildPlantTentEnvironmentView calculates VPD from the current cohort's temperature and RH when no VPD is stored (not when stale), with originLabel "Calculated from temperature and RH" (TENTS_LIST_VPD_ORIGIN_COPY), and PlantTentEnvironmentPanel shows that label under the value.
branch: posthog-self-driving/fixvpd-show-calculated-vpd-on-notebook-978e2d (name fixed by the PostHog run)
base: verdant-grow-diary at 19dd62a9e65d
pr: draft, opened from this branch; the PR body carries the head SHA
state: pushed draft
next_action: dispatch ci.yml on the branch (draft PRs skip it), then request one independent exact-head review.
post_merge_check: once live /version.json reports the merged SHA, read only, signed in as the disposable fixture account: after a Quick Log temperature and RH on Fixture Tent A, the notebook card VPD tile matches the tent panel VPD, and the plant page Current Environment VPD shows the same value with "Calculated from temperature and RH". NOT_MEASURED until then.
decisions: (1) Do not change sameCapture in buildTentSnapshotView: its identity rules carry many review decisions, and the panel already shows the right value. (2) The card keeps only an ok same-instant VPD; a stale or degraded own-capture VPD stays off the card as before. (3) The plant top tile (PlantStatusStrip) stays a freshness and source tile; adding a value there is a product call (#3109).
tried_and_rejected: treating Quick Log rows' refs as unknown by their "ql-manual:" id prefix; rejected as a fragile id-format coupling.
tests: src/test/field-notebook-reading-slots.test.ts; src/test/plant-detail-tent-environment.test.ts (pin "VPD Unknown with fresh temp/RH" renegotiated for VER-514)
red_green: RED before the fix: 4 failed (card VPD slot, plant calculated VPD x2, panel origin label). GREEN locally: 161 related files, 2559 tests pass; bun run typecheck clean; eslint clean on changed files.
commands: bunx vitest run src/test/field-notebook-reading-slots.test.ts src/test/plant-detail-tent-environment.test.ts --reporter=dot ; bun run typecheck ; bun run lint
files_touched: src/lib/dashboardEnvironmentSnapshotViewModel.ts; src/lib/fieldNotebookReadingSlotsRules.ts; src/lib/plantTentEnvironmentRules.ts; src/components/PlantTentEnvironmentPanel.tsx; the two tests above; this file
files_remaining: none planned
not_in_scope: the Environment strip mixing a CSV VPD with a manual pair (#3108 last item); plant top tile value (#3109); LatestSnapshotQuickLogMerge keeping an older diary ref after a manual win; schema, RLS, auth, edge, migrations.
blockers: none in code
reviewer_seat: one eligible independent reviewer at the exact head (not this session)
reviewer_sha: none yet
session_state: PostHog self-driving cloud run; no routines, no paused workflows
claimed_by: Claude (PostHog self-driving run), 2026-11-25 17:30 UTC
owner: Claude (PostHog self-driving run)
last_updated: 2026-11-25 17:30 UTC, by Claude (holder)
```
