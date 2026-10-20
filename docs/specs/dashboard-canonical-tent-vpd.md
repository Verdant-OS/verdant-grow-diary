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
3. **Target claims keep today's scope.** A stored `live` or `manual` VPD keeps today's stage and target
   comparison, labelled "not calibration-verified". Full compliance with the trust contract's evidence rules
   (calibration, canopy placement, leaf temperature) stays with that contract's deferred calibration slice.
   Matthew's decision, 2026-10-20 ~18:45 UTC, on Codex r4328863380.

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

**Today's diary row cap can crowd out manual evidence.** Today `fetchManualDiary`
(`useSensorsQuickLogManualReadings.ts` ~68-72) takes the newest 50 `diary_entries` for the tent with no filter. The
projection (`sensorsQuickLogManualSeriesRules.ts` ~162-172) recognises a manual reading in either of two envelopes:
`details.manual_sensor_snapshot`, falling back to `details.environment_check`. So 50 newer ordinary diary entries
can hide a still-current manual reading. An envelope alone is not enough either: an `environment_check` holding only a
note, water temperature or EC, or a `manual_sensor_snapshot` holding only pH or EC, is rejected by the projection
(`sensorSnapshot.ts` ~510-515 and ~560-570 need an air metric), so 50 of those would crowd out an older air reading
the same way, and so would 50 rows holding a temperature alone or an RH alone, since a manual pair must come from one
record. The resolver's diary read therefore filters for rows that can yield a VPD: a stored
`environment_check.vpd_kpa`, or a complete same-record temperature and RH pair in either envelope (a
`manual_sensor_snapshot` carries no VPD):
`.or("details->environment_check->vpd_kpa.not.is.null,and(details->environment_check->temp_c.not.is.null,details->environment_check->humidity_pct.not.is.null),and(details->manual_sensor_snapshot->temp_f.not.is.null,details->manual_sensor_snapshot->humidity_percent.not.is.null)")`,
as a page densifier for the shared manual evidence pager below, never as a cap. The `no_derivable_pair` reason still
has its evidence: the unfiltered manual history the chart already loads (the existing `SensorReading` projection) is
read for it, so a newest manual reading holding only a temperature or only an RH still yields `no_derivable_pair`,
not `no_reading`. The filter needs no schema change, and it is added only to the query the new projection reads, so
the existing chart and strip consumers stay byte-for-byte unchanged.

**Today's grow-event cap has the same gap.** `established fact`: `fetchManualEvents`
(`useSensorsQuickLogManualReadings.ts` ~52-66) takes the newest 200 manual `environment` `grow_events` for the tent,
with no filter on their values, and the projection (`sensorsQuickLogManualSeriesRules.ts` ~135-150) reads
`environment_events.temperature_c`, `humidity_pct` and `vpd_kpa`. So 200 newer events holding only a temperature,
only an RH, or neither would hide a still-current stored VPD or complete pair just past the cap.

**One manual evidence pager, for both sources.** The resolver reads `diary_entries` and manual `grow_events` with the
same pager, so neither has a cap of its own:

- **Order and paging.** Newest first by a keyset: (`entry_at` descending, `id` ascending) for diary rows, and
  (`occurred_at` descending, `id` ascending) for grow events. Pages are 50 diary rows or 200 grow events, and never
  use an offset, so no row is skipped or repeated.
- **Usable means the resolver keeps it.** A record is usable only if the new projection yields a reading from it and
  that reading survives the resolver's own candidate guards at `now`: not more than 60 s in the future
  (`FUTURE_SKEW_MS`), a known source, and an air value the projection accepts, giving a stored VPD or a same-record
  temperature and RH pair. A record that is structurally complete but fails a guard (a future-dated save, an
  out-of-band value) is not usable and does not stop the read.
