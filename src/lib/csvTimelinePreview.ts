/**
 * CSV Timeline Preview — pure presenter helpers.
 *
 * Turns already-normalized representative CSV rows + the current explicit
 * column mapping into a small, deterministic list of timeline-style
 * sensor snapshot events suitable for read-only UI preview.
 *
 * Hard constraints (tests + static scan):
 *  - Pure: no I/O, no Supabase, no React, no timers, no globals.
 *  - No DB writes, no functions.invoke, no service_role.
 *  - No alerts / action_queue / ai_doctor_sessions / sensor_readings refs.
 *  - Never labels events as "live", "synced", "imported", "persisted",
 *    or "connected" — only "csv / representative sample / not live".
 *  - Does not mutate input rows.
 *  - Does not emit IDs, secrets, tokens, or row raw_payload contents.
 */

import {
  REPRESENTATIVE_CSV_DATA_CONTEXT,
  REPRESENTATIVE_CSV_SOURCE,
  type RepresentativeColumnMapping,
  type RepresentativeDraftReading,
  type RepresentativeMappingField,
} from "@/lib/representativeCsvSensorPreviewRules";
import {
  deriveCsvRowValidationHints,
  type CsvRowValidationHint,
} from "@/lib/csvRowValidationRules";

/** Stable, presenter-safe source label. Never "live". */
export const TIMELINE_PREVIEW_SOURCE_LABEL =
  "csv / representative sample / not live" as const;

/** Default number of valid rows shown in the timeline preview section. */
export const TIMELINE_PREVIEW_DEFAULT_LIMIT = 8;
export const TIMELINE_PREVIEW_MIN_LIMIT = 5;
export const TIMELINE_PREVIEW_MAX_LIMIT = 10;

export interface TimelinePreviewMetric {
  /** Canonical field name, e.g. "air_temp_c", "humidity_pct". */
  field: string;
  /** Canonical-unit numeric value as already normalized upstream. */
  value: number;
  /** Display unit hint, e.g. "°C", "%", "kPa". */
  unit: string;
}

export type TimelineEventSeverity = "ok" | "warning";

export interface TimelinePreviewEvent {
  rowIndex: number;
  /** Always a valid ISO-8601 UTC timestamp here. */
  captured_at: string;
  /** Always "csv". Never "live". */
  source: typeof REPRESENTATIVE_CSV_SOURCE;
  /** Always "representative_sample". */
  data_context: typeof REPRESENTATIVE_CSV_DATA_CONTEXT;
  /** Stable human label for UI badges. */
  source_label: typeof TIMELINE_PREVIEW_SOURCE_LABEL;
  /** Mapped metrics with finite canonical values, sorted by field name. */
  metrics: TimelinePreviewMetric[];
  /** Canonical fields that are unmapped or empty for this row. */
  missingFields: string[];
  /** Canonical fields whose mapped cell was present but unparseable. */
  ignoredFields: string[];
  severity: TimelineEventSeverity;
  hintCount: number;
}

export interface TimelineReviewRow {
  rowIndex: number;
  /** May be null when the timestamp itself is unparseable. */
  captured_at: string | null;
  /** Always "invalid" — only invalid rows surface here. */
  severity: "invalid";
  /** Stable hint codes describing why the row needs review. */
  reasonCodes: string[];
  /** Short human-readable reasons (deduped, deterministic order). */
  reasons: string[];
}

export interface TimelinePreviewSummary {
  total: number;
  timelineReady: number;
  needsReview: number;
  previewed: number;
  hidden: number;
}

export interface TimelinePreviewResult {
  events: TimelinePreviewEvent[];
  reviewRows: TimelineReviewRow[];
  summary: TimelinePreviewSummary;
  limit: number;
}

export interface BuildTimelinePreviewArgs {
  rows: ReadonlyArray<RepresentativeDraftReading>;
  mapping: RepresentativeColumnMapping;
  /** Optional cap on previewed events; clamped to 5..10. */
  limit?: number;
}

// ---- Internals ----

interface MetricDescriptor {
  field: string;
  mappingField: RepresentativeMappingField;
  draftKey: keyof RepresentativeDraftReading;
  unit: string;
}

const METRIC_DESCRIPTORS: ReadonlyArray<MetricDescriptor> = [
  { field: "air_temp_c", mappingField: "air_temp", draftKey: "air_temp_c", unit: "°C" },
  { field: "substrate_temp_c", mappingField: "substrate_temp", draftKey: "substrate_temp_c", unit: "°C" },
  { field: "humidity_pct", mappingField: "humidity", draftKey: "humidity_pct", unit: "%" },
  { field: "vpd_kpa", mappingField: "vpd", draftKey: "vpd_kpa", unit: "kPa" },
  { field: "co2_ppm", mappingField: "co2", draftKey: "co2_ppm", unit: "ppm" },
  { field: "ppfd", mappingField: "ppfd", draftKey: "ppfd", unit: "µmol" },
  { field: "vwc_pct", mappingField: "vwc", draftKey: "vwc_pct", unit: "%" },
  { field: "substrate_ec_mscm", mappingField: "substrate_ec", draftKey: "substrate_ec_mscm", unit: "mS/cm" },
];

function mappingHeader(
  mapping: RepresentativeColumnMapping,
  field: RepresentativeMappingField,
): string | null {
  const v = mapping[field];
  if (v === null) return null;
  if (typeof v === "string") return v;
  return v.column;
}

