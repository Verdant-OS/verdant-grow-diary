/**
 * csvImportPlanRules — pure planner for the future CSV/TSV → sensor_readings
 * + diary summary import flow.
 *
 * Hard constraints (Safe-by-Design):
 *  - No I/O: no fetch, no Supabase, no Edge Functions, no Storage uploads.
 *  - No writes anywhere. This module ONLY produces draft objects.
 *  - No alerts, no Action Queue, no AI calls, no device control.
 *  - `source` on every draft is always literal "csv" or "tsv". Never "live".
 *  - Demo fixtures (`sample-sensor-export-*`) are hard-blocked.
 *  - Device-control columns are ignored and never appear in drafts.
 *
 * This module is the gatekeeper for any future write path. The Save/Import
 * UI must remain disabled until the write hook + its own tests ship.
 */

import {
  buildCsvImportBatchId,
  buildCsvImportDeviceId,
  buildCsvImportRowIdempotencyKey,
} from "@/lib/csvImportIdempotency";

export type ImportSource = "csv" | "tsv";

export type ImportMetric =
  | "temperature"
  | "humidity"
  | "vpd"
  | "co2"
  | "vwc"
  | "ec"
  | "substrate_temperature"
  | "ph"
  | "ppfd";

export const KNOWN_IMPORT_METRICS: readonly ImportMetric[] = [
  "temperature",
  "humidity",
  "vpd",
  "co2",
  "vwc",
  "ec",
  "substrate_temperature",
  "ph",
  "ppfd",
] as const;

/** Metrics that describe the room/tent environment. plant_id is NOT attached. */
export const TENT_SCOPED_METRICS: ReadonlySet<ImportMetric> = new Set([
  "temperature",
  "humidity",
  "vpd",
  "co2",
  "ppfd",
]);

/** Metrics that describe the rootzone of a specific plant. plant_id MAY attach. */
export const PLANT_SCOPED_METRICS: ReadonlySet<ImportMetric> = new Set([
  "vwc",
  "ec",
  "substrate_temperature",
  "ph",
]);

/** Header substrings that signal device-control intent. Always ignored. */
export const DEVICE_CONTROL_KEYWORDS: readonly string[] = [
  "relay",
  "pump",
  "fan_command",
  "fan command",
  "switch_state",
  "switch state",
  "actuator",
  "dimmer",
  "setpoint",
  "set_point",
  "irrigation_command",
  "irrigation command",
  "valve",
  "heater_command",
  "autopilot",
  "automation",
];

export const DEMO_FIXTURE_PREFIX = "sample-sensor-export-";
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_ROWS = 50_000;
export const MIN_CAPTURED_AT_ISO = "2020-01-01T00:00:00.000Z";
export const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
export const HARD_FLAG_BATCH_THRESHOLD = 0.05;

/** Hard flag codes that block the row's metric. Match preview taxonomy. */
export const HARD_FLAG_CODES: ReadonlySet<string> = new Set([
  "humidity_stuck",
  "vwc_stuck",
  "ph_out_of_range",
  "ec_unit_ambiguous",
  "lux_not_ppfd",
  "temp_unit_ambiguous",
]);

/** Keys we will never copy into raw_payload from the source row. */
const FORBIDDEN_RAW_KEY = /token|secret|password|auth|bearer|api[_-]?key|user[_-]?id|service[_-]?role|cookie/i;

export interface PreviewRowInput {
  rowIndex: number;
  /** Original ISO-8601 string (preview is responsible for normalising). */
  capturedAtRaw: string;
  /** Canonical metric or any string (unknown metrics are blocked). */
  metric: string;
  value: number | null;
  /** Soft flag codes (will mark quality="suspect", confidence=0.6). */
  softFlags?: readonly string[];
  /** Hard flag codes (blocks the row). */
  hardFlags?: readonly string[];
  /** Original parsed row object. Tokens/auth keys will be stripped. */
  raw?: Record<string, unknown>;
}

export interface OwnershipContext {
  authenticated: boolean;
  userId: string | null;
  grow: { id: string; ownerUserId: string } | null;
  tent: { id: string; growId: string; ownerUserId: string } | null;
  plant:
    | { id: string; tentId: string; growId: string; ownerUserId: string }
    | null;
}