- **Stop.** The read stops only when both hold: it has found the first usable record, whatever its age, and it has
  read every record sharing that record's timestamp, across page boundaries if need be. Every usable record at that
  timestamp then goes to the canonical comparator, which picks the winner. The query ending also stops it, and so
  does a hard bound of 5 pages per source (250 diary rows, 1,000 grow events). It never stops at the 24-hour manual
  age limit: an older usable record is returned and ages to `stale` like any other (CVP-22).
- **Value filters only make pages denser.** The diary filter above, and for grow events an
  `environment_events!inner ( temperature_c, humidity_pct, vpd_kpa )` embed with
  `.or("vpd_kpa.not.is.null,and(temperature_c.not.is.null,humidity_pct.not.is.null)", { referencedTable: "environment_events" })`,
  drop rows that cannot be usable. They never stand in for the usable test or the stop rule, so filtered and
  unfiltered pages return the same winner and `evidenceRef` within the bound. `uncertainty`: the build confirms
  `!inner` filtering against the hosted PostgREST before enabling it; without it, the pager runs on unfiltered pages.

Known limit, stated rather than built for: more records read before the stop condition holds than the 5-page bound
(unusable or guard-failing records, or a larger tie on one timestamp) hide an older or tied usable record. It is then
missed, never shown as healthy. `no_derivable_pair` reads the unfiltered manual history the chart already loads, and
the existing consumers' queries stay byte-for-byte unchanged.

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
  /**
   * The winning candidate's raw source before display normalisation, e.g. "pi_bridge", "manual", "diary".
   * Tonight maps a generic diary `sensor_snapshot` (`snapshotFromDiary`, source "diary") to "manual" for
   * display; this keeps "diary". Read only through `isCanonicalVpdClaimEligible` below.
   */
  originSource: string | null;
  sourceLabel: string | null;
  capturedAt: string | null;
  /** "stored" = a recorded vpd_kpa; "air_estimate" = derived from temperature and RH under the pairing rules. */
  basis: "stored" | "air_estimate" | null;
  /** Why there is no value, for the one unavailable copy line. */
  unavailableReason: "no_reading" | "no_derivable_pair" | "read_failed" | null;
  /**
   * Record that produced the value: a sensor row id, `pair:<temp input ref>+<rh input ref>` for any derived
   * pair (input refs are defined under the comparator), a manual reading id, or `diary:<diary_entries.id>`
   * for a generic diary `sensor_snapshot`.
   */
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

**One snapshot per tent, read in bulk.** `useLatestSensorSnapshot(growId, tentIds)` returns one combined snapshot
for all the tents it is given, and a hook cannot be called in a loop over a changing tent list. So the build
adds `useLatestSensorSnapshotsByTent(growId, tentIds)`. It runs one query per tent through React Query's
`useQueries`, using the same per-tent query as `useLatestSensorSnapshot(growId, [tentId])`, and returns
`Record<tentId, TonightSnapshotInput>`. It honours `keepDataOnRefreshError` per tent. Dashboard builds one
resolver result per tent from it. The existing single-call hook and its callers are unchanged.

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
`compareSnapshotToTargets` with a copy of the chosen tent's **eligible** snapshot,
`dashboardSnapshotForHealthyCues(snapshot)` (`dashboardSensorEvidenceRules.ts` ~149), in which `vpd` is replaced.
That is the same live/manual filter today's card applies (`Dashboard.tsx` ~311), so a `csv`, `sim`, `demo` or
`unverified` snapshot's temperature, RH and other metrics never drive the status, headline or reasons, even when a
newer eligible manual VPD from history wins. The `vpd` replacement is:

- **Eligible canonical value** (`isCanonicalVpdClaimEligible(result)`, the same predicate as the stage card):
  `vpd` is the canonical value, so the status, headline and reasons judge the same VPD the row shows.
- **Any other result** (context-only source, `air_estimate`, invalid or unavailable): `vpd` is `null`, so VPD
  adds nothing to the aggregate status, headline or reasons. The VPD row still shows the canonical value or the
  unavailable line, with "no target claim" and its source label.