function rawCellPresent(
  row: RepresentativeDraftReading,
  header: string | null,
): boolean {
  if (!header) return false;
  const cell = row.raw_payload[header];
  if (cell === undefined || cell === null) return false;
  return String(cell).trim().length > 0;
}

function clampLimit(limit: number | undefined): number {
  const n = typeof limit === "number" && Number.isFinite(limit)
    ? Math.floor(limit)
    : TIMELINE_PREVIEW_DEFAULT_LIMIT;
  if (n < TIMELINE_PREVIEW_MIN_LIMIT) return TIMELINE_PREVIEW_MIN_LIMIT;
  if (n > TIMELINE_PREVIEW_MAX_LIMIT) return TIMELINE_PREVIEW_MAX_LIMIT;
  return n;
}

function hintsToReasons(
  hints: ReadonlyArray<CsvRowValidationHint>,
): { codes: string[]; messages: string[] } {
  const codeSet = new Set<string>();
  const msgSet = new Set<string>();
  for (const h of hints) {
    if (h.severity !== "invalid") continue;
    codeSet.add(h.code);
    msgSet.add(h.message);
  }
  return {
    codes: Array.from(codeSet).sort(),
    messages: Array.from(msgSet).sort(),
  };
}

function buildEvent(
  row: RepresentativeDraftReading,
  mapping: RepresentativeColumnMapping,
  hints: ReadonlyArray<CsvRowValidationHint>,
): TimelinePreviewEvent {
  const metrics: TimelinePreviewMetric[] = [];
  const missing: string[] = [];
  const ignored: string[] = [];

  for (const desc of METRIC_DESCRIPTORS) {
    const header = mappingHeader(mapping, desc.mappingField);
    const value = row[desc.draftKey];
    const present = rawCellPresent(row, header);
    if (header === null || !present) {
      missing.push(desc.field);
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      ignored.push(desc.field);
      continue;
    }
    metrics.push({ field: desc.field, value, unit: desc.unit });
  }

  metrics.sort((a, b) => a.field.localeCompare(b.field));
  missing.sort();
  ignored.sort();

  const warnHints = hints.filter((h) => h.severity === "warn").length;
  const severity: TimelineEventSeverity = warnHints > 0 ? "warning" : "ok";

  return {
    rowIndex: row.rowIndex,
    captured_at: row.captured_at as string, // validated upstream
    source: REPRESENTATIVE_CSV_SOURCE,
    data_context: REPRESENTATIVE_CSV_DATA_CONTEXT,
    source_label: TIMELINE_PREVIEW_SOURCE_LABEL,
    metrics,
    missingFields: missing,
    ignoredFields: ignored,
    severity,
    hintCount: hints.length,
  };
}

/**
 * Build the timeline preview from already-normalized rows + the active
 * explicit column mapping.
 *
 * Rules:
 *  - Timeline-ready rows: row.state !== "invalid" AND captured_at is set
 *    AND the validation outcome is canonicalPreviewable.
 *  - Sorted by captured_at ascending, then by original rowIndex.
 *  - Events are capped by `limit` (clamped 5..10).
 *  - Invalid rows are returned in `reviewRows` (never silently hidden).
 */
export function buildCsvTimelinePreview(
  args: BuildTimelinePreviewArgs,
): TimelinePreviewResult {
  const { rows, mapping } = args;
  const limit = clampLimit(args.limit);

  const ready: Array<{
    row: RepresentativeDraftReading;
    hints: ReadonlyArray<CsvRowValidationHint>;
  }> = [];
  const reviewRows: TimelineReviewRow[] = [];

  for (const row of rows) {
    const outcome = deriveCsvRowValidationHints({ row, mapping });
    const isReady =
      row.state !== "invalid" &&
      outcome.canonicalPreviewable &&
      typeof row.captured_at === "string" &&
      row.captured_at.length > 0;

    if (isReady) {
      ready.push({ row, hints: outcome.hints });
      continue;
    }

    const fromHints = hintsToReasons(outcome.hints);
    const codes = new Set<string>(fromHints.codes);
    const messages = new Set<string>(fromHints.messages);
    // Fall back to normalizer reasons when no invalid hint was emitted.
    for (const r of row.reasons) codes.add(r);
    if (fromHints.messages.length === 0) {
      for (const r of row.reasons) messages.add(r);
    }

    reviewRows.push({
      rowIndex: row.rowIndex,
      captured_at: row.captured_at,
      severity: "invalid",
      reasonCodes: Array.from(codes).sort(),
      reasons: Array.from(messages).sort(),
    });
  }

  ready.sort((a, b) => {
    if (a.row.captured_at! < b.row.captured_at!) return -1;
    if (a.row.captured_at! > b.row.captured_at!) return 1;
    return a.row.rowIndex - b.row.rowIndex;
  });

  const events = ready
    .slice(0, limit)
    .map(({ row, hints }) => buildEvent(row, mapping, hints));

  reviewRows.sort((a, b) => a.rowIndex - b.rowIndex);

  return {
    events,
    reviewRows,
    summary: {
      total: rows.length,
      timelineReady: ready.length,
      needsReview: reviewRows.length,
      previewed: events.length,
      hidden: Math.max(0, ready.length - events.length),
    },
    limit,
  };
}
