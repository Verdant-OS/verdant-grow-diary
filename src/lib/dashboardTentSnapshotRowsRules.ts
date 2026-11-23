/**
 * Rows the Dashboard tent card builds its latest-reading snapshot from.
 *
 * The plant page's "Current Environment" card already merges the tent's
 * sensor rows with Quick Log manual environment readings, newest observation
 * first (`mergePlantTentReadingsWithManualEvents`). The Dashboard tent card
 * read sensor rows alone, so a newer manual reading showed on the plant page
 * while the Dashboard still showed an older sensor value as the tent's latest
 * (core-loop walkthrough, 2026-11-20). Both surfaces now use the same merge.
 *
 * Pure: no React, no Supabase, no clock (`nowMs` is injected).
 *
 * - Sensor rows pass the Dashboard evidence filter first (unknown sources,
 *   flagged quality and diagnostic rows never count as the latest reading).
 * - Manual rows are this tent's Quick Log temperature/RH values only
 *   (`tonightRowsFromQuickLogManualReadings`), labelled `manual`, never live.
 *   A manual reading from another tent never contributes.
 * - Ordering is by observation time (`captured_at`, then `ts`), newest first,
 *   with the input order as the tie-breaker; a row with no parseable time
 *   sorts last. At equal times the Quick Log manual row wins, as on the plant
 *   page and the Sensors page.
 * - A Quick Log row also shadows any sensor row of the same metric at the same
 *   instant, whatever its source, so the card's provenance and freshness name
 *   the readings it actually shows. A different metric at that instant stays,
 *   as a genuine mixed reading.
 * - Equivalent spellings of one instant ("…:00Z", "…:00.000Z") are aligned to
 *   one canonical `captured_at`, so the snapshot groups them as one capture.
 *   Rows are copied, never mutated; a row with no parseable time is unchanged.
 * - Staleness is not decided here: the snapshot view model labels an old
 *   manual or sensor reading Stale from its own capture time.
 */
import {
  selectDashboardSensorEvidenceRows,
  type DashboardSensorEvidenceRow,
} from "@/lib/dashboardSensorEvidenceRules";
import { mergePlantTentReadingsWithManualEvents } from "@/lib/plantManualEnvironmentEventRules";
import { resolveSensorObservationTime } from "@/lib/sensorObservationTimeRules";
import { tonightRowsFromQuickLogManualReadings } from "@/lib/tentManualEnvironmentSnapshotRules";
import type { TonightSensorRow } from "@/lib/tonightTentHomeViewModel";
import type { SensorReading } from "@/mock";

export type DashboardTentSnapshotRow<T extends DashboardSensorEvidenceRow> = T | TonightSensorRow;

function observedMs(row: DashboardSensorEvidenceRow): number {
  const at = resolveSensorObservationTime(row);
  const ms = at === null ? Number.NaN : Date.parse(at);
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

function newestFirst<T extends DashboardSensorEvidenceRow>(rows: readonly T[]): T[] {
  return rows
    .map((row, index) => ({ row, index, ms: observedMs(row) }))
    .sort((a, b) => {
      if (a.ms !== b.ms) return a.ms > b.ms ? -1 : 1;
      return a.index - b.index;
    })
    .map((item) => item.row);
}

function metricInstantKey(row: DashboardSensorEvidenceRow): string {
  return `${row.metric}|${observedMs(row)}`;
}

function withCanonicalObservationTime<T extends DashboardSensorEvidenceRow>(row: T): T {
  const ms = observedMs(row);
  if (!Number.isFinite(ms)) return row;
  const canonical = new Date(ms).toISOString();
  return row.captured_at === canonical ? row : { ...row, captured_at: canonical };
}

export function selectDashboardTentSnapshotRows<T extends DashboardSensorEvidenceRow>(input: {
  sensorRows: readonly T[] | null | undefined;
  quickLogManuals: readonly SensorReading[] | null | undefined;
  tentId: string | null | undefined;
  nowMs: number;
}): Array<DashboardTentSnapshotRow<T>> {
  const sensorRows = newestFirst(selectDashboardSensorEvidenceRows(input.sensorRows));
  const manualRows = newestFirst(
    selectDashboardSensorEvidenceRows(
      tonightRowsFromQuickLogManualReadings(input.quickLogManuals, input.tentId, input.nowMs),
    ),
  );
  const quickLogRows = new Set<DashboardTentSnapshotRow<T>>(manualRows);
  const quickLogKeys = new Set(manualRows.map(metricInstantKey));
  return mergePlantTentReadingsWithManualEvents<DashboardTentSnapshotRow<T>>(sensorRows, manualRows)
    .filter((row) => quickLogRows.has(row) || !quickLogKeys.has(metricInstantKey(row)))
    .map(withCanonicalObservationTime);
}
