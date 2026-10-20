# Dashboard Canonical Tent VPD

**Status:** Specification only. Nothing here is built yet.
**Date:** 2026-10-20
**Issue:** VER-189 / GitHub #2166 (Dashboard shows VPD three ways at once)
**Measured on:** deploy branch `verdant-grow-diary` at `be03e2657` (#2271)
**Builds on:** [`vpd-measurement-trust-contract.md`](vpd-measurement-trust-contract.md). This spec does not
change that contract's evidence rules.

## Owner decisions

Both decisions are Matthew Cheek's, recorded 2026-10-20.

1. **One canonical Dashboard VPD (option A).** Every Dashboard widget that shows a tent's current VPD shows the
   same value, source, capture time and provenance label. A widget with no usable VPD says it is unavailable.
   It never computes a value of its own. The existing truth guards stay as they are: no mixed-source pairs,
   stale handling, and pinned RH treated as invalid.
2. **Plant-level manual readings count.** A Quick Log temperature, RH or VPD reading logged against a plant
   counts toward its tent's current VPD, the same way the strip stability summary counts it today.

## The problem, measured in code

`established fact` (read at `be03e2657`): the Dashboard renders a tent's current VPD from four different
pipelines.

| Widget (test id)                                             | Source today                                                                                                                                                                 | Plant-level manuals |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Tonight tent card (`TonightTentHomeCard`)                    | `buildTonightTentMetrics` over `readingsByTent[homeTent]` and `useLatestSensorSnapshot(growId, [tentId])` (`Dashboard.tsx` ~332-355). Stored `vpd_kpa`, else temp+RH derived | Latest only (a)     |
| Tent strip chip (`dashboard-env-snapshot-metric-<tent>-vpd`) | `buildTentSnapshotView(tentRows)` (`dashboardEnvironmentSnapshotViewModel.ts`), stored rows only                                                                             | No                  |
| Latest Environment card, VPD row                             | `sensorState.snapshot.vpd` from `useLatestSensorSnapshot(growId, selectedTentIds)` (`Dashboard.tsx` ~1374), raw; unverified rows included                                    | Latest only (a)     |
| Stage-aware VPD card (`dashboard-stage-aware-vpd`)           | `dashboardHealthSnapshot.vpd` (live/manual-only filter of the same snapshot) through `classifyVpdAgainstStage` (`Dashboard.tsx` ~1654); shows `—` when filtered out          | Latest only (a)     |

(a) `established fact`: `useLatestSensorSnapshot` already reads tent-scoped diary rows, including a plant Quick
Log's `details.manual_sensor_snapshot` (converted by `snapshotFromManualSensorSnapshot`). Rows with a null or
foreign `tent_id` are dropped (`isDiaryRowInTentScope`). So a plant-level reading attributed to the tent can reach
these widgets, but only as the single newest diary snapshot, competing with stored rows. It never reaches them as
the full manual history the strip stability summary reads. The resolver's `manuals` input below is that full
history; the bounded snapshot path stays as one more candidate.

Two more VPD surfaces are history, not a current value: the 24-hour `EnvironmentRibbon` series and the 7-day
trend average/range (`trendsState`). The strip stability summary reads `quickLogManualsForTent(stripManuals.data,
tentId)`, which includes plant-level rows (`Dashboard.tsx` ~446-451).

`inference`, consistent with the QA reports on VER-189: one load can show "Missing" on the Tonight card (no
tent-level VPD and no derivable pair), a raw stored value with no target on the Latest Environment card, and
`—` on the stage card (snapshot filtered out by the healthy-cue fence). Each widget is honest about its own
input; they disagree because the inputs differ.

## Source of truth

One pure resolver decides a tent's current VPD. Every widget in the consumer table reads its result and does no
VPD selection or arithmetic of its own.

**Module:** new `src/lib/canonicalTentVpdRules.ts`. Pure: no React, no Supabase, no `Date.now()`; `now` is
injected.

**Logic:** move, do not rewrite, the VPD selection now in `src/lib/tonightTentHomeViewModel.ts`
(`calculatedVpdCandidate`, `compositeVpdSource`, `usableCandidate`, `newestFirst`, the #2268/#2271
newer-same-capture rule). The Tonight card already has the strictest guards on the deploy branch, so its
behaviour is the reference. `tonightTentHomeViewModel.ts` then calls the resolver for VPD and keeps its own
temperature and RH logic.

**Inputs** (one tent):

```ts
interface CanonicalTentVpdInput {
  tentId: string;
  /** Stored sensor rows for this tent: readingsByTent[tentId], through selectDashboardSensorEvidenceRows. */
  rows: ReadonlyArray<TonightSensorRow>;
  rowsRead: { status: TonightRowsReadStatus };
  /** Tent-scoped diary-inclusive snapshot: useLatestSensorSnapshot(growId, [tentId]). */
  snapshot: TonightSnapshotInput;
  /** Quick Log manual readings for this tent, tent-level and plant-level: quickLogManualsForTent(stripManuals.data, tentId). */
  manuals: ReadonlyArray<QuickLogManualReading>;
  manualsRead: ManualHistoryReadState;
  now: Date;
}
```

The `manuals` input is the change in behaviour that decision 2 requires. A plant-level manual reading becomes a
candidate on the same footing as a tent-level one.

**`QuickLogManualReading` is a new projection, not today's `SensorReading`.** `established fact`: the current
manual series projection (`sensorsQuickLogManualSeriesRules.ts` ~74-114) returns `SensorReading` objects with no
originating record id and no `plant_id`, and its diary query does not select `plant_id`. The resolver needs both,
for the tie-break and for `evidenceRef`:

```ts
interface QuickLogManualReading {
  /** The diary entry or grow event id that holds the reading. */
  id: string;
  tentId: string;
  /** Null for a tent-level reading. */
  plantId: string | null;
  capturedAt: string;
  tempC: number | null;
  rh: number | null;
  vpdKpa: number | null;
}
```

The build adds this as a second projection beside the existing one, and adds `plant_id` and the id to the query
behind `useSensorsQuickLogManualReadings`. The existing `SensorReading` projection and its consumers (the chart,
the strip stability summary) stay byte-for-byte as they are.

**Pairing rules, stated against today's code.**

- **Manual readings: same record only, a new rule.** A manual reading's temperature and RH may form a derived
  pair only with each other. They never pair with a value from a different manual reading or a sensor row.
  Nothing in the resolver does that today, because manual readings are a new input.
- **Sensor rows: unchanged.** Sensor rows hold one metric per row, so "one record" cannot apply to them.
  `calculatedVpdCandidate` (`tonightTentHomeViewModel.ts` ~283-313) pairs the newest usable temperature row with
  the newest usable RH row when their sources are compatible (`compositeVpdSource`). It ages the pair to `stale`
  by its older input, and `tonight-tent-home-calculated-vpd-truth.test.tsx` ~84-95 expects that. The move keeps
  this behaviour and that test as they are.
- **Across the two input kinds:** never. A manual temperature does not pair with a sensor RH, or the reverse.

**Output:**

```ts
interface CanonicalTentVpd {
  state: "value" | "invalid" | "unavailable" | "loading";
  /** kPa. Null unless state is "value". */
  value: number | null;
  /** Canonical vocabulary: live | manual | csv | demo | stale | invalid. Null unless a reading exists. */
  source: SensorSource | null;
  sourceLabel: string | null;
  capturedAt: string | null;
  /** "stored" = a recorded vpd_kpa; "air_estimate" = derived from temperature and RH under the pairing rules. */
  basis: "stored" | "air_estimate" | null;
  /** Why there is no value, for the one unavailable copy line. */
  unavailableReason: "no_reading" | "no_derivable_pair" | "read_failed" | null;
  /** Record that produced the value: a sensor row id, a diary id, or a manual reading id. */
  evidenceRef: string | null;
  /** True when the latest read of any input failed and the value comes from earlier, cached data. */
  refreshFailed: boolean;
}
```

`loading` is only for a first read that has not returned. A failed read with no data is `unavailable` with
reason `read_failed`, never "no reading".

**Refresh failure with cached data: a deliberate change from the Tonight card.** Today `buildTonightTentMetrics`
treats `refresh_error` like `error` and empties the stored rows (`tonightTentHomeViewModel.ts:374`). The resolver
instead keeps the last successfully read rows and manual readings that the caller still holds: React Query keeps
`data` when a refetch fails. It picks among them with the same guards, returns that value with
`refreshFailed: true`, and every consumer shows the value with the existing "Sensor refresh unavailable — last
loaded readings shown." line. Live readings in that cached set still age to `stale` against `now`. `error` with
no cached data stays `read_failed`.

**The snapshot hook needs the same treatment.** `established fact`: `useLatestSensorSnapshot`
(~255-260) returns `status: "unavailable"` with `EMPTY_SNAPSHOT` whenever the query errors, even if React Query
still holds the earlier `data`. A value that came only from a diary snapshot would therefore vanish on a failed
refresh. The build adds an opt-in option to that hook, `keepDataOnRefreshError`. With it set, an error that still
has `data` returns `status: "refresh_error"` and that snapshot. Only the canonical resolver's callers pass it.
Every other consumer of the hook keeps today's behaviour, and its existing tests stay unchanged.

## Consumers

| Widget                     | Reads                                                     | Shows                                                                                         |
| -------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Tonight tent card          | resolver for `homeTent`                                   | value, source label, age, "Calculated from temperature and RH" when `basis` is `air_estimate` |
| Tent strip VPD chip        | resolver for each strip tent                              | same value, label and age as the Tonight card for that tent                                   |
| Latest Environment card    | resolver for the tent chosen by the selection rule below  | same value and label. With several tents selected it names which tent the value belongs to    |
| Stage-aware VPD card       | resolver for the same tent as the Latest Environment card | same value. Stage classification only when the trust contract allows it (below)               |
| Target Comparison, VPD row | resolver for the same tent as the Latest Environment card | same value. A target claim only under the same two fences as the stage card                   |

The Target Comparison card (`Dashboard.tsx` ~1566-1635, `compareSnapshotToTargets`) renders a VPD row read
straight from the snapshot. Its temperature and RH rows are unchanged. The separate alert-persistence input built
from that snapshot is unchanged too.

The card's whole comparison is rebuilt, not only its VPD row. Otherwise `result.status`, `headline` and `reasons`
would still come from the snapshot's VPD while the row shows the canonical value. The build calls
`compareSnapshotToTargets` with a copy of the snapshot in which `vpd` is replaced:

- **Eligible canonical value** (`state: "value"`, `source` `live` or `manual`, `basis` `stored`): `vpd` is the
  canonical value, so the status, headline and reasons judge the same VPD the row shows.
- **Any other result** (context-only source, `air_estimate`, invalid or unavailable): `vpd` is `null`, so VPD
  adds nothing to the aggregate status, headline or reasons. The VPD row still shows the canonical value or the
  unavailable line, with "no target claim" and its source label.

### Choosing the tent for the multi-tent cards

`established fact`: `snapshot.tent_id` is null whenever the newest contributing rows disagree on a tent
(`sensorSnapshot.ts` ~353-368), and a reading that exists only as a Quick Log environment event or manual history
can leave the snapshot empty. So the Latest Environment, stage and Target Comparison cards do not key on
`snapshot.tent_id`. They use this deterministic rule over the selected tents:

1. One tent selected: that tent's resolver result, whatever its state.
2. Several tents selected: compute the resolver result for each selected tent. Among results whose `state` is
   `value`, pick the newest `capturedAt`. Break ties by the tent's position in the Dashboard tent list, then by
   tent id, ascending. The card names the chosen tent.
3. No selected tent has a value: apply this precedence, first match wins:
   1. Any selected tent is `loading`: show `loading`. The read has not finished, so nothing is known to be
      absent yet.
   2. Any selected tent is `invalid`: show invalid for that tent and name it. If several are invalid, use the
      tie-break from step 2. It never renders as healthy and is never reported as absent.
   3. Otherwise show one unavailable line: `read_failed` if any selected tent's read failed with no cached data,
      else `no_derivable_pair` if any tent has that reason, else `no_reading`.

Out of scope and unchanged: the ribbon and chart series, the 7-day trend average and range, the strip stability
summary (it already counts plant-level rows), the Tents list, Tent Detail, `/sensors`, alerts and AI Doctor.
Those are history or other pages. A follow-up can point them at the resolver.

### Stage classification

The stage-aware card keeps calling `classifyVpdAgainstStage`, behind two guards. Both must pass before any
in-target or out-of-target claim:

1. **Source fence, kept from today.** Only `source` `live` or `manual` may be classified. That is the rule in
   `isDashboardSnapshotEligibleForHealthyCues` (`dashboardSensorEvidenceRules.ts`), applied to the resolver
   result instead of the snapshot. `csv`, `demo`, `stale` and `invalid` values are shown with their source label
   and "context only, no target claim", never classified.
2. **Basis fence, from the trust contract (VPD-02).** A value whose `basis` is `air_estimate` is never
   classified. It shows the value, "Calculated from temperature and RH", and "no target claim from an estimate".

A `stored` live or manual value is classified as it is today. This spec does not tighten that further; that
waits for the trust contract's deferred calibration slice.

### One unavailable state

Replace "Missing", "VPD —" and "— kPa" for a current VPD with one pinned copy line, in a new
`src/constants/dashboardVpdCopy.ts`:

| Reason              | Copy                                                      |
| ------------------- | --------------------------------------------------------- |
| `no_reading`        | "VPD unavailable: no reading for this tent yet."          |
| `no_derivable_pair` | "VPD unavailable: needs a temperature and an RH reading." |
| `read_failed`       | "VPD unavailable: sensor data didn't load."               |

`invalid` (pinned RH, out-of-range input) keeps its existing invalid treatment and never renders as healthy.

## Guards that must survive the move

Each one exists in `tonightTentHomeViewModel.ts` at `be03e2657` and has tests. The move keeps them all.

- A derived VPD uses only inputs whose own source is proven (`snapshotMetricSourceProven`). Sensor-row pairs
  must have compatible sources (`compositeVpdSource`). The pairing rules above set what may pair with what.
- Pinned RH (0% or 100%) makes the derived value invalid (`rhIsPinned`).
- Readings more than 60 s in the future are dropped (`FUTURE_SKEW_MS`).
- Live readings past `LIVE_CURRENT_STATE_STALE_MS` become `stale`, still shown, never healthy.
- Unknown sources become `invalid` and are never shown as a value.
- A same-capture temperature and RH pair newer than every stored VPD replaces the stored VPD (#2268, #2271).
- Ties break deterministically: sensor row before snapshot, then the plant-level rule below.

New guard for plant-level readings: when a tent-level and a plant-level reading carry the same capture time, the
tent-level reading wins. Two plant-level readings with the same time sort by reading id, ascending.

## File-level plan

| File                                                  | Change                                                                |
| ----------------------------------------------------- | --------------------------------------------------------------------- |
| `src/lib/canonicalTentVpdRules.ts` (new)              | Resolver, moved from the Tonight view model, plus the `manuals` input |
| `src/lib/tonightTentHomeViewModel.ts`                 | VPD reads the resolver; temperature and RH unchanged                  |
| `src/lib/dashboardEnvironmentSnapshotViewModel.ts`    | `buildTentSnapshotView` takes the resolver result for VPD             |
| `src/pages/Dashboard.tsx`                             | Build one resolver result per tent and pass it to each consumer       |
| `src/lib/sensorsQuickLogManualSeriesRules.ts`         | Add the `QuickLogManualReading` projection; existing one unchanged    |
| `src/hooks/useSensorsQuickLogManualReadings.ts`       | Select the record id and `plant_id` for the new projection            |
| `src/hooks/useLatestSensorSnapshot.ts`                | Opt-in `keepDataOnRefreshError`; default behaviour unchanged          |
| `src/constants/dashboardVpdCopy.ts` (new)             | The three unavailable lines and the estimate line                     |
| `src/test/canonical-tent-vpd-rules.test.ts` (new)     | Resolver unit tests                                                   |
| `src/test/dashboard-vpd-single-source.test.tsx` (new) | Renders `Dashboard` and compares every VPD widget                     |

No schema, RLS, migration, edge function, Action Queue or dependency change. Existing tests that pin the old
"Missing" or `—` strings are renegotiated in the same commit as the behaviour change, each named in the PR body.

## Acceptance tests

Each test is shown failing on the deploy branch before the build, with the count in the PR body.

| ID      | Given                                                                                                              | Then                                                                                                                                                                                 |
| ------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CVP-01  | One tent; older tent-level stored VPD; newer plant-level manual temp and RH                                        | Tonight card, strip chip, Latest Environment and stage card show the same derived value and time                                                                                     |
| CVP-02  | One tent; tent-level manual temp and RH only, no stored VPD                                                        | All four show the same derived value, labelled "Calculated from temperature and RH"                                                                                                  |
| CVP-03  | One tent; no reading at all                                                                                        | All four show the one `no_reading` line; no "Missing", `—` or a value anywhere                                                                                                       |
| CVP-04  | Newer temperature and RH without VPD after an older stored VPD (#2268 case)                                        | Card, strip and ribbon's latest point agree                                                                                                                                          |
| CVP-05  | RH pinned at 100%                                                                                                  | All four show invalid; none shows a healthy cue                                                                                                                                      |
| CVP-06  | Manual temperature in one reading, manual RH in a different reading (or a manual temperature with a sensor RH)     | No derived value from that pair; `no_derivable_pair` when nothing else qualifies                                                                                                     |
| CVP-06b | Sensor temperature row and sensor RH row, compatible sources, different capture times                              | Unchanged from today: derived value, aged by the older input (existing test ~84-95 stays green)                                                                                      |
| CVP-07  | Derived value inside the stage band                                                                                | Stage card shows the value but no in-target claim                                                                                                                                    |
| CVP-08  | Two tents selected, newest reading in tent B                                                                       | Latest Environment names tent B and matches tent B's strip chip                                                                                                                      |
| CVP-09  | Sensor read fails with no earlier data                                                                             | `read_failed` line, not `no_reading`                                                                                                                                                 |
| CVP-10  | Same input rendered twice with the same `now`                                                                      | Identical output (deterministic)                                                                                                                                                     |
| CVP-11  | A value loaded, then the next refresh fails (`refresh_error`)                                                      | All four keep that value with `refreshFailed`, show the refresh line; a live value still ages to stale                                                                               |
| CVP-12  | Newest value is a stored `csv`, `demo` or `stale` VPD inside the stage band                                        | Stage card shows the value and source label, no in-target or out-of-target claim                                                                                                     |
| CVP-13  | Value came only from a diary snapshot, then the snapshot query errors                                              | The value stays with `refreshFailed`; other `useLatestSensorSnapshot` consumers unchanged                                                                                            |
| CVP-14  | Two tents selected: empty snapshot, manual-only data, or equal-time readings in both                               | Selection rule picks deterministically, names the tent; Target Comparison VPD matches it                                                                                             |
| CVP-15  | Plant-level reading with the same `capturedAt` as a tent-level one                                                 | Tent-level wins; `evidenceRef` names its record id                                                                                                                                   |
| CVP-16  | Two tents selected, no value: one tent `loading`, the other `invalid`; then both settled, one `invalid`            | Shows `loading` first; after settling, shows invalid naming the tent, never `no_reading`                                                                                             |
| CVP-17  | Snapshot VPD differs from the canonical VPD; then the canonical value is `air_estimate`, then a stored `csv` value | Target Comparison status, headline and reasons follow the canonical value in the first case; VPD adds nothing to the aggregate in the other two, and the row shows "no target claim" |

Production check after a release, on the disposable QA account only (never the KEEP account or a customer):
repeat the VER-189 repro (manual temperature and RH for the only tent, then plant-level) and confirm one VPD
value and state on the Dashboard. Before live `/version.json` reports the build, that check is `NOT_MEASURED`.

## Review route

The build touches `.tsx` product files, so Blue Dream holds acceptance, with Codex eligible if it did not build
it. Whoever writes this spec cannot give the acceptance PASS.

## Known unknowns

- `missing evidence`: whether plant-level Quick Log readings carry `vpd_kpa` or only temperature and RH in
  production data. The resolver handles both; the QA walk should log which one it saw.
- `uncertainty`: the literal "UNKNOWN" in the original report is not a string in Dashboard code at
  `be03e2657`. It is probably a status token rendered in upper case. CVP-03 covers it either way.
- `missing evidence`: open draft #2186 adds VPD snapshot agreement tests for #2148. It does not overlap these
  files, but its assertions should be re-run once this lands.
