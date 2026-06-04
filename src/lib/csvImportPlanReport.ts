/**
 * csvImportPlanReport — pure helpers for the "Download Import Plan" export
 * and the blocked-row reason taxonomy shown in the disabled review UI.
 *
 * Hard constraints (Safe-by-Design):
 *  - No I/O. No Supabase. No Edge Functions. No network calls of any kind.
 *  - No writes. No alerts. No Action Queue. No AI. No automation.
 *    No device control. Pure data shaping only.
 *  - Never echoes secrets / tokens / auth / user_id / service role keys /
 *    bridge tokens / internal IDs.
 *  - Never includes full raw sensor rows by default.
 */

import type {
  CsvImportPlan,
  HardBlockReason,
  RowBlockReason,
  SensorWriteDraft,
} from "@/lib/csvImportPlanRules";

export const CSV_IMPORT_PLAN_REPORT_VERSION = "csv_import_plan_v1" as const;

export const CSV_IMPORT_PLAN_STATUS_LABEL =
  "Review-only — nothing saved. Preview only." as const;

export const CSV_IMPORT_PLAN_SAFETY_NOTE = [
  "No save.",
  "No live data.",
  "No automation.",
  "No device control.",
  "No alerts.",
  "No Action Queue writes.",
] as const;

export const SENSOR_SAMPLE_MAX = 10;
export const BLOCKED_SAMPLE_PER_REASON_MAX = 3;

/** Plain-language explanation + suggested fix for each blocked-row reason. */
export const BLOCKED_REASON_EXPLANATIONS: Record<
  RowBlockReason | "ph_out_of_range" | "humidity_stuck" | "vwc_stuck"
    | "ec_unit_ambiguous" | "lux_not_ppfd" | "temp_unit_ambiguous",
  { title: string; explanation: string; fix: string }
> = {
  unparseable_captured_at: {
    title: "Invalid date/time",
    explanation:
      "The timestamp column could not be read as a real date. Common causes: blank cells, free-text notes, or a non-standard date format.",
    fix: "Use ISO-8601 timestamps like 2026-06-01T10:00:00Z (or your exporter's standard date column).",
  },
  captured_at_before_2020: {
    title: "Timestamp too old",
    explanation:
      "The reading's timestamp is before 2020-01-01. That is almost always a clock or formatting bug, not real telemetry.",
    fix: "Check the exporter's timezone and clock; re-export with current timestamps.",
  },
  captured_at_future: {
    title: "Timestamp in the future",
    explanation:
      "The reading is dated more than a few minutes in the future. That is usually a misconfigured timezone or clock.",
    fix: "Set the device clock and timezone correctly, then re-export.",
  },
  unknown_metric: {
    title: "Unknown metric",
    explanation:
      "The column was mapped to a metric Verdant does not yet recognize as a sensor reading.",
    fix: "Map the column to one of: temperature, humidity, vpd, co2, vwc, ec, substrate_temperature, ph, ppfd. Otherwise the column will be ignored.",
  },
  non_numeric_value: {
    title: "Non-numeric value",
    explanation:
      "The cell could not be parsed as a number. Blanks, dashes, and units inside the cell are common causes.",
    fix: "Remove non-numeric characters or leave the cell empty.",
  },
  hard_flag: {
    title: "Suspicious / unsafe value (hard flag)",
    explanation:
      "The row triggered a hard sensor-truth flag (for example pH out of range, lux mistaken for PPFD, or EC unit ambiguity). Verdant blocks these to keep your grow log honest.",
    fix: "Check the sensor's units and calibration, then re-export. See individual flag explanations below for specifics.",
  },
  ph_out_of_range: {
    title: "pH out of range",
    explanation:
      "pH values outside roughly 3.0–9.0 are almost always a unit/decimal-place error, not real water chemistry.",
    fix: "Confirm the column is pH (not mV) and that the decimal point is correct.",
  },
  humidity_stuck: {
    title: "Humidity stuck",
    explanation:
      "Humidity reads exactly the same value (often 100%) for many rows in a row. That usually means the sensor has condensation or has failed.",
    fix: "Dry/replace the humidity sensor; re-export once readings vary again.",
  },
  vwc_stuck: {
    title: "Volumetric water content stuck",
    explanation:
      "Soil moisture reads the same value repeatedly. The probe may be unplugged, dry-fouled, or stuck.",
    fix: "Reseat or clean the VWC probe, then re-export.",
  },
  ec_unit_ambiguous: {
    title: "EC unit ambiguity",
    explanation:
      "EC values look like they could be in either mS/cm or µS/cm. Verdant will not guess and risk a 1000× error.",
    fix: "Convert the EC column to mS/cm before exporting.",
  },
  lux_not_ppfd: {
    title: "Lux exported as PPFD",
    explanation:
      "The column looks like a lux reading (often >10 000) but was mapped to PPFD. Lux and PPFD are not the same and cannot be auto-converted safely.",
    fix: "Map the column to lux (ignored) or use a real PAR sensor for PPFD.",
  },
  temp_unit_ambiguous: {
    title: "Temperature unit ambiguity",
    explanation:
      "Temperature values look like they could be Fahrenheit or Celsius. Verdant will not guess.",
    fix: "Convert the temperature column to °C before exporting.",
  },
};