When the eligible snapshot is `null` (filtered out as context-only) or empty (`source: "unavailable"`),
`compareSnapshotToTargets` returns `unavailable` at once
(`environmentTargetComparison.ts` ~81), so copying it would drop an eligible canonical value. This happens in the
manual-only case, where the value comes from `manuals` alone. Then the comparison input is a minimal snapshot built
from the canonical result: `source`, `captured_at` and `tent_id` from the result, `vpd` the canonical value, and
temperature, RH and every other metric `null`. Only VPD can then drive the status. Temperature and RH stay
unavailable, as they are today with an empty snapshot.

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

1. **Source fence, kept from today.** Applied through the one predicate below. It is the rule in
   `isDashboardSnapshotEligibleForHealthyCues` (`dashboardSensorEvidenceRules.ts`), applied to the resolver result
   instead of the snapshot. The post-aging `source` check keeps an expired reading out: aging changes `source` to
   `stale` but leaves `originSource` as it was. The origin check keeps a diary reading out: Tonight normalises a
   generic diary snapshot's `diary` to `manual` (`tonightTentHomeViewModel.ts` ~187), and today's Dashboard rejects
   that raw `diary` source, so a diary-origin value stays context only. `csv`, `demo`, `stale` and `invalid` values are shown with their source label
   and "context only, no target claim", never classified.
2. **Basis fence, from the trust contract (VPD-02).** A value whose `basis` is `air_estimate` is never
   classified. It shows the value, "Calculated from temperature and RH", and "no target claim from an estimate".

**One claim predicate for every consumer.** The stage card and the Target Comparison card both decide eligibility
through one pure function, so neither can drift from the other:

```ts
// src/lib/canonicalTentVpdRules.ts
export function isCanonicalVpdClaimEligible(r: CanonicalTentVpd): boolean {
  const origin = classifyCurrentStateSource(r.originSource); // sensorTruthCanon.ts
  return (
    r.state === "value" &&
    (origin === "live" || origin === "manual") && // trusted live aliases such as pi_bridge count as live; "diary" does not
    (r.source === "live" || r.source === "manual") && // post-aging: an expired reading is "stale"
    r.basis === "stored"
  );
}
```

The origin check goes through the existing `classifyCurrentStateSource`, not a literal string test, so every
sanctioned live alias that today's Dashboard admits (for example `pi_bridge`, which `normalizeSensorSource` and
`snapshotFromReadings` classify as `live`) keeps its claim, while `diary` stays excluded.

**The stage comes from the chosen tent's context.** The value is classified against the resolved stage of the
tent the selection rule picked, not the cross-tent `alertContextStage` (`Dashboard.tsx` ~267-275), which takes the most advanced
stage across every selected tent. Resolve it with the same function in a one-tent scope:
`resolveAlertContextStage({ growStage: scopedGrow.stage, tentStages: [chosenTent.stage], plantStages:
resolveSelectedTentPlantStages(plants, scopedGrow.id, tents, [chosenTent.id]) })`. With one tent selected this
equals today's value. That resolver still takes the most advanced of the grow, that tent and that tent's plants. That
is deliberate and unchanged: a stale `grows.stage` must not drive outdated bands (`Dashboard.tsx` ~260-266). So the
expected stage is the chosen tent's resolved grow/tent/plant context, not the bare tent badge. With several tents,
tent B's VPD is never judged against tent A's stage or tent A's plants. `alertContextStage`
itself stays unchanged for Environment Alerts and alert persistence. Target Comparison reads grow targets
(`useGrowTargets`), not a stage, so it is unaffected.

A `stored` live or manual value is classified as it is today, and every such claim carries the label "not
calibration-verified" (owner decision 3). This spec does not add the trust contract's calibration, placement or
leaf-temperature checks; that waits for the contract's deferred calibration slice.

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
- Every `live` or `manual` candidate is aged by its own source with
  `isCurrentStateStale(capturedAt, { now, source })` (`sensorTruthCanon.ts`). That means 15 minutes for `live` and
  24 hours for `manual` (`MANUAL_CURRENT_STATE_STALE_MS`). This covers manual history as well as live rows. An
  expired one becomes `stale`: still shown, never healthy, never classified. `csv`, `demo` and other context-only
  candidates are **not** relabelled `stale`: `isCurrentStateStale` would apply the 15-minute live window to them
  (`sensorTruthCanon.ts` ~96-103) and the relabel would hide their mandatory provenance. They keep their own label
  and are never classified anyway. The full manual history makes this newly reachable;
  without it, an old manual value would pass both classification fences indefinitely.