export interface BuildCsvImportPlanInput {
  filename: string;
  fileSizeBytes: number;
  /** Total rows present in the file (NOT only the rows[] passed in). */
  totalRowCount: number;
  source: ImportSource;
  columnMappingVersion: string;
  unmappedHeaders?: readonly string[];
  /** Headers detected as device-control intent (ignored, never written). */
  detectedDeviceControlHeaders?: readonly string[];
  rows: readonly PreviewRowInput[];
  ownership: OwnershipContext;
  /** Keys already present server-side (e.g. from a previous import). */
  existingIdempotencyKeys?: ReadonlySet<string>;
  /** Injectable clock — required (no Date.now() inside this module). */
  now: Date;
  timezone?: string;
}

export interface SensorWriteDraft {
  grow_id: string;
  tent_id: string;
  plant_id: string | null;
  source: ImportSource;
  metric: ImportMetric;
  value: number;
  captured_at: string;
  quality: "ok" | "suspect";
  raw_payload: {
    row: Record<string, unknown>;
    filename: string;
    row_index: number;
    column_mapping_version: string;
    confidence: number;
    import_batch_id: string;
  };
  idempotency_key: string;
}

export interface DiarySummaryDraft {
  grow_id: string;
  tent_id: string;
  plant_id: string | null;
  occurred_at: string;
  kind: "csv_import_summary";
  summary: string;
  details: {
    import_batch_id: string;
    filename: string;
    source: ImportSource;
    row_count: number;
    accepted_count: number;
    blocked_count: number;
    duplicate_skipped_count: number;
    metric_breakdown: Record<string, number>;
    date_range: { start: string | null; end: string | null };
    flag_summary: Record<string, number>;
    /** Marker that this draft would, if ever ingested, leave preview-only mode. */
    preview_only: false;
  };
}

export type HardBlockReason =
  | "empty_file"
  | "header_only"
  | "demo_fixture"
  | "file_too_large"
  | "row_count_exceeded"
  | "unauthenticated"
  | "missing_grow_context"
  | "missing_tent_context"
  | "unowned_grow"
  | "unowned_tent"
  | "unowned_plant"
  | "plant_not_in_tent"
  | "tent_not_in_grow"
  | "excess_hard_flags"
  | "invalid_source"
  | "invalid_clock";

export type RowBlockReason =
  | "unparseable_captured_at"
  | "captured_at_before_2020"
  | "captured_at_future"
  | "unknown_metric"
  | "non_numeric_value"
  | "hard_flag";

export interface BlockedRow {
  rowIndex: number;
  reasons: RowBlockReason[];
}

export interface SkippedDuplicateRow {
  rowIndex: number;
  idempotency_key: string;
}

export interface CsvImportPlan {
  ok: boolean;
  hardBlockReasons: HardBlockReason[];
  importBatchId: string | null;
  acceptedWrites: SensorWriteDraft[];
  blockedRows: BlockedRow[];
  duplicateSkipped: SkippedDuplicateRow[];
  ignoredUnmappedHeaders: string[];
  ignoredDeviceControlHeaders: string[];
  summary: {
    rowCount: number;
    acceptedCount: number;
    blockedCount: number;
    duplicateSkippedCount: number;
    metricBreakdown: Record<string, number>;
    dateRange: { start: string | null; end: string | null };
    flagSummary: Record<string, number>;
  };
  diarySummaryDraft: DiarySummaryDraft | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitizeRaw(row: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!row || typeof row !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof k !== "string") continue;
    if (FORBIDDEN_RAW_KEY.test(k)) continue;
    // Never copy device-control fields into raw_payload either.
    const lower = k.toLowerCase();
    if (DEVICE_CONTROL_KEYWORDS.some((kw) => lower.includes(kw))) continue;
    out[k] = v;
  }
  return out;
}

