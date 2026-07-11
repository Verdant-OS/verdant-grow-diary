# Post-Action Outcome Analysis Engine — V1

**Purpose.** Deterministically compare conditions before and after a
completed Action Queue item and produce a cautious learning receipt
that answers: what changed before the action, what changed after, did
the available evidence improve/decline/stay unclear, does the system
evidence agree with the grower-reported follow-up, what is still
missing, and what should be repeated or avoided next run.

The engine **never replaces the grower's reported outcome**. It shows
two distinct concepts — the grower-reported outcome and the
system-observed evidence comparison — and when they disagree it flags
the disagreement for more evidence rather than deciding the grower is
wrong.

## Modules

| Concern                                            | File                                       |
| -------------------------------------------------- | ------------------------------------------ |
| Shared types                                       | `src/lib/actionOutcomeAnalysisTypes.ts`    |
| Pre/post windows                                   | `src/lib/actionOutcomeWindowRules.ts`      |
| Sensor + diary normalization                       | `src/lib/actionOutcomeEvidenceRules.ts`    |
| Rows → evidence bundle → receipt                   | `src/lib/actionOutcomeEvidenceCompiler.ts` |
| Comparison / classification / agreement / guidance | `src/lib/actionOutcomeAnalysisEngine.ts`   |
| Confidence model                                   | `src/lib/actionOutcomeConfidenceRules.ts`  |
| Receipt serializer + compact summary               | `src/lib/actionOutcomeReceipt.ts`          |
| Report view model (no React)                       | `src/lib/actionOutcomeReportViewModel.ts`  |
| Read-only authenticated wrapper                    | `src/lib/actionOutcomeAnalysisService.ts`  |

All analysis logic is pure: no I/O, no clock reads (`analysisAt` is
injected), no randomness, no AI/LLM calls. The wrapper only collects
rows via the authenticated client (RLS is the boundary) and passes them
to the pure functions; it never writes.

## Evidence model (audited contracts)

