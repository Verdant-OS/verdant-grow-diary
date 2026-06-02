/**
 * quickLogV2ManualSnapshotAdapter — pure adapter that converts a QuickLog v2
 * sibling environment event (parent grow_event with event_type='environment'
 * + child environment_events row, both source='manual') into a canonical
 * `ManualSnapshotRecord` consumable by the existing manual sensor snapshot
 * pipeline (timeline + AI Doctor Context readiness).
 *
 * Hard constraints:
 *  - Pure: no I/O, no Supabase, no React, no globals.
 *  - Only rows with event_type === "environment" AND source === "manual"
 *    are eligible. Anything else returns null.
 *  - Plant/tent scope is enforced by the caller via
 *    `filterQuickLogV2EnvironmentRowsByScope` — a row from a DIFFERENT
 *    plant or tent never produces a record for the scope under evaluation.
 *  - Telemetry is run through the existing validator. Invalid/malformed
 *    readings keep severity "invalid" — never "healthy".
 *  - Never invents readings: missing metric fields stay missing.
 *  - No "live", "synced", "connected", or "imported" language.
 */

import {
  validateManualSnapshot,
  type ManualSnapshotInput,
} from "@/lib/manualSensorSnapshotRules";
import type { ManualSnapshotRecord } from "@/lib/manualSensorSnapshotViewModel";

export const QUICKLOG_V2_ENV_EVENT_TYPE = "environment" as const;
export const QUICKLOG_V2_ENV_SOURCE = "manual" as const;

export interface QuickLogV2EnvironmentRow {
  /** grow_events.id (parent environment event id). */
  id: string;
  plant_id: string | null;
  tent_id: string | null;
  occurred_at: string;
  event_type: string;
  source: string;
  /** Sensor child row payload. Missing values stay missing. */
  environment: {
    temperature_c?: number | string | null;
    humidity_pct?: number | string | null;
    vpd_kpa?: number | string | null;
  } | null;
}

export type QuickLogV2SnapshotScope =
  | { kind: "plant"; plantId: string }
  | { kind: "tent"; tentId: string };

function finiteOrNull(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isEligible(row: QuickLogV2EnvironmentRow): boolean {
  if (!row || typeof row !== "object") return false;
  if (row.event_type !== QUICKLOG_V2_ENV_EVENT_TYPE) return false;
  if (row.source !== QUICKLOG_V2_ENV_SOURCE) return false;
  if (typeof row.occurred_at !== "string" || row.occurred_at.length === 0) return false;
  if (Number.isNaN(Date.parse(row.occurred_at))) return false;
  if (!row.tent_id || typeof row.tent_id !== "string") return false;
  return true;
}

/** Filter rows to a single plant/tent scope. Pure & deterministic. */
export function filterQuickLogV2EnvironmentRowsByScope(
  rows: ReadonlyArray<QuickLogV2EnvironmentRow>,
  scope: QuickLogV2SnapshotScope,
): QuickLogV2EnvironmentRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter((r) => {
    if (!isEligible(r)) return false;
    if (scope.kind === "plant") return r.plant_id === scope.plantId;
    return r.tent_id === scope.tentId;
  });
}

function toValidatorInput(
  env: QuickLogV2EnvironmentRow["environment"],
): ManualSnapshotInput {
  const input: ManualSnapshotInput = {};
  const tempC = finiteOrNull(env?.temperature_c);
  if (tempC !== null) {
    input.airTemp = tempC;
    input.airTempUnit = "C";
  }
  const rh = finiteOrNull(env?.humidity_pct);
  if (rh !== null) input.humidityPct = rh;
  const vpd = finiteOrNull(env?.vpd_kpa);
  if (vpd !== null) input.vpdKpa = vpd;
  return input;
}

/**
 * Convert ONE QuickLog v2 environment event row into a ManualSnapshotRecord.
 * Returns null if the row is not a manual environment event or carries no
 * usable telemetry.
 */
export function quickLogV2EnvironmentRowToManualSnapshotRecord(
  row: QuickLogV2EnvironmentRow,
): ManualSnapshotRecord | null {
  if (!isEligible(row)) return null;
  const input = toValidatorInput(row.environment);
  const validation = validateManualSnapshot(input);
  if (validation.metrics.length === 0 && validation.errors.length === 0) {
    return null;
  }
  return {
    id: row.id,
    capturedAt: row.occurred_at,
    tentId: row.tent_id as string,
    plantId: row.plant_id ?? null,
    notes: null,
    validation,
  };
}

/**
 * Convert many scoped rows. Rows that fail eligibility or have no usable
 * telemetry are skipped. Scope filtering is applied first so a recent
 * manual environment event on a DIFFERENT plant/tent cannot satisfy
 * readiness for the plant/tent under evaluation.
 */
export function quickLogV2EnvironmentRowsToManualSnapshotRecords(
  rows: ReadonlyArray<QuickLogV2EnvironmentRow>,
  scope: QuickLogV2SnapshotScope,
): ManualSnapshotRecord[] {
  const scoped = filterQuickLogV2EnvironmentRowsByScope(rows, scope);
  const out: ManualSnapshotRecord[] = [];
  for (const r of scoped) {
    const rec = quickLogV2EnvironmentRowToManualSnapshotRecord(r);
    if (rec) out.push(rec);
  }
  return out;
}
