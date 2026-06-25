/**
 * aiDoctorCsvHistoryContextRules — pure helper that summarizes
 * imported CSV sensor history (source = "csv") for AI Doctor context.
 *
 * Hard constraints:
 *  - Pure. No I/O, no React, no Supabase, no automation.
 *  - Read-only context enrichment. NEVER creates alerts or
 *    Action Queue items. NEVER promotes CSV rows to "live".
 *  - Returns only safe summaries: vendor labels, date range,
 *    per-metric min/max/avg/count, total readings, suspicious flag
 *    count. Never returns device serials, bridge tokens, raw rows,
 *    internal IDs, source file names, or any other raw_payload field.
 *  - Vendor labels are derived through the shared lineage helper so
 *    new vendors only need to be added in one place.
 *  - AI Doctor consumers must render the historicalLabel and
 *    notForLiveDiagnosis caveat verbatim.
 */

import { getCsvVendorLineage } from "@/lib/sensorReadingVendorLineage";

export const AI_DOCTOR_CSV_HISTORY_LABEL = "CSV history";
export const AI_DOCTOR_CSV_HISTORY_NOT_LIVE_NOTE =
  "This is imported CSV history, not live telemetry. Do not diagnose from CSV history alone.";

/** Vendor display names AI Doctor is allowed to surface. */
const VERDANT_XLSX_LABEL = "Verdant Genetics XLSX";

export interface CsvHistorySensorRowLike {
  metric?: string | null;
  value?: number | string | null;
  unit?: string | null;
  captured_at?: string | null;
  ts?: string | null;
  source?: string | null;
  raw_payload?: unknown;
}

export interface CsvHistoryMetricSummary {
  metric: string;
  unit: string | null;
  count: number;
  min: number;
  max: number;
  avg: number;
}

export interface CsvHistoryVendorSummary {
  /** Stable source-app key from raw_payload.source_app. */
  sourceApp: string;
  /** Safe human label (e.g. "Spider Farmer", "Verdant Genetics XLSX"). */
  vendorLabel: string;
  count: number;
}