function parseIso(s: string): Date | null {
  if (typeof s !== "string" || s.length === 0) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

function isKnownMetric(m: string): m is ImportMetric {
  return (KNOWN_IMPORT_METRICS as readonly string[]).includes(m);
}

function isHardFlag(code: string): boolean {
  return HARD_FLAG_CODES.has(code);
}

function emptyPlan(
  hardBlockReasons: HardBlockReason[],
  input: BuildCsvImportPlanInput,
): CsvImportPlan {
  return {
    ok: false,
    hardBlockReasons,
    importBatchId: null,
    acceptedWrites: [],
    blockedRows: [],
    duplicateSkipped: [],
    ignoredUnmappedHeaders: [...(input.unmappedHeaders ?? [])],
    ignoredDeviceControlHeaders: [...(input.detectedDeviceControlHeaders ?? [])],
    summary: {
      rowCount: input.totalRowCount ?? 0,
      acceptedCount: 0,
      blockedCount: 0,
      duplicateSkippedCount: 0,
      metricBreakdown: {},
      dateRange: { start: null, end: null },
      flagSummary: {},
    },
    diarySummaryDraft: null,
  };
}

function validateOwnership(
  o: OwnershipContext,
): HardBlockReason[] {
  const reasons: HardBlockReason[] = [];
  if (!o.authenticated || !o.userId) {
    reasons.push("unauthenticated");
    return reasons;
  }
  if (!o.grow) {
    reasons.push("missing_grow_context");
  } else if (o.grow.ownerUserId !== o.userId) {
    reasons.push("unowned_grow");
  }
  if (!o.tent) {
    reasons.push("missing_tent_context");
  } else {
    if (o.tent.ownerUserId !== o.userId) reasons.push("unowned_tent");
    if (o.grow && o.tent.growId !== o.grow.id) reasons.push("tent_not_in_grow");
  }
  if (o.plant) {
    if (o.plant.ownerUserId !== o.userId) reasons.push("unowned_plant");
    if (o.tent && o.plant.tentId !== o.tent.id) reasons.push("plant_not_in_tent");
    if (o.grow && o.plant.growId !== o.grow.id) reasons.push("plant_not_in_tent");
  }
  return reasons;
}

// ---------------------------------------------------------------------------
// Main planner
// ---------------------------------------------------------------------------

export function buildCsvImportPlan(input: BuildCsvImportPlanInput): CsvImportPlan {
  // ---- File-level hard blocks ------------------------------------------------
  const hardBlocks: HardBlockReason[] = [];

  if (input.source !== "csv" && input.source !== "tsv") {
    hardBlocks.push("invalid_source");
  }
  if (!(input.now instanceof Date) || !Number.isFinite(input.now.getTime())) {
    hardBlocks.push("invalid_clock");
  }

  const filename = (input.filename ?? "").trim();
  const lowerName = filename.toLowerCase();
  if (lowerName.startsWith(DEMO_FIXTURE_PREFIX)) {
    hardBlocks.push("demo_fixture");
  }
  if (input.fileSizeBytes > MAX_FILE_BYTES) hardBlocks.push("file_too_large");
  if (input.totalRowCount > MAX_ROWS) hardBlocks.push("row_count_exceeded");
  if (input.totalRowCount <= 0 || input.rows.length === 0) {
    hardBlocks.push(input.totalRowCount === 0 ? "empty_file" : "header_only");
  }

  const ownershipBlocks = validateOwnership(input.ownership);
  hardBlocks.push(...ownershipBlocks);

  // Excess hard-flag pre-check (>5% of supplied rows)
  if (input.rows.length > 0) {
    const hardFlagged = input.rows.filter(
      (r) => (r.hardFlags ?? []).some(isHardFlag),
    ).length;
    if (hardFlagged / input.rows.length > HARD_FLAG_BATCH_THRESHOLD) {
      hardBlocks.push("excess_hard_flags");
    }
  }

  if (hardBlocks.length > 0) {
    return emptyPlan(hardBlocks, input);
  }

  // ---- Row-level evaluation --------------------------------------------------
  const importBatchId = buildCsvImportBatchId({
    filename,
    tentId: input.ownership.tent!.id,
    importedAtIso: input.now.toISOString(),
  });
  const deviceId = buildCsvImportDeviceId(filename);
  const minTs = new Date(MIN_CAPTURED_AT_ISO).getTime();
  const maxTs = input.now.getTime() + MAX_FUTURE_SKEW_MS;
  const existing = input.existingIdempotencyKeys ?? new Set<string>();

  const accepted: SensorWriteDraft[] = [];
  const blocked: BlockedRow[] = [];
  const duplicates: SkippedDuplicateRow[] = [];
  const metricBreakdown: Record<string, number> = {};
  const flagSummary: Record<string, number> = {};
  let minSeen: number | null = null;
  let maxSeen: number | null = null;

  for (const row of input.rows) {
    const reasons: RowBlockReason[] = [];
    const ts = parseIso(row.capturedAtRaw);
    if (!ts) reasons.push("unparseable_captured_at");
    else {
      if (ts.getTime() <= minTs) reasons.push("captured_at_before_2020");
      if (ts.getTime() > maxTs) reasons.push("captured_at_future");
    }
    if (!isKnownMetric(row.metric)) reasons.push("unknown_metric");
    if (typeof row.value !== "number" || !Number.isFinite(row.value)) {
      reasons.push("non_numeric_value");
    }
    const hardFlags = (row.hardFlags ?? []).filter(isHardFlag);
    if (hardFlags.length > 0) reasons.push("hard_flag");

    // Count flag summary for *all* rows we considered.
    for (const f of row.softFlags ?? []) flagSummary[f] = (flagSummary[f] ?? 0) + 1;
    for (const f of row.hardFlags ?? []) flagSummary[f] = (flagSummary[f] ?? 0) + 1;

    if (reasons.length > 0) {
      blocked.push({ rowIndex: row.rowIndex, reasons });
      continue;
    }

    const metric = row.metric as ImportMetric;
    const capturedAtIso = ts!.toISOString();
    const idemKey = buildCsvImportRowIdempotencyKey({
      tentId: input.ownership.tent!.id,
      deviceId,
      metric,
      capturedAtIso,
      value: row.value as number,
    });
    if (existing.has(idemKey)) {
      duplicates.push({ rowIndex: row.rowIndex, idempotency_key: idemKey });
      continue;
    }

    const softFlags = (row.softFlags ?? []).filter((c) => !isHardFlag(c));
    const quality: "ok" | "suspect" = softFlags.length === 0 ? "ok" : "suspect";
    const confidence = softFlags.length === 0 ? 1.0 : 0.6;

    // Plant-id attachment: only for plant-scoped metrics. Tent-scoped metrics
    // deterministically ignore any provided plant context.
    const plantId =
      PLANT_SCOPED_METRICS.has(metric) && input.ownership.plant
        ? input.ownership.plant.id
        : null;

    accepted.push({
      grow_id: input.ownership.grow!.id,
      tent_id: input.ownership.tent!.id,
      plant_id: plantId,
      source: input.source,
      metric,
      value: row.value as number,
      captured_at: capturedAtIso,
      quality,
      raw_payload: {
        row: sanitizeRaw(row.raw),
        filename,
        row_index: row.rowIndex,
        column_mapping_version: input.columnMappingVersion,
        confidence,
        import_batch_id: importBatchId,
      },
      idempotency_key: idemKey,
    });

    metricBreakdown[metric] = (metricBreakdown[metric] ?? 0) + 1;
    const t = ts!.getTime();
    if (minSeen === null || t < minSeen) minSeen = t;
    if (maxSeen === null || t > maxSeen) maxSeen = t;
  }

  const summary = {
    rowCount: input.totalRowCount,
    acceptedCount: accepted.length,
    blockedCount: blocked.length,
    duplicateSkippedCount: duplicates.length,
    metricBreakdown,
    dateRange: {
      start: minSeen === null ? null : new Date(minSeen).toISOString(),
      end: maxSeen === null ? null : new Date(maxSeen).toISOString(),
    },
    flagSummary,
  };

  // Diary summary draft: ONE per accepted batch. None if nothing accepted.
  let diarySummaryDraft: DiarySummaryDraft | null = null;
  if (accepted.length > 0) {
    // Plant attachment on the summary itself: only when EVERY accepted write
    // is for the same plant. Otherwise scope to tent only.
    const plantIds = new Set(accepted.map((w) => w.plant_id));
    const summaryPlantId =
      plantIds.size === 1 && [...plantIds][0] !== null
        ? ([...plantIds][0] as string)
        : null;

    diarySummaryDraft = {
      grow_id: input.ownership.grow!.id,
      tent_id: input.ownership.tent!.id,
      plant_id: summaryPlantId,
      occurred_at: input.now.toISOString(),
      kind: "csv_import_summary",
      summary: `Imported ${accepted.length} sensor reading${accepted.length === 1 ? "" : "s"} from ${filename || "uploaded file"} (${input.source.toUpperCase()})`,
      details: {
        import_batch_id: importBatchId,
        filename,
        source: input.source,
        row_count: input.totalRowCount,
        accepted_count: accepted.length,
        blocked_count: blocked.length,
        duplicate_skipped_count: duplicates.length,
        metric_breakdown: metricBreakdown,
        date_range: summary.dateRange,
        flag_summary: flagSummary,
        preview_only: false,
      },
    };
  }

  return {
    ok: true,
    hardBlockReasons: [],
    importBatchId,
    acceptedWrites: accepted,
    blockedRows: blocked,
    duplicateSkipped: duplicates,
    ignoredUnmappedHeaders: [...(input.unmappedHeaders ?? [])],
    ignoredDeviceControlHeaders: [...(input.detectedDeviceControlHeaders ?? [])],
    summary,
    diarySummaryDraft,
  };
}
