/**
 * importedSensorHistoryViewModel
 *
 * Pure read-only view model for the Tent Detail "Imported sensor history"
 * panel. Given the tent's loaded sensor readings, it filters to the
 * CSV-imported subset and summarizes count / earliest / latest / metrics
 * plus a capped list of safe display rows. Supports a local, read-only
 * metric filter (no query params, no new fetches).
 *
 * Safety contract:
 *   - Only rows with `source === "csv"` are surfaced.
 *   - `raw_payload` is NEVER read, returned, or referenced.
 *   - No automation, no alerts, no Action Queue, no AI calls.
 *   - Deterministic ordering (captured_at desc, ties broken by metric asc).
 *   - Stable, null-safe output shape — usable from JSX without
 *     additional transforms.
 */

export const IMPORTED_SENSOR_HISTORY_SOURCE = "csv" as const;
export const IMPORTED_SENSOR_HISTORY_DEFAULT_LIMIT = 25;
export const IMPORTED_SENSOR_HISTORY_ALL_METRICS = "all" as const;

export type ImportedSensorHistoryMetricFilter =
  | typeof IMPORTED_SENSOR_HISTORY_ALL_METRICS
  | string;

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

export interface ImportedSensorHistoryMetricOption {
  /** Stable id used as selection value. "all" for the all-metrics option. */
  id: ImportedSensorHistoryMetricFilter;
  /** Display label. */
  label: string;
  /** Count of CSV rows matching this option (across the full imported set). */
  count: number;
}

export interface ImportedSensorHistoryViewModel {
  isEmpty: boolean;
  totalCount: number;
  /** Count of rows matching the active metric filter (across full set). */
  visibleCount: number;
  earliestCapturedAt: string | null;
  latestCapturedAt: string | null;
  metrics: string[];
  metricOptions: ImportedSensorHistoryMetricOption[];
  selectedMetric: ImportedSensorHistoryMetricFilter;
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

function normalizeSelected(
  selected: ImportedSensorHistoryMetricFilter | null | undefined,
  metrics: string[],
): ImportedSensorHistoryMetricFilter {
  if (
    !selected ||
    selected === IMPORTED_SENSOR_HISTORY_ALL_METRICS ||
    !metrics.includes(selected)
  ) {
    return IMPORTED_SENSOR_HISTORY_ALL_METRICS;
  }
  return selected;
}

export function buildImportedSensorHistoryViewModel(args: {
  readings: ReadonlyArray<ImportedSensorHistoryInputRow>;
  limit?: number;
  selectedMetric?: ImportedSensorHistoryMetricFilter | null;
}): ImportedSensorHistoryViewModel {
  const limit = Math.max(
    1,
    Math.floor(args.limit ?? IMPORTED_SENSOR_HISTORY_DEFAULT_LIMIT),
  );
  const csvRows = (args.readings ?? []).filter(
    (r) => r && r.source === IMPORTED_SENSOR_HISTORY_SOURCE,
  );

  if (csvRows.length === 0) {
    return {
      isEmpty: true,
      totalCount: 0,
      visibleCount: 0,
      earliestCapturedAt: null,
      latestCapturedAt: null,
      metrics: [],
      metricOptions: [],
      selectedMetric: IMPORTED_SENSOR_HISTORY_ALL_METRICS,
      recentRows: [],
    };
  }

  const metricsSet = new Set<string>();
  const metricCounts = new Map<string, number>();
  let minMs: number | null = null;
  let maxMs: number | null = null;
  for (const r of csvRows) {
    if (r.metric && typeof r.metric === "string") {
      metricsSet.add(r.metric);
      metricCounts.set(r.metric, (metricCounts.get(r.metric) ?? 0) + 1);
    }
    const iso = pickCapturedAt(r);
    if (iso == null) continue;
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) continue;
    if (minMs === null || ms < minMs) minMs = ms;
    if (maxMs === null || ms > maxMs) maxMs = ms;
  }

  const metrics = Array.from(metricsSet).sort();
  const selectedMetric = normalizeSelected(args.selectedMetric, metrics);

  const metricOptions: ImportedSensorHistoryMetricOption[] = [
    {
      id: IMPORTED_SENSOR_HISTORY_ALL_METRICS,
      label: "All metrics",
      count: csvRows.length,
    },
    ...metrics.map((m) => ({
      id: m,
      label: m,
      count: metricCounts.get(m) ?? 0,
    })),
  ];

  const matchingRows =
    selectedMetric === IMPORTED_SENSOR_HISTORY_ALL_METRICS
      ? csvRows
      : csvRows.filter((r) => r.metric === selectedMetric);

  // Deterministic sort: latest captured_at first, ties broken by metric asc.
  const sorted = [...matchingRows].sort((a, b) => {
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
    visibleCount: matchingRows.length,
    earliestCapturedAt: minMs !== null ? new Date(minMs).toISOString() : null,
    latestCapturedAt: maxMs !== null ? new Date(maxMs).toISOString() : null,
    metrics,
    metricOptions,
    selectedMetric,
    recentRows,
  };
}

export const IMPORTED_SENSOR_HISTORY_ANCHOR_ID = "imported-history" as const;
export const IMPORTED_SENSOR_HISTORY_EMPTY_COPY =
  "No imported CSV sensor history for this tent yet." as const;
export const IMPORTED_SENSOR_HISTORY_NOT_LIVE_COPY = "Not live data" as const;