| Evidence type     | Table/model                                                 | Timestamp field                                                                  | Source field         | Plant/tent scope                      | Safe for engine?                                                               |
| ----------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------- | ------------------------------------- | ------------------------------------------------------------------------------ |
| Completed action  | `action_queue`                                              | `completed_at` (nullable — **no CHECK ties it to status**; null blocks analysis) | `source`             | `grow_id` + `tent_id?` + `plant_id?`  | yes (verified-completed only)                                                  |
| Grower follow-up  | `diary_entries` with `details.event_type="action_followup"` | `details.observed_at`                                                            | grower-entered       | copied from action                    | yes (primary = earliest lexicographic id, mirroring the product's pickPrimary) |
| Sensor reading    | `sensor_readings` (long format: one row per tent/metric/ts) | `captured_at`                                                                    | `source` + `quality` | **tent only** (no plant/grow columns) | yes with source/quality gates                                                  |
| Diary/operational | `grow_events` (+ subtype tables)                            | `occurred_at`                                                                    | `source`             | `grow_id` + `tent_id?` + `plant_id?`  | context only, never sensor facts                                               |
| Grow targets      | `grow_targets` (1:1 with grow)                              | n/a                                                                              | n/a                  | `grow_id`                             | yes (bands)                                                                    |

Metric mapping (repo metric → engine slot): `temperature_c` →
`temperature_f` (converted via `temperatureUnits`), `humidity_pct`,
`vpd_kpa`, `soil_moisture_pct`, `ec` → `soil_ec` (canonical mS/cm via
`ecUnits`), `co2_ppm`, `ppfd`, `ph` → `reservoir_ph`. `reservoir_ec`
has no repo metric in V1 and is never fabricated; `soil_temp_c` has no
V1 slot (known limitation). Grow-target temps are stored in °C
(`temp_min`/`temp_max`) and are converted to °F for the engine band.

## Pre/post windows

Centralized constants (`actionOutcomeWindowRules.ts`):

- Pre-action window: **24 h** before `completed_at` (inclusive start,
  exclusive end — completion itself belongs to the post window).
- Post-action window: from `completed_at` until the follow-up
  `observed_at` when present, else the injected `analysisAt`; capped at
  **72 h**; inclusive on both ends (the follow-up snapshot counts).
- Post windows shorter than **2 h** are marked insufficient — a
  10-minute window is never treated as meaningful recovery evidence.
- Future-dated actions and future evidence are rejected; unparseable
  timestamps are excluded; pure logic never reads the clock.

## Source treatment

| Source                                                   | Treatment                                                   |
| -------------------------------------------------------- | ----------------------------------------------------------- |
| `live`                                                   | usable when quality is not stale/invalid                    |
| `manual`                                                 | usable, stays Manual, confidence capped                     |
| `csv`                                                    | usable, stays CSV (never relabeled Live), confidence capped |
| `demo`                                                   | never usable for real outcome classification                |
| `stale`                                                  | never usable as current recovery evidence                   |
| `invalid`                                                | unusable                                                    |
| unknown (incl. bridge labels not in `sensorSourceRules`) | unusable, fail closed                                       |

Additional gates: `quality` of `stale`/`invalid` excludes a row;
humidity or soil moisture stuck at exactly 0/100 is flagged and
excluded; pH outside 3.0–9.0 is flagged; EC > 50 is treated as µS/cm
and normalized through `ecUnits.toCanonicalMscm` (flagged); implausible
`temperature_c` (outside −10…60 °C — e.g. a °F value in a °C column) is
rejected; duplicates deduplicate deterministically on
(tent, source, metric, captured_at), mirroring the DB unique index.

## Metric tolerances

Centralized in `METRIC_TOLERANCES` (never inline in JSX):
temperature_f 1.5 °F · humidity_pct 3 % · vpd_kpa 0.1 kPa ·
soil_moisture_pct 5 % · soil_ec 0.2 mS/cm · co2_ppm 75 ppm · ppfd 50 ·
reservoir_ph 0.2 · reservoir_ec 0.2. Changes smaller than tolerance are
"unchanged" — tiny floating-point drift is never improvement.

## Classification rules

Per metric: deterministic aggregates (median/min/max/count/first/last),
then target-distance comparison when a band exists (improvement =
meaningfully closer to target; decline = meaningfully farther), else a
stability check (no target ⇒ direction is `not_comparable`; raw shifts
are not judged without a target).

Overall: no usable pre or post evidence, too-short post window, or no
comparable metrics ⇒ `insufficient_evidence`. Any **critical** decline
(temperature/humidity/VPD; root-zone metrics become critical only with
≥3 valid samples per window) blocks `improved`: with improvements
present it is `mixed`, alone it is `declined`. Improvements and
declines together ⇒ `mixed`; only-within-tolerance ⇒ `unchanged`.
Count alone is never authoritative — severity and metric relevance
outweigh it, and nutrient success is never inferred from
air-environment changes.

## Confidence caps

Score 0–100 (bands: 0–39 low, 40–69 medium, 70–100 high) built from
sample coverage, source quality, window duration, target availability,
metric agreement, follow-up availability, and missing-data penalties —
then hard caps applied last: demo-only **0** · no-follow-up +
short-window **40** · single pre+post pair **40** · invalid critical
telemetry **50** · CSV-only **65** · manual-only **70**. No randomness;
identical input always scores identically.

## Grower/system agreement

`agrees` / `partially_agrees` / `conflicts` / `not_comparable` /
`no_grower_outcome`, mapped from the grower's follow-up outcome
(`improved | unchanged | declined | too_soon | unclear` — the product's
`ACTION_FOLLOWUP_OUTCOMES`) against the system classification.
`too_soon`+`insufficient_evidence` agree. Conflict copy is respectful
("This is a flag for more evidence — not a judgment of the grower's
observation"); the grower outcome is never mutated or rewritten.

## Missing-evidence behavior

Missing follow-up, missing outcome selection, missing targets, empty
windows, short windows, missing tent context, and telemetry anomaly
flags are all reported in `missingInformation` (lexically sorted) and
each lowers confidence. Missing evidence is never filled in.

## Learning guidance

Rule-based copy only (no LLM): repeat suggestions require sufficient
evidence + `improved`; nutrient/irrigation/equipment actions are never
recommended for repetition from air-environment-only evidence;
mixed/insufficient evidence yields "Collect another follow-up
snapshot." / "Repeat under similar conditions before drawing a
conclusion." / "Do not make additional large changes yet.";
`avoidNextRun` stays empty unless a critical decline with non-low
confidence supports a caution. No equipment commands, no automation
language, no automatic execution.

## Machine receipt contract

`serializeActionOutcomeReceipt(receipt)` → 2-space JSON + trailing
newline (house style of `oneTentProofRecordExportRules`), stable
literal key order, lexically sorted prose arrays, `schemaVersion: "1"`,
no undefined values, no user IDs/tokens/signed URLs/raw payloads/
provider errors — the only ID is `actionQueueId`, which the existing
follow-up contract already exposes. Compact operator line:

```text
ACTION_OUTCOME_SUMMARY_JSON={"schema_version":"1","classification":...,
"confidence_score":...,"confidence_level":...,"evidence_agreement":...,
"metric_counts":{...},"missing_information_count":...}
```

## Safety boundaries

No fake live data · no blind automation · no device control · no
AI-generated certainty · no aggressive recommendations · no action
execution · no Action Queue status changes · no rewriting of
grower-entered outcomes · demo/stale/invalid/unknown telemetry never
healthy · manual stays Manual, CSV stays CSV · missing evidence lowers
confidence · one reading never proves causation · no writes anywhere in
the engine · no schema/RLS/migration/Edge changes.

## Known limitations

- `sensor_readings` is tent-scoped; plant-level attribution is not
  possible in V1 (tent readings apply to every plant in the tent).
- `soil_temp_c` has no engine slot; `reservoir_ec` has no repo metric.
- Bridge source labels (`pi_bridge`, `ecowitt`, `mqtt`, …) are not in
  the canonical source rule's alias table and therefore fail closed as
  unusable until upstream normalization labels them.
- `co2_ppm` has no grow-target column, so CO₂ can only ever be
  `unchanged`/`not_comparable` in V1.
- One run is never causal proof — the receipt says so explicitly.
