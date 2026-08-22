/**
 * Owner-scoped, read-only account data used by Operator Mode and the MCP
 * surface. Callers must provide an authenticated Supabase client so every
 * query remains subject to the signed-in grower's RLS policies.
 *
 * This module never accepts a user id, never writes, and never returns raw
 * sensor provenance. Grow and tent visibility are checked before child rows
 * are queried because some operator-role table policies are intentionally
 * broader than this own-account read model.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../integrations/supabase/types";
import { LIVE_SOURCE_TRUTH_DEFAULT_TOLERANCES } from "./liveSourceTruthGateRules";
import { classifySnapshotFreshness } from "./sensor/sensorSnapshotFreshnessRules";
import { normalizeSensorSource } from "./sensor/sensorSourceRules";
import { withoutDiagnosticSensorRows } from "./sensorProvenanceFenceRules";
import { STALE_THRESHOLD_MS } from "./sensorReadingNormalizationRules";
import { celsiusToFahrenheit } from "./temperatureUnits";
import {
  validateEcWithUnit,
  validateHumidity,
  validatePh,
  validateTempC,
} from "./sensorValidation";
import { selectWithRetractionCompat } from "./quick-log/retractionFilterCompat";

export interface OperatorRecentDiaryEntry {
  id: string;
  grow_id: string;
  plant_id: string | null;
  tent_id: string | null;
  stage: string | null;
  note: string;
  entry_at: string;
  created_at: string;
}

export interface OperatorOwnedTent {
  id: string;
  name: string;
  grow_id: string | null;
}

export interface McpSensorQueryRow {
  id: string;
  tent_id: string;
  metric: string;
  value: number;
  quality: string;
  source: string;
  ts: string;
  captured_at: string | null;
  /** Query-only tie-break value. Never copied into a public reading. */
  created_at?: string | null;
  /** Classification-only provenance. Never copied into a public reading. */
  raw_payload?: unknown;
}

export type McpSensorFreshness = "fresh" | "stale" | "invalid";

export interface McpSensorReading {
  id: string;
  tent_id: string;
  metric: string;
  value: number;
  quality: string;
  source: string;
  ts: string;
  captured_at: string | null;
  freshness: McpSensorFreshness;
  current_live: boolean;
}

export type OwnerScopedReadModelResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      reason: "not_found" | "unavailable";
      message: string;
    };

export const OPERATOR_SENSOR_METRICS = [
  "temperature_c",
  "humidity_pct",
  "vpd_kpa",
  "co2_ppm",
  "soil_moisture_pct",
  "soil_temp_c",
  "ph",
  "ec",
  "ppfd",
] as const;

export interface McpSensorSelectionOptions {
  now?: Date;
  staleAfterMs?: number;
}

type OwnerScopedSupabaseClient = SupabaseClient<Database>;

const DIARY_COLUMNS = "id,grow_id,plant_id,tent_id,stage,note,entry_at,created_at" as const;
const SENSOR_COLUMNS =
  "id,tent_id,metric,value,quality,source,ts,captured_at,created_at,raw_payload" as const;
const SENSOR_CANDIDATE_LIMIT = 25;
const KNOWN_METRIC_SET: ReadonlySet<string> = new Set(OPERATOR_SENSOR_METRICS);
/** Match the existing bounded sensor-snapshot cohort window. */
const SENSOR_SOURCE_CONTRADICTION_WINDOW_MS = 5 * 60 * 1000;
// PPFD is not a Live Source Truth gate metric. Keep its source-conflict
// deadband aligned with the established outcome-analysis PPFD tolerance.
const PPFD_SOURCE_CONTRADICTION_TOLERANCE = 50;

/**
 * Reuse Verdant's source-truth comparator tolerances. Stored temperatures are
 * Celsius, while the source-truth gate compares temperatures in Fahrenheit.
 * PPFD is not a source-truth metric, so it uses the established
 * outcome-analysis deadband in the same canonical unit.
 */
const MCP_SENSOR_SOURCE_CONTRADICTION_TOLERANCE: Readonly<
  Record<(typeof OPERATOR_SENSOR_METRICS)[number], number>
> = Object.freeze({
  temperature_c: LIVE_SOURCE_TRUTH_DEFAULT_TOLERANCES.temp_f,
  humidity_pct: LIVE_SOURCE_TRUTH_DEFAULT_TOLERANCES.humidity_pct,
  vpd_kpa: LIVE_SOURCE_TRUTH_DEFAULT_TOLERANCES.vpd_kpa,
  co2_ppm: LIVE_SOURCE_TRUTH_DEFAULT_TOLERANCES.co2_ppm,
  soil_moisture_pct: LIVE_SOURCE_TRUTH_DEFAULT_TOLERANCES.soil_moisture_pct,
  soil_temp_c: LIVE_SOURCE_TRUTH_DEFAULT_TOLERANCES.soil_temp_f,
  ph: LIVE_SOURCE_TRUTH_DEFAULT_TOLERANCES.ph,
  ec: LIVE_SOURCE_TRUTH_DEFAULT_TOLERANCES.soil_ec_ms_cm,
  ppfd: PPFD_SOURCE_CONTRADICTION_TOLERANCE,
});

function normalizeDiaryLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return 10;
  return Math.min(50, Math.max(1, Math.trunc(limit as number)));
}

export async function listRecentDiaryEntriesForOwnedGrow(
  client: OwnerScopedSupabaseClient,
  growId: string,
  limit?: number,
): Promise<OwnerScopedReadModelResult<{ entries: OperatorRecentDiaryEntry[] }>> {
  const { data: grow, error: growError } = await client
    .from("grows")
    .select("id")
    .eq("id", growId)
    .maybeSingle();

  if (growError) {
    return { ok: false, reason: "unavailable", message: growError.message };
  }
  if (!grow) {
    return {
      ok: false,
      reason: "not_found",
      message: "Grow not found for the signed-in grower.",
    };
  }

  // Deterministic: entry_at DESC, created_at DESC, id DESC (unique tie-breaker).
  const { data, error } = await selectWithRetractionCompat((withRetractionFilter) => {
    let query = client.from("diary_entries").select(DIARY_COLUMNS).eq("grow_id", growId);
    if (withRetractionFilter) query = query.is("retracted_at", null);
    return query
      .order("entry_at", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(normalizeDiaryLimit(limit));
  });

  if (error) {
    return { ok: false, reason: "unavailable", message: error.message };
  }

  return {
    ok: true,
    data: { entries: (data ?? []) satisfies OperatorRecentDiaryEntry[] },
  };
}

/**
 * Return recent diary rows that are explicitly linked to one tent in an owned
 * grow. The tent relation is checked before child rows are queried so a stale
 * or forged client selection cannot broaden the read.
 */
export async function listRecentDiaryEntriesForOwnedTent(
  client: OwnerScopedSupabaseClient,
  growId: string,
  tentId: string,
  limit?: number,
): Promise<OwnerScopedReadModelResult<{ entries: OperatorRecentDiaryEntry[] }>> {
  const { data: grow, error: growError } = await client
    .from("grows")
    .select("id")
    .eq("id", growId)
    .maybeSingle();

  if (growError) {
    return { ok: false, reason: "unavailable", message: growError.message };
  }
  if (!grow) {
    return {
      ok: false,
      reason: "not_found",
      message: "Grow not found for the signed-in grower.",
    };
  }

  const { data: tent, error: tentError } = await client
    .from("tents")
    .select("id")
    .eq("id", tentId)
    .eq("grow_id", growId)
    .maybeSingle();

  if (tentError) {
    return { ok: false, reason: "unavailable", message: tentError.message };
  }
  if (!tent) {
    return {
      ok: false,
      reason: "not_found",
      message: "Tent not found in this grow for the signed-in grower.",
    };
  }

  // Deterministic: entry_at DESC, created_at DESC, id DESC (unique tie-breaker).
  const { data, error } = await client
    .from("diary_entries")
    .select(DIARY_COLUMNS)
    .eq("grow_id", growId)
    .eq("tent_id", tentId)
    .order("entry_at", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(normalizeDiaryLimit(limit));

  if (error) {
    return { ok: false, reason: "unavailable", message: error.message };
  }

  return {
    ok: true,
    data: { entries: (data ?? []) satisfies OperatorRecentDiaryEntry[] },
  };
}

function parseTimestamp(value: string | null | undefined): number {
  if (typeof value !== "string") return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

/** Effective capture time under SQL COALESCE(captured_at, ts) semantics. */
function effectiveCaptureMs(row: McpSensorQueryRow): number {
  return parseTimestamp(row.captured_at ?? row.ts);
}

function normalizedLabel(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "invalid";
}

/**
 * Fail-closed plausibility gate for the long-format metrics exposed here.
 * Values remain visible as explicitly invalid context, but can never inherit
 * a healthy/current-live label from otherwise optimistic stored metadata.
 */
function isPlausibleMcpSensorValue(row: McpSensorQueryRow): boolean {
  if (!Number.isFinite(row.value)) return false;

  switch (row.metric) {
    case "temperature_c":
    case "soil_temp_c":
      return validateTempC(row.value) === null;
    case "humidity_pct":
      return validateHumidity(row.value) === null;
    case "vpd_kpa":
      return row.value >= 0 && row.value <= 10;
    case "co2_ppm":
      return row.value >= 0 && row.value <= 5_000;
    case "soil_moisture_pct":
      return row.value > 0 && row.value < 100;
    case "ph":
      return validatePh(row.value) === null;
    case "ec":
      return validateEcWithUnit(row.value, "mS/cm") === null;
    case "ppfd":
      return row.value >= 0;
    default:
      return false;
  }
}

function deriveMcpFreshness(
  row: McpSensorQueryRow,
  nowMs: number,
  staleAfterMs: number,
): McpSensorFreshness {
  const source = normalizedLabel(row.source);
  const quality = normalizedLabel(row.quality);
  if (source === "invalid" || quality === "invalid") return "invalid";
  if (source === "stale" || quality === "stale") return "stale";
  if (!isPlausibleMcpSensorValue(row)) return "invalid";

  const capturedAt = row.captured_at ?? row.ts;
  if (!Number.isFinite(nowMs)) return "invalid";
  return classifySnapshotFreshness(
    {
      // Freshness is timestamp truth, not a relabeling of legacy provider
      // sources. Source/quality trust is handled above and `current_live`
      // remains strict below, so use a non-live canonical source only to
      // reuse the shared malformed/future/stale time classifier.
      source: "manual",
      captured_at: capturedAt,
      tent_id: row.tent_id,
      metrics: {},
    },
    { now: nowMs, freshnessMs: staleAfterMs },
  ).freshness;
}

/**
 * Deterministic newest-row comparison:
 * effective capture, then ingest ts, then created_at, then id (all DESC).
 */
function newerReading(a: McpSensorQueryRow, b: McpSensorQueryRow): McpSensorQueryRow {
  const comparisons: ReadonlyArray<readonly [number, number]> = [
    [effectiveCaptureMs(a), effectiveCaptureMs(b)],
    [parseTimestamp(a.ts), parseTimestamp(b.ts)],
    [parseTimestamp(a.created_at), parseTimestamp(b.created_at)],
  ];

  for (const [left, right] of comparisons) {
    if (left !== right) return left > right ? a : b;
  }
  return a.id >= b.id ? a : b;
}

function sensorSelectionClock(options: McpSensorSelectionOptions): {
  readonly nowMs: number;
  readonly staleAfterMs: number;
} {
  const nowMs = (options.now ?? new Date()).getTime();
  const requestedStaleAfterMs = options.staleAfterMs ?? STALE_THRESHOLD_MS;
  return {
    nowMs,
    staleAfterMs:
      Number.isFinite(requestedStaleAfterMs) && requestedStaleAfterMs >= 0
        ? requestedStaleAfterMs
        : STALE_THRESHOLD_MS,
  };
}

function comparableMcpSensorValue(metric: string, value: number): number {
  return metric === "temperature_c" || metric === "soil_temp_c"
    ? celsiusToFahrenheit(value)
    : value;
}

function hasMaterialMcpSensorSourceConflict(
  metric: (typeof OPERATOR_SENSOR_METRICS)[number],
  candidates: readonly McpSensorQueryRow[],
): boolean {
  const values = candidates.map((candidate) => comparableMcpSensorValue(metric, candidate.value));
  const spread = Math.max(...values) - Math.min(...values);
  return spread > MCP_SENSOR_SOURCE_CONTRADICTION_TOLERANCE[metric];
}

/**
 * Find coeval, usable readings for one metric that disagree across canonical
 * sources before the public snapshot collapses candidates to its newest row.
 *
 * The result intentionally contains metric keys only: source/value candidates
 * remain query-only provenance and are never returned to MCP consumers.
 */
export function findMcpSensorSourceContradictionMetrics(
  rows: readonly McpSensorQueryRow[] | null | undefined,
  options: McpSensorSelectionOptions = {},
): readonly string[] {
  const { nowMs, staleAfterMs } = sensorSelectionClock(options);
  const latestByMetricAndSource = new Map<string, Map<string, McpSensorQueryRow>>();

  for (const row of withoutDiagnosticSensorRows(rows)) {
    if (!KNOWN_METRIC_SET.has(row.metric) || !isPlausibleMcpSensorValue(row)) continue;
    const source = normalizeSensorSource(row.source);
    // Demo, stale, invalid, and unknown sources cannot corroborate or
    // contradict current evidence. Manual/csv remain useful but never live.
    if (source !== "live" && source !== "manual" && source !== "csv") continue;
    if (deriveMcpFreshness(row, nowMs, staleAfterMs) !== "fresh") continue;
    if (!Number.isFinite(effectiveCaptureMs(row))) continue;

    const bySource = latestByMetricAndSource.get(row.metric) ?? new Map();
    const existing = bySource.get(source);
    bySource.set(source, existing ? newerReading(existing, row) : row);
    latestByMetricAndSource.set(row.metric, bySource);
  }

  return Object.freeze(
    OPERATOR_SENSOR_METRICS.filter((metric) => {
      const bySource = latestByMetricAndSource.get(metric);
      if (!bySource || bySource.size < 2) return false;
      const candidates = [...bySource.values()];
      const newestAt = Math.max(...candidates.map(effectiveCaptureMs));
      const coeval = candidates.filter(
        (candidate) =>
          newestAt - effectiveCaptureMs(candidate) <= SENSOR_SOURCE_CONTRADICTION_WINDOW_MS,
      );
      return coeval.length >= 2 && hasMaterialMcpSensorSourceConflict(metric, coeval);
    }),
  );
}

/**
 * Select the newest eligible row per supported metric and strip query-only
 * provenance/tie-break fields before returning it to a consumer.
 */
export function selectLatestMcpSensorReadings(
  rows: readonly McpSensorQueryRow[] | null | undefined,
  options: McpSensorSelectionOptions = {},
): Record<string, McpSensorReading> {
  const { nowMs, staleAfterMs } = sensorSelectionClock(options);
  const selected: Record<string, McpSensorQueryRow> = {};

  for (const row of withoutDiagnosticSensorRows(rows)) {
    if (!row || !KNOWN_METRIC_SET.has(row.metric)) continue;
    const current = selected[row.metric];
    selected[row.metric] = current ? newerReading(current, row) : row;
  }

  return Object.fromEntries(
    Object.entries(selected).map(([metric, row]) => {
      const freshness = deriveMcpFreshness(row, nowMs, staleAfterMs);
      return [
        metric,
        {
          id: row.id,
          tent_id: row.tent_id,
          metric: row.metric,
          value: row.value,
          quality: row.quality,
          source: row.source,
          ts: row.ts,
          captured_at: row.captured_at,
          freshness,
          current_live:
            freshness === "fresh" &&
            normalizedLabel(row.source) === "live" &&
            normalizedLabel(row.quality) === "ok",
        } satisfies McpSensorReading,
      ];
    }),
  );
}

export async function getLatestSensorSnapshotForOwnedTent(
  client: OwnerScopedSupabaseClient,
  tentId: string,
  options: McpSensorSelectionOptions = {},
): Promise<
  OwnerScopedReadModelResult<{
    tent: OperatorOwnedTent;
    snapshot: null | { tentId: string; readings: Record<string, McpSensorReading> };
    /** Internal source-conflict receipt for conservative evidence consumers. */
    contradictionMetrics?: readonly string[];
  }>
> {
  const { data: tent, error: tentError } = await client
    .from("tents")
    .select("id,name,grow_id")
    .eq("id", tentId)
    .maybeSingle();

  if (tentError) {
    return { ok: false, reason: "unavailable", message: tentError.message };
  }
  if (!tent) {
    return {
      ok: false,
      reason: "not_found",
      message: "Tent not found for the signed-in grower.",
    };
  }

  // Fetch captured and legacy-null-captured candidates separately for every
  // supported metric. Their union contains the true COALESCE winner, while a
  // bounded window still lets the provenance fence skip newer diagnostics.
  const results = await Promise.all(
    OPERATOR_SENSOR_METRICS.flatMap((metric) => [
      client
        .from("sensor_readings")
        .select(SENSOR_COLUMNS)
        .eq("tent_id", tentId)
        .eq("metric", metric)
        .not("captured_at", "is", null)
        .order("captured_at", { ascending: false })
        .order("ts", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(SENSOR_CANDIDATE_LIMIT),
      client
        .from("sensor_readings")
        .select(SENSOR_COLUMNS)
        .eq("tent_id", tentId)
        .eq("metric", metric)
        .is("captured_at", null)
        .order("ts", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(SENSOR_CANDIDATE_LIMIT),
    ]),
  );

  const failed = results.find((result) => result.error);
  if (failed?.error) {
    return { ok: false, reason: "unavailable", message: failed.error.message };
  }

  const candidates = results.flatMap((result) =>
    Array.isArray(result.data) ? (result.data as McpSensorQueryRow[]) : [],
  );
  const readings = selectLatestMcpSensorReadings(candidates, options);
  const contradictionMetrics = findMcpSensorSourceContradictionMetrics(candidates, options);
  const ownedTent: OperatorOwnedTent = {
    id: tent.id,
    name: tent.name,
    grow_id: tent.grow_id,
  };

  return {
    ok: true,
    data: {
      tent: ownedTent,
      snapshot:
        Object.keys(readings).length === 0
          ? null
          : {
              tentId,
              readings,
            },
      ...(contradictionMetrics.length > 0 ? { contradictionMetrics } : {}),
    },
  };
}
