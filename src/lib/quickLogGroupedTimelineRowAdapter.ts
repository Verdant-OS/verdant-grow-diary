/**
 * quickLogGroupedTimelineRowAdapter — pure adapters that map raw
 * `grow_events` rows (with their joined `watering_events` /
 * `environment_events` children) into the input shapes consumed by
 * `groupQuickLogTimelineEntries`.
 *
 * Hard constraints:
 *  - Pure. No I/O, no Supabase, no React, no globals.
 *  - Source-honest. Only `source === 'manual'` rows are considered.
 *  - event_type → QuickLog action kind mapping:
 *      'watering'    → 'water'
 *      'observation' → 'note'
 *      'environment' → routed to environment rows (not actions)
 *      anything else → ignored
 *  - Never invents notes, volumes, or telemetry.
 *  - Never relabels as live/synced/connected/imported.
 */

import type { QuickLogActionEvent } from "@/lib/quickLogTimelineGroupingViewModel";
import type { QuickLogV2EnvironmentRow } from "@/lib/quickLogV2ManualSnapshotAdapter";

export interface RawGrowEventRow {
  id: string;
  plant_id: string | null;
  tent_id: string | null;
  occurred_at: string;
  event_type: string;
  source: string;
  note: string | null;
  is_deleted?: boolean | null;
  /** Optional nested children (Supabase select syntax). */
  watering_events?:
    | { volume_ml: number | string | null }
    | Array<{ volume_ml: number | string | null }>
    | null;
  environment_events?:
    | {
        temperature_c: number | string | null;
        humidity_pct: number | string | null;
        vpd_kpa: number | string | null;
      }
    | Array<{
        temperature_c: number | string | null;
        humidity_pct: number | string | null;
        vpd_kpa: number | string | null;
      }>
    | null;
}

function finiteOrNull(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function firstChild<T>(c: T | T[] | null | undefined): T | null {
  if (c == null) return null;
  if (Array.isArray(c)) return c.length > 0 ? c[0] : null;
  return c;
}

function isManualRow(row: RawGrowEventRow): boolean {
  if (!row || typeof row !== "object") return false;
  if (row.is_deleted === true) return false;
  if (row.source !== "manual") return false;
  if (typeof row.occurred_at !== "string" || row.occurred_at.length === 0)
    return false;
  if (Number.isNaN(Date.parse(row.occurred_at))) return false;
  if (typeof row.tent_id !== "string" || row.tent_id.length === 0) return false;
  return true;
}

export function rawRowToQuickLogActionEvent(
  row: RawGrowEventRow,
): QuickLogActionEvent | null {
  if (!isManualRow(row)) return null;
  let kind: QuickLogActionEvent["kind"];
  if (row.event_type === "watering") kind = "water";
  else if (row.event_type === "observation") kind = "note";
  else return null;

  let volumeMl: number | null = null;
  if (kind === "water") {
    const w = firstChild(row.watering_events);
    volumeMl = finiteOrNull(w?.volume_ml);
  }

  return {
    id: row.id,
    kind,
    source: row.source,
    plantId: row.plant_id,
    tentId: row.tent_id,
    occurredAt: row.occurred_at,
    noteText: row.note ?? null,
    volumeMl,
  };
}

export function rawRowToQuickLogEnvironmentRow(
  row: RawGrowEventRow,
): QuickLogV2EnvironmentRow | null {
  if (!isManualRow(row)) return null;
  if (row.event_type !== "environment") return null;
  const env = firstChild(row.environment_events);
  return {
    id: row.id,
    plant_id: row.plant_id,
    tent_id: row.tent_id,
    occurred_at: row.occurred_at,
    event_type: row.event_type,
    source: row.source,
    environment: env
      ? {
          temperature_c: env.temperature_c ?? null,
          humidity_pct: env.humidity_pct ?? null,
          vpd_kpa: env.vpd_kpa ?? null,
        }
      : null,
  };
}

export interface PartitionedRows {
  actions: QuickLogActionEvent[];
  environmentRows: QuickLogV2EnvironmentRow[];
}

export function partitionQuickLogRows(
  rows: ReadonlyArray<RawGrowEventRow>,
): PartitionedRows {
  const actions: QuickLogActionEvent[] = [];
  const environmentRows: QuickLogV2EnvironmentRow[] = [];
  for (const row of rows ?? []) {
    const a = rawRowToQuickLogActionEvent(row);
    if (a) {
      actions.push(a);
      continue;
    }
    const e = rawRowToQuickLogEnvironmentRow(row);
    if (e) environmentRows.push(e);
  }
  return { actions, environmentRows };
}