- Unknown sources become `invalid` and are never shown as a value.
- A same-capture temperature and RH pair newer than every stored VPD replaces the stored VPD (#2268, #2271).
- Ties break deterministically, using the one comparator below.

**One total comparator for every candidate.** Candidates are ordered by these keys, and the first key that
differs decides. Input or backend order never decides.

1. `capturedAt`, newest first (epoch milliseconds).
2. Origin: a sensor row, then the diary-inclusive snapshot, then a manual reading. The first two keep today's
   `origin` 0 and 1 order from `newestFirst`; manual readings are the new origin 2.
3. Within manual readings: tent-level (`plantId` null) before plant-level.
4. Record key, ascending, by plain string comparison: the sensor row id, the snapshot's input ref (below), or
   the manual reading `id`. A derived pair has no single record, so its key is `pair:<temperature input
ref>+<rh input ref>`, always in that order. The same string is its `evidenceRef`. A manual same-record pair
   uses its reading `id`.

**Input refs for a derived pair.** `established fact`: `calculatedVpdCandidate` pools the sensor-row and
snapshot candidates of each metric (`tonightTentHomeViewModel.ts` ~385-416), so its temperature and RH can each
come from either. Every proven input therefore gets one ref, in this order of precedence:

- a sensor row: its row id;
- a snapshot metric with `metric_refs[<metric>]`: that ref's `id` (a `sensor_readings` row id);
- a snapshot with `diary_evidence_ref`, or a diary snapshot built with `diaryEntryId`: `diary:<id>`;
- any other proven snapshot metric: `snapshot:<metric>@<snapshot ts>`, so the key is still total.

So a row + row pair is `pair:<row id>+<row id>`, a snapshot + snapshot pair is, for example,
`pair:diary:<id>+diary:<id>`, and a mixed pair is `pair:<row id>+<metric ref id>` or the reverse.

Two tent-level manual readings, two plant-level ones, and every mix of origins are covered by these keys. A
derived pair takes its `capturedAt` from its older input, as `calculatedVpdCandidate` does today. Its origin
follows its input kind: every non-manual pair (row + row, snapshot + snapshot, row + snapshot) keeps today's
fixed origin 0, and a manual same-record pair is origin 2.

## File-level plan

| File                                                  | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/canonicalTentVpdRules.ts` (new)              | Resolver, moved from the Tonight view model, plus the `manuals` input                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/lib/tonightTentHomeViewModel.ts`                 | VPD reads the resolver; temperature and RH unchanged                                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/lib/dashboardEnvironmentSnapshotViewModel.ts`    | `buildTentSnapshotView` takes the resolver result for VPD                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/pages/Dashboard.tsx`                             | Build one resolver result per tent and pass it to each consumer                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/lib/sensorsQuickLogManualSeriesRules.ts`         | Add the `QuickLogManualReading` projection; existing one unchanged                                                                                                                                                                                                                                                                                                                                                                                    |
| `src/hooks/useSensorsQuickLogManualReadings.ts`       | Select the record id and `plant_id`. Read diary rows and manual grow events through the one shared manual evidence pager: keyset order (timestamp desc, `id` asc), 50- or 200-row pages, never offset; stop only after the first record that survives the resolver's guards at `now` and its complete timestamp tie; 5 pages per source. Value filters only densify pages. Only in the query the new projection reads; the chart's query is unchanged |
| `src/lib/sensorSnapshot.ts` (+ its `_shared` mirror)  | `snapshotFromDiary` takes an optional `{ diaryEntryId }`, as `snapshotFromEnvironmentCheck` does, and sets `diary_evidence_ref`; regenerate the edge mirror with the repo's sync script                                                                                                                                                                                                                                                               |
| `src/hooks/useLatestSensorSnapshot.ts`                | Opt-in `keepDataOnRefreshError`; pass the diary row id to `snapshotFromDiary`; default behaviour otherwise unchanged                                                                                                                                                                                                                                                                                                                                  |
| `src/hooks/useLatestSensorSnapshotsByTent.ts` (new)   | Per-tent snapshots via `useQueries`, for the resolver                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/constants/dashboardVpdCopy.ts` (new)             | The three unavailable lines and the estimate line                                                                                                                                                                                                                                                                                                                                                                                                     |
| `src/test/canonical-tent-vpd-rules.test.ts` (new)     | Resolver unit tests                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/test/dashboard-vpd-single-source.test.tsx` (new) | Renders `Dashboard` and compares every VPD widget                                                                                                                                                                                                                                                                                                                                                                                                     |

No schema, RLS, migration, edge function, Action Queue or dependency change. Existing tests that pin the old
"Missing" or `—` strings are renegotiated in the same commit as the behaviour change, each named in the PR body.

## Acceptance tests

Each test is shown failing on the deploy branch before the build, with the count in the PR body.

| ID      | Given                                                                                                                                                                                                                                                                                                                                      | Then                                                                                                                                                                                                                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CVP-01  | One tent; older tent-level stored VPD; newer plant-level manual temp and RH                                                                                                                                                                                                                                                                | Tonight card, strip chip, Latest Environment and stage card show the same derived value and time                                                                                                                                                                                                    |
| CVP-02  | One tent; tent-level manual temp and RH only, no stored VPD                                                                                                                                                                                                                                                                                | All four show the same derived value, labelled "Calculated from temperature and RH"                                                                                                                                                                                                                 |
| CVP-03  | One tent; no reading at all                                                                                                                                                                                                                                                                                                                | All four show the one `no_reading` line; no "Missing", `—` or a value anywhere                                                                                                                                                                                                                      |
| CVP-04  | Newer temperature and RH without VPD after an older stored VPD (#2268 case)                                                                                                                                                                                                                                                                | Card, strip and ribbon's latest point agree                                                                                                                                                                                                                                                         |
| CVP-05  | RH pinned at 100%                                                                                                                                                                                                                                                                                                                          | All four show invalid; none shows a healthy cue                                                                                                                                                                                                                                                     |
| CVP-06  | Manual temperature in one reading, manual RH in a different reading (or a manual temperature with a sensor RH)                                                                                                                                                                                                                             | No derived value from that pair; `no_derivable_pair` when nothing else qualifies                                                                                                                                                                                                                    |
| CVP-06b | Sensor temperature row and sensor RH row, compatible sources, different capture times                                                                                                                                                                                                                                                      | Unchanged from today: derived value, aged by the older input (existing test ~84-95 stays green)                                                                                                                                                                                                     |
| CVP-07  | Derived value inside the stage band                                                                                                                                                                                                                                                                                                        | Stage card shows the value but no in-target claim                                                                                                                                                                                                                                                   |
| CVP-08  | Two tents selected, newest reading in tent B                                                                                                                                                                                                                                                                                               | Latest Environment names tent B and matches tent B's strip chip                                                                                                                                                                                                                                     |
| CVP-09  | Sensor read fails with no earlier data                                                                                                                                                                                                                                                                                                     | `read_failed` line, not `no_reading`                                                                                                                                                                                                                                                                |
| CVP-10  | Same input rendered twice with the same `now`                                                                                                                                                                                                                                                                                              | Identical output (deterministic)                                                                                                                                                                                                                                                                    |
| CVP-11  | A value loaded, then the next refresh fails (`refresh_error`)                                                                                                                                                                                                                                                                              | All four keep that value with `refreshFailed`, show the refresh line; a live value still ages to stale                                                                                                                                                                                              |
| CVP-12  | Newest value is a stored `csv`, `demo` or `stale` VPD inside the stage band                                                                                                                                                                                                                                                                | Stage card shows the value and source label, no in-target or out-of-target claim                                                                                                                                                                                                                    |
| CVP-13  | Value came only from a diary snapshot, then the snapshot query errors                                                                                                                                                                                                                                                                      | The value stays with `refreshFailed`; other `useLatestSensorSnapshot` consumers unchanged                                                                                                                                                                                                           |
| CVP-14  | Two tents selected: empty snapshot, manual-only data, or equal-time readings in both                                                                                                                                                                                                                                                       | Selection rule picks deterministically, names the tent; Target Comparison VPD matches it                                                                                                                                                                                                            |
| CVP-15  | Equal `capturedAt` across: a sensor row and a manual reading; a snapshot and a manual reading; two tent-level manual readings; a tent-level and a plant-level reading; two plant-level readings; two derived sensor-row pairs; a stored VPD row and a derived snapshot + snapshot pair; a stored VPD row and a derived row + snapshot pair | The comparator picks the same winner whatever the input order (shuffle the inputs); `evidenceRef` names the winner's record id, or `pair:<temp input ref>+<rh input ref>` for a derived pair                                                                                                        |
| CVP-16  | Two tents selected, no value: one tent `loading`, the other `invalid`; then both settled, one `invalid`                                                                                                                                                                                                                                    | Shows `loading` first; after settling, shows invalid naming the tent, never `no_reading`                                                                                                                                                                                                            |
| CVP-17  | Snapshot VPD differs from the canonical VPD; then the canonical value is `air_estimate`, then a stored `csv` value                                                                                                                                                                                                                         | Target Comparison status, headline and reasons follow the canonical value in the first case; VPD adds nothing to the aggregate in the other two, and the row shows "no target claim"                                                                                                                |
| CVP-18  | Two tents selected, each with evidence only in its own diary snapshot                                                                                                                                                                                                                                                                      | Each tent's resolver result uses its own snapshot; the selection rule picks the newer; neither tent's value is attributed to the other                                                                                                                                                              |
| CVP-19  | A stored `live` VPD inside the stage band                                                                                                                                                                                                                                                                                                  | Stage card and Target Comparison show the in-target claim with the "not calibration-verified" label                                                                                                                                                                                                 |
| CVP-20  | Two tents selected: tent A in late flower, tent B in veg with the newer stored `live` VPD, inside B's veg band and outside A's band                                                                                                                                                                                                        | Stage card names tent B and classifies against B's resolved context (veg); Environment Alerts still use the cross-tent stage                                                                                                                                                                        |
| CVP-21  | Chosen tent B is in veg, but `scopedGrow.stage` is late flower, or one of B's plants is in flower                                                                                                                                                                                                                                          | Stage card classifies against B's resolved context (the more advanced stage), the same as a one-tent selection of B today                                                                                                                                                                           |
| CVP-22  | Newest candidate is a manual reading 25 hours old, inside the stage band                                                                                                                                                                                                                                                                   | Shown as `stale` with its age; no in-target or out-of-target claim on the stage card or in Target Comparison                                                                                                                                                                                        |
| CVP-23  | Manual-only data, empty diary snapshot, eligible stored `manual` VPD inside the band                                                                                                                                                                                                                                                       | Target Comparison status follows the canonical VPD (not `unavailable`); temperature and RH rows stay unavailable                                                                                                                                                                                    |
| CVP-24  | Newest candidate is a `csv` VPD, then a `demo` VPD, each 2 hours old                                                                                                                                                                                                                                                                       | Shown with its own `csv` / `demo` label, never relabelled `stale`; no target claim                                                                                                                                                                                                                  |
| CVP-25  | Per-tent snapshot is `csv` (temp, RH, VPD) and a newer stored `manual` VPD from history wins                                                                                                                                                                                                                                               | Target Comparison status and reasons come from the manual VPD only; the `csv` temperature and RH add nothing to the aggregate                                                                                                                                                                       |
| CVP-26  | A tent has a current manual reading, then 60 newer ordinary diary entries with no `manual_sensor_snapshot`                                                                                                                                                                                                                                 | The resolver still gets the manual reading and uses it; the pager reads past the ordinary entries, which are never usable                                                                                                                                                                           |
| CVP-27  | A manual reading exists only in `details.environment_check`, then 60 newer ordinary diary entries                                                                                                                                                                                                                                          | The resolver still gets it through the `environment_check` fallback; the filter keeps both envelopes                                                                                                                                                                                                |
| CVP-28  | Newest value is a stored VPD from a generic diary `sensor_snapshot` (`snapshotFromDiary`, source `diary`) inside the band                                                                                                                                                                                                                  | Shown with its label, `originSource: "diary"`, `evidenceRef: "diary:<id>"`; no claim on the stage card or in Target Comparison, as today                                                                                                                                                            |
| CVP-29  | An air reading in an older `environment_check`, then 60 newer `environment_check` rows holding only a note or EC                                                                                                                                                                                                                           | The resolver still gets the air reading; rows without an air metric never reach the cap                                                                                                                                                                                                             |
| CVP-30  | A manual reading 25 hours old and a live reading 20 minutes old, each inside the band                                                                                                                                                                                                                                                      | Both age to `source: "stale"` with `originSource` unchanged; neither is classified, no in-target claim                                                                                                                                                                                              |
| CVP-31  | A current stored `pi_bridge` VPD inside the band                                                                                                                                                                                                                                                                                           | `originSource: "pi_bridge"` classifies as live; the stage card and Target Comparison keep the in-target claim, as today                                                                                                                                                                             |
| CVP-32  | A current stored VPD in an older `environment_check`, then 60 newer manual rows each holding only a temperature or only an RH                                                                                                                                                                                                              | The resolver still gets the stored VPD; with no stored VPD at all, the reason is `no_derivable_pair`, not `no_reading`                                                                                                                                                                              |
| CVP-33  | A derived pair whose temperature comes from a sensor row and whose RH comes from the snapshot's `metric_refs.rh`, and the reverse; a derived pair from a diary snapshot with `diary_evidence_ref`; each tied on `capturedAt` with a stored VPD row, inputs shuffled                                                                        | Same winner whatever the input order; the pair's `evidenceRef` is `pair:<row id>+<metric ref id>`, `pair:<metric ref id>+<row id>` or `pair:diary:<id>+diary:<id>`                                                                                                                                  |
| CVP-34  | A current manual `grow_events` stored VPD or complete temperature + RH pair, then 200 newer manual `environment` events each holding only a temperature, only an RH, or neither                                                                                                                                                            | The resolver still gets the older usable event, on filtered and unfiltered pages alike, and returns it as `stale` when it is older than 24 hours; with none at all, the reason is `no_derivable_pair` when an incomplete event exists, `no_reading` when none does; the chart's series is unchanged |
| CVP-35  | Usable manual events share the newest usable `occurred_at` across a page boundary (including more than 200 tied events, with a tied tent-level reading after 200 plant-level ones), on filtered and unfiltered pages, inputs shuffled                                                                                                      | The read takes every tied event; the comparator picks the tent-level reading, with the same winner and `evidenceRef` on both kinds of page                                                                                                                                                          |
| CVP-36  | The newest manual grow event and the newest manual diary row are each a complete pair saved 5 minutes in the future; older valid ones exist                                                                                                                                                                                                | The pager does not stop at the future records, which fail the future-skew guard; the resolver gets the older valid ones                                                                                                                                                                             |
| CVP-37  | More than 50 VPD-capable diary rows share the newest `entry_at`, with a tent-level row after 50 plant-level ones, inputs shuffled                                                                                                                                                                                                          | The pager reads the whole tie across the page boundary; the comparator picks the tent-level row, with the same `evidenceRef` whatever the backend order                                                                                                                                             |

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
