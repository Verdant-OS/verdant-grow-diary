/**
 * importedSensorHistoryViewModel
 *
 * Pure read-only view model for the Tent Detail "Imported sensor history"
 * panel. Given the tent's loaded sensor readings, it filters to the
 * CSV-imported subset and summarizes count / earliest / latest / metrics
 * plus a capped list of safe display rows.
 *
 * Safety contract:
 *   - Only rows with `source === "csv"` are surfaced.
 *   - `raw_payload` is NEVER read, returned, or referenced.
 *   - No automation, no alerts, no Action Queue, no AI calls.
 *   - Deterministic ordering (ts desc, then created_at desc).
 *   - Stable, null-safe output shape — usable from JSX without
 *     additional transforms.
 */

export const IMPORTED_SENSOR_HISTORY_SOURCE = "csv" as const;
export const IMPORTED_SENSOR_HISTORY_DEFAULT_LIMIT = 25;

export interface ImportedSensorHistoryInputRow {
  tent_id: string | null;
  source: string | null;
  metric: string | null;
  /** Canonical ts column on sensor_readings. */
  ts?: string | null;
  /** Optional captured_at (CSV imports populate this). */
  captured_at?: string | null;
  created_at?: string | null;
  value?: number | null;
  // NOTE: raw_payload is intentionally NOT in this input shape.
}

export interface ImportedSensorHistoryDisplayRow {
  capturedAt: string;
  metric: string;
  value: number | null;
}

export interface ImportedSensorHistoryViewModel {
  isEmpty: boolean;
  totalCount: number;
  earliestCapturedAt: string | null;
  latestCapturedAt: string | null;
  metrics: string[];
  recentRows: ImportedSensorHistoryDisplayRow[];
}

function pickCapturedAt(row: ImportedSensorHistoryInputRow): string | null {
  const candidate = row.captured_at ?? row.ts ?? null;
  if (candidate == null) return null;
  const trimmed = typeof candidate === "string" ? candidate.trim() : "";
  if (trimmed.length === 0) return null;
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export function buildImportedSensorHistoryViewModel(args: {
  readings: ReadonlyArray<ImportedSensorHistoryInputRow>;
  limit?: number;
}): ImportedSensorHistoryViewModel {
  const limit = Math.max(1, Math.floor(args.limit ?? IMPORTED_SENSOR_HISTORY_DEFAULT_LIMIT));
  const csvRows = (args.readings ?? []).filter(
    (r) => r && r.source === IMPORTED_SENSOR_HISTORY_SOURCE,
  );

  if (csvRows.length === 0) {
    return {
      isEmpty: true,
      totalCount: 0,
      earliestCapturedAt: null,
      latestCapturedAt: null,
      metrics: [],
      recentRows: [],
    };
  }

  const metricsSet = new Set<string>();
  let minMs: number | null = null;
  let maxMs: number | null = null;
  for (const r of csvRows) {
    if (r.metric && typeof r.metric === "string") metricsSet.add(r.metric);
    const iso = pickCapturedAt(r);
    if (iso == null) continue;
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) continue;
    if (minMs === null || ms < minMs) minMs = ms;
    if (maxMs === null || ms > maxMs) maxMs = ms;
  }

  // Deterministic sort: latest captured_at first, ties broken by metric asc.
  const sorted = [...csvRows].sort((a, b) => {
    const aMs = Date.parse(pickCapturedAt(a) ?? "") || 0;
    const bMs = Date.parse(pickCapturedAt(b) ?? "") || 0;
    if (aMs !== bMs) return bMs - aMs;
    return (a.metric ?? "").localeCompare(b.metric ?? "");
  });

  const recentRows: ImportedSensorHistoryDisplayRow[] = [];
  for (const r of sorted) {
    if (recentRows.length >= limit) break;
    const capturedAt = pickCapturedAt(r);
    if (capturedAt == null) continue;
    if (!r.metric) continue;
    recentRows.push({
      capturedAt,
      metric: r.metric,
      value: typeof r.value === "number" && Number.isFinite(r.value) ? r.value : null,
    });
  }

  return {
    isEmpty: false,
    totalCount: csvRows.length,
    earliestCapturedAt: minMs !== null ? new Date(minMs).toISOString() : null,
    latestCapturedAt: maxMs !== null ? new Date(maxMs).toISOString() : null,
    metrics: Array.from(metricsSet).sort(),
    recentRows,
  };
}

export const IMPORTED_SENSOR_HISTORY_ANCHOR_ID = "imported-history" as const;
export const IMPORTED_SENSOR_HISTORY_EMPTY_COPY =
  "No imported CSV sensor history for this tent yet." as const;
export const IMPORTED_SENSOR_HISTORY_NOT_LIVE_COPY = "Not live data" as const;
