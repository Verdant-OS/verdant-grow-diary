/**
 * manualSnapshotDiaryAdapter — pure adapter that turns a `diary_entries`
 * row (carrying `details.manual_sensor_snapshot` written by Quick Log) into
 * a `ManualSnapshotRecord` consumable by `selectManualSnapshotsForTimeline`
 * / `buildManualSnapshotTimelineCard`.
 *
 * Hard constraints:
 *  - Pure: no I/O, no Supabase, no React, no globals.
 *  - Only rows tagged `source === "manual"` are eligible — `live`, `demo`,
 *    `csv`, or unknown sources are rejected, returning `null`.
 *  - Never invents readings: missing metric fields stay missing.
 *  - Validation is delegated to `validateManualSnapshot`; suspicious
 *    telemetry surfaces as warnings, never as "healthy".
 *  - Persistence shape (`temp_f`, `humidity_percent`, `ph`, `ec`) is
 *    mapped into the canonical validator inputs:
 *      temp_f          → airTemp (°F)
 *      humidity_percent → humidityPct
 *      ph              → reservoirPh
 *      ec              → reservoirEc (mS/cm)
 */

import {
  validateManualSnapshot,
  type ManualSnapshotInput,
} from "@/lib/manualSensorSnapshotRules";
import type { ManualSnapshotRecord } from "@/lib/manualSensorSnapshotViewModel";

export const MANUAL_SNAPSHOT_DIARY_SOURCE = "manual" as const;

export interface ManualSnapshotDiaryRow {
  id: string;
  plant_id: string | null;
  tent_id: string | null;
  entry_at: string;
  note: string | null;
  details: unknown;
}

interface PersistedManualSnapshot {
  source?: unknown;
  temp_f?: unknown;
  humidity_percent?: unknown;
  ph?: unknown;
  ec?: unknown;
}

function readPersistedSnapshot(details: unknown): PersistedManualSnapshot | null {
  if (!details || typeof details !== "object") return null;
  const snap = (details as { manual_sensor_snapshot?: unknown }).manual_sensor_snapshot;
  if (!snap || typeof snap !== "object") return null;
  if ((snap as PersistedManualSnapshot).source !== MANUAL_SNAPSHOT_DIARY_SOURCE) return null;
  return snap as PersistedManualSnapshot;
}

function finiteOrNull(v: unknown): number | null {
  if (typeof v !== "number") return null;
  return Number.isFinite(v) ? v : null;
}

/**
 * Build the validator input from the persisted snapshot. Missing values
 * stay missing.
 */
function toValidatorInput(snap: PersistedManualSnapshot): ManualSnapshotInput {
  const input: ManualSnapshotInput = {};
  const tempF = finiteOrNull(snap.temp_f);
  if (tempF !== null) {
    input.airTemp = tempF;
    input.airTempUnit = "F";
  }
  const rh = finiteOrNull(snap.humidity_percent);
  if (rh !== null) input.humidityPct = rh;
  const ph = finiteOrNull(snap.ph);
  if (ph !== null) input.reservoirPh = ph;
  const ec = finiteOrNull(snap.ec);
  if (ec !== null) {
    input.reservoirEc = ec;
    input.reservoirEcUnit = "mS/cm";
  }
  return input;
}

/**
 * Convert one diary row into a `ManualSnapshotRecord` when (and only when)
 * it carries a manual snapshot payload.
 */
export function diaryRowToManualSnapshotRecord(
  row: ManualSnapshotDiaryRow,
): ManualSnapshotRecord | null {
  const snap = readPersistedSnapshot(row.details);
  if (!snap) return null;
  if (typeof row.entry_at !== "string" || row.entry_at.length === 0) return null;
  if (Number.isNaN(Date.parse(row.entry_at))) return null;
  if (!row.tent_id || typeof row.tent_id !== "string") return null;

  const input = toValidatorInput(snap);
  const validation = validateManualSnapshot(input);

  // If nothing usable came across, skip — no point showing an empty card.
  if (validation.metrics.length === 0 && validation.errors.length === 0) {
    return null;
  }

  return {
    id: row.id,
    capturedAt: row.entry_at,
    tentId: row.tent_id,
    plantId: row.plant_id ?? null,
    notes: row.note,
    validation,
  };
}

/**
 * Convert many rows. Rows that don't carry a manual snapshot are skipped.
 * Order is preserved; downstream `selectManualSnapshotsForTimeline` sorts.
 */
export function diaryRowsToManualSnapshotRecords(
  rows: ReadonlyArray<ManualSnapshotDiaryRow>,
): ManualSnapshotRecord[] {
  const out: ManualSnapshotRecord[] = [];
  for (const row of rows) {
    const rec = diaryRowToManualSnapshotRecord(row);
    if (rec) out.push(rec);
  }
  return out;
}