export interface AiDoctorCsvHistoryContext {
  /** True only when at least one CSV row contributed. */
  hasCsvHistory: boolean;
  /** Constant marker string AI Doctor renders verbatim. */
  historicalLabel: typeof AI_DOCTOR_CSV_HISTORY_LABEL;
  /** Constant caveat AI Doctor renders verbatim. */
  notForLiveDiagnosis: typeof AI_DOCTOR_CSV_HISTORY_NOT_LIVE_NOTE;
  totalReadings: number;
  dateRange: { earliest: string; latest: string } | null;
  vendors: readonly CsvHistoryVendorSummary[];
  metrics: readonly CsvHistoryMetricSummary[];
  suspiciousFlagCount: number;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function toFiniteNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function vendorLabelFor(row: CsvHistorySensorRowLike): {
  sourceApp: string;
  vendorLabel: string;
} | null {
  // Shared CSV lineage helper handles Spider Farmer / Vivosun / AC Infinity.
  const lineage = getCsvVendorLineage({
    source: row.source ?? null,
    raw_payload: row.raw_payload,
  });
  if (lineage) {
    return { sourceApp: lineage.sourceApp, vendorLabel: lineage.vendorLabel };
  }
  // Verdant Genetics XLSX uses source = "csv" + raw_payload.source_app key
  // that the shared lineage helper does not enumerate (vendor-neutral file).
  const payload = asRecord(row.raw_payload);
  const sourceApp =
    typeof payload?.source_app === "string"
      ? payload.source_app.trim().toLowerCase()
      : "";
  if (sourceApp === "verdant_genetics_xlsx") {
    return {
      sourceApp: "verdant_genetics_xlsx",
      vendorLabel: VERDANT_XLSX_LABEL,
    };
  }
  return null;
}

function isSuspicious(row: CsvHistorySensorRowLike): boolean {
  const payload = asRecord(row.raw_payload);
  if (!payload) return false;
  if (payload.suspicious === true) return true;
  const flags = payload.suspicious_flags;
  if (Array.isArray(flags) && flags.length > 0) return true;
  return false;
}

function isCsvRow(row: CsvHistorySensorRowLike): boolean {
  if (row.source === "csv") return true;
  const payload = asRecord(row.raw_payload);
  return payload?.csv_import === true;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export interface BuildAiDoctorCsvHistoryContextInput {
  rows: ReadonlyArray<CsvHistorySensorRowLike> | null | undefined;
}

/**
 * Build a deterministic CSV-history summary for AI Doctor context.
 * Returns hasCsvHistory=false when no CSV rows are present.
 */
export function buildAiDoctorCsvHistoryContext(
  input: BuildAiDoctorCsvHistoryContextInput,
): AiDoctorCsvHistoryContext {
  const empty: AiDoctorCsvHistoryContext = {
    hasCsvHistory: false,
    historicalLabel: AI_DOCTOR_CSV_HISTORY_LABEL,
    notForLiveDiagnosis: AI_DOCTOR_CSV_HISTORY_NOT_LIVE_NOTE,
    totalReadings: 0,
    dateRange: null,
    vendors: Object.freeze([]),
    metrics: Object.freeze([]),
    suspiciousFlagCount: 0,
  };
  const rows = Array.isArray(input?.rows) ? input.rows : [];
  if (rows.length === 0) return empty;

  let total = 0;
  let suspicious = 0;
  let earliestMs = Number.POSITIVE_INFINITY;
  let latestMs = Number.NEGATIVE_INFINITY;
  let earliestIso: string | null = null;
  let latestIso: string | null = null;

  const vendorCounts = new Map<
    string,
    { sourceApp: string; vendorLabel: string; count: number }
  >();
  const metricAccum = new Map<
    string,
    { metric: string; unit: string | null; values: number[] }
  >();

  for (const row of rows) {
    if (!row || !isCsvRow(row)) continue;
    const capturedAt =
      typeof row.captured_at === "string"
        ? row.captured_at
        : typeof row.ts === "string"
          ? row.ts
          : null;
    if (!capturedAt) continue;
    const t = Date.parse(capturedAt);
    if (!Number.isFinite(t)) continue;

    total += 1;
    if (t < earliestMs) {
      earliestMs = t;
      earliestIso = capturedAt;
    }
    if (t > latestMs) {
      latestMs = t;
      latestIso = capturedAt;
    }
    if (isSuspicious(row)) suspicious += 1;

    const vendor = vendorLabelFor(row);
    if (vendor) {
      const existing = vendorCounts.get(vendor.sourceApp);
      if (existing) existing.count += 1;
      else vendorCounts.set(vendor.sourceApp, { ...vendor, count: 1 });
    }

    const metric = typeof row.metric === "string" ? row.metric : null;
    const value = toFiniteNumber(row.value);
    if (metric && value !== null) {
      const bucket = metricAccum.get(metric);
      if (bucket) bucket.values.push(value);
      else
        metricAccum.set(metric, {
          metric,
          unit: row.unit ?? null,
          values: [value],
        });
    }
  }

  if (total === 0) return empty;

  const vendors: CsvHistoryVendorSummary[] = [...vendorCounts.values()].sort(
    (a, b) =>
      b.count - a.count ||
      (a.vendorLabel < b.vendorLabel
        ? -1
        : a.vendorLabel > b.vendorLabel
          ? 1
          : 0),
  );

  const metrics: CsvHistoryMetricSummary[] = [...metricAccum.values()]
    .map((b) => {
      const sum = b.values.reduce((a, c) => a + c, 0);
      return {
        metric: b.metric,
        unit: b.unit,
        count: b.values.length,
        min: round3(Math.min(...b.values)),
        max: round3(Math.max(...b.values)),
        avg: round3(sum / b.values.length),
      };
    })
    .sort((a, b) => (a.metric < b.metric ? -1 : a.metric > b.metric ? 1 : 0));

  return {
    hasCsvHistory: true,
    historicalLabel: AI_DOCTOR_CSV_HISTORY_LABEL,
    notForLiveDiagnosis: AI_DOCTOR_CSV_HISTORY_NOT_LIVE_NOTE,
    totalReadings: total,
    dateRange:
      earliestIso && latestIso
        ? { earliest: earliestIso, latest: latestIso }
        : null,
    vendors: Object.freeze(vendors),
    metrics: Object.freeze(metrics),
    suspiciousFlagCount: suspicious,
  };
}