export const HARD_BLOCK_EXPLANATIONS: Record<
  HardBlockReason,
  { title: string; explanation: string; fix: string }
> = {
  empty_file: { title: "Empty file", explanation: "The uploaded file contains no rows.", fix: "Re-export with at least one data row." },
  header_only: { title: "Header-only file", explanation: "The file has a header but no data rows.", fix: "Re-export including data." },
  demo_fixture: { title: "Demo fixture blocked", explanation: "Demo / sample fixtures are never imported.", fix: "Use your own exported CSV/TSV." },
  file_too_large: { title: "File too large", explanation: "The file exceeds the import size limit.", fix: "Split the export into smaller files." },
  row_count_exceeded: { title: "Too many rows", explanation: "The file exceeds the per-import row limit.", fix: "Split the export into smaller batches." },
  unauthenticated: { title: "Not signed in", explanation: "You must be signed in to import.", fix: "Sign in and try again." },
  missing_grow_context: { title: "No grow selected", explanation: "Pick the grow this import belongs to.", fix: "Select a grow." },
  missing_tent_context: { title: "No tent selected", explanation: "Pick the tent these readings belong to.", fix: "Select a tent." },
  unowned_grow: { title: "Grow not yours", explanation: "The selected grow is not owned by your account.", fix: "Select a grow you own." },
  unowned_tent: { title: "Tent not yours", explanation: "The selected tent is not owned by your account.", fix: "Select a tent you own." },
  unowned_plant: { title: "Plant not yours", explanation: "The selected plant is not owned by your account.", fix: "Select a plant you own." },
  plant_not_in_tent: { title: "Plant not in selected tent", explanation: "The plant does not belong to the selected tent/grow.", fix: "Pick a plant that lives in this tent." },
  tent_not_in_grow: { title: "Tent not in selected grow", explanation: "The tent does not belong to the selected grow.", fix: "Pick a tent that belongs to the grow." },
  excess_hard_flags: { title: "Too many suspicious rows", explanation: "More than 5% of rows have hard sensor-truth flags. The whole batch is blocked for safety.", fix: "Re-check the source data and re-export." },
  invalid_source: { title: "Invalid source", explanation: "Source must be CSV or TSV.", fix: "Re-upload as CSV or TSV." },
  invalid_clock: { title: "Invalid clock", explanation: "The import clock is invalid.", fix: "Reload the page and try again." },
};

// ---------------------------------------------------------------------------
// Sample sensor draft (compact, no raw_payload by default)
// ---------------------------------------------------------------------------

export interface SensorDraftSampleItem {
  metric: string;
  value: number;
  captured_at: string;
  source: string;
  quality: "ok" | "suspect";
  confidence: number;
  tent_id: string;
  plant_id: string | null;
  idempotency_key_prefix: string;
}

export function buildSensorDraftSample(
  drafts: readonly SensorWriteDraft[],
  limit: number = SENSOR_SAMPLE_MAX,
): SensorDraftSampleItem[] {
  const n = Math.max(0, Math.min(limit, drafts.length));
  const out: SensorDraftSampleItem[] = [];
  for (let i = 0; i < n; i++) {
    const d = drafts[i];
    out.push({
      metric: d.metric,
      value: d.value,
      captured_at: d.captured_at,
      source: d.source,
      quality: d.quality,
      confidence: d.raw_payload.confidence,
      tent_id: d.tent_id,
      plant_id: d.plant_id,
      idempotency_key_prefix: d.idempotency_key.slice(0, 12),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Blocked-row grouping (capped, with optional row context)
// ---------------------------------------------------------------------------

export interface BlockedRowContext {
  rowIndex: number;
  header?: string;
  attemptedMetric?: string;
  rawValue?: unknown;
}

export interface BlockedReasonGroup {
  reason: string;
  count: number;
  title: string;
  explanation: string;
  fix: string;
  samples: Array<BlockedRowContext & { reason: string }>;
}

export function groupBlockedRowsByReason(
  blockedRows: readonly { rowIndex: number; reasons: readonly string[] }[],
  contextByRow: ReadonlyMap<number, BlockedRowContext> = new Map(),
  perReasonLimit: number = BLOCKED_SAMPLE_PER_REASON_MAX,
): BlockedReasonGroup[] {
  const byReason = new Map<string, BlockedReasonGroup>();
  for (const row of blockedRows) {
    for (const reason of row.reasons) {
      let g = byReason.get(reason);
      if (!g) {
        const exp =
          (BLOCKED_REASON_EXPLANATIONS as Record<string, { title: string; explanation: string; fix: string }>)[reason] ??
          { title: reason, explanation: "Row blocked.", fix: "Review the source row." };
        g = { reason, count: 0, title: exp.title, explanation: exp.explanation, fix: exp.fix, samples: [] };
        byReason.set(reason, g);
      }
      g.count += 1;
      if (g.samples.length < perReasonLimit) {
        const ctx = contextByRow.get(row.rowIndex) ?? { rowIndex: row.rowIndex };
        g.samples.push({ ...ctx, reason });
      }
    }
  }
  return [...byReason.values()].sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// Import-plan report (Download Import Plan)
// ---------------------------------------------------------------------------

export interface BuildCsvImportPlanReportOptions {
  /** Either a fixed ISO string, a Date, or a clock function returning Date. */
  generatedAt?: string | Date | (() => Date);
  /** Alias for generatedAt as a clock function. Either works. */
  now?: Date | (() => Date);
  sensorSampleLimit?: number;
  blockedSamplePerReasonLimit?: number;
  blockedRowContext?: ReadonlyMap<number, BlockedRowContext>;
}

function resolveGeneratedAt(opts: BuildCsvImportPlanReportOptions | undefined): string {
  const src = opts?.generatedAt ?? opts?.now;
  if (typeof src === "string") return src;
  if (src instanceof Date) return src.toISOString();
  if (typeof src === "function") return src().toISOString();
  return new Date().toISOString();
}

export interface CsvImportPlanReport {
  reportVersion: typeof CSV_IMPORT_PLAN_REPORT_VERSION;
  statusLabel: typeof CSV_IMPORT_PLAN_STATUS_LABEL;
  generatedAt: string;
  fileName: string | null;
  sourceType: "csv" | "tsv" | null;
  ok: boolean;
  counts: {
    accepted: number;
    blocked: number;
    duplicateSkipped: number;
    ignoredUnmapped: number;
    ignoredDeviceControl: number;
    rowCount: number;
  };
  dateRange: { start: string | null; end: string | null };
  metricBreakdown: Record<string, number>;
  flagSummary: Record<string, number>;
  hardBlockReasons: Array<{ reason: string; title: string; explanation: string; fix: string }>;
  blockedReasonGroups: BlockedReasonGroup[];
  duplicateInfo: {
    count: number;
    keyPrefixes: string[];
  };
  diarySummaryDraft: CsvImportPlan["diarySummaryDraft"];
  sensorWriteDraftSample: SensorDraftSampleItem[];
  ignoredUnmappedHeaders: string[];
  ignoredDeviceControlHeaders: string[];
  safetyNote: readonly string[];
}

export function buildCsvImportPlanReport(
  plan: CsvImportPlan,
  meta: { fileName: string | null; sourceType: "csv" | "tsv" | null },
  opts?: BuildCsvImportPlanReportOptions,
): CsvImportPlanReport {
  const generatedAt = resolveGeneratedAt(opts);
  const sensorSample = buildSensorDraftSample(
    plan.acceptedWrites,
    opts?.sensorSampleLimit ?? SENSOR_SAMPLE_MAX,
  );
  const blockedGroups = groupBlockedRowsByReason(
    plan.blockedRows,
    opts?.blockedRowContext,
    opts?.blockedSamplePerReasonLimit ?? BLOCKED_SAMPLE_PER_REASON_MAX,
  );
  const hardBlocks = plan.hardBlockReasons.map((r) => {
    const exp = HARD_BLOCK_EXPLANATIONS[r];
    return { reason: r, title: exp?.title ?? r, explanation: exp?.explanation ?? "", fix: exp?.fix ?? "" };
  });
  const duplicateKeyPrefixes = plan.duplicateSkipped.map((d) =>
    d.idempotency_key.slice(0, 12),
  );

  return {
    reportVersion: CSV_IMPORT_PLAN_REPORT_VERSION,
    statusLabel: CSV_IMPORT_PLAN_STATUS_LABEL,
    generatedAt,
    fileName: meta.fileName,
    sourceType: meta.sourceType,
    ok: plan.ok,
    counts: {
      accepted: plan.acceptedWrites.length,
      blocked: plan.blockedRows.length,
      duplicateSkipped: plan.duplicateSkipped.length,
      ignoredUnmapped: plan.ignoredUnmappedHeaders.length,
      ignoredDeviceControl: plan.ignoredDeviceControlHeaders.length,
      rowCount: plan.summary.rowCount,
    },
    dateRange: plan.summary.dateRange,
    metricBreakdown: plan.summary.metricBreakdown,
    flagSummary: plan.summary.flagSummary,
    hardBlockReasons: hardBlocks,
    blockedReasonGroups: blockedGroups,
    duplicateInfo: { count: plan.duplicateSkipped.length, keyPrefixes: duplicateKeyPrefixes },
    diarySummaryDraft: plan.diarySummaryDraft,
    sensorWriteDraftSample: sensorSample,
    ignoredUnmappedHeaders: [...plan.ignoredUnmappedHeaders],
    ignoredDeviceControlHeaders: [...plan.ignoredDeviceControlHeaders],
    safetyNote: CSV_IMPORT_PLAN_SAFETY_NOTE,
  };
}

export function serializeCsvImportPlanReport(report: CsvImportPlanReport): string {
  return JSON.stringify(report, null, 2);
}
