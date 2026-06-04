/**
 * csvSensorPreviewRules — pure helpers for the read-only CSV Sensor Preview.
 *
 * Hard constraints (Safe-by-Design):
 *  - No I/O: no fetch, no Supabase, no Edge Functions, no Storage uploads.
 *  - No persistence: caller never writes anything to the database.
 *  - No alerts, no Action Queue, no AI calls, no device control.
 *  - Source label for anything produced here is always `csv`.
 *
 * Scope: parse a small in-memory CSV, suggest field mappings, and flag
 * suspicious unit/range patterns so growers/partners can sanity-check a
 * sensor export before any future import.
 */

export const CSV_PREVIEW_SOURCE_LABEL = "csv" as const;
export const TSV_PREVIEW_SOURCE_LABEL = "tsv" as const;
export const CSV_PREVIEW_STATUS_LABEL = "Preview only — not saved" as const;
export const CSV_PREVIEW_MAX_SAMPLE_ROWS = 25;

export type DelimitedSourceLabel = "csv" | "tsv";

export type CanonicalField =
  | "captured_at"
  | "temperature"
  | "humidity"
  | "vpd"
  | "co2"
  | "vwc"
  | "ec"
  | "substrate_temperature"
  | "ph"
  | "ppfd";

export const CANONICAL_FIELDS: readonly CanonicalField[] = [
  "captured_at",
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

export interface FieldMapping {
  /** Original CSV header text. */
  header: string;
  /** Canonical Verdant field or `null` if unmapped. */
  field: CanonicalField | null;
  /** Short reason for the suggestion (or why it was rejected). */
  reason: string;
}

export interface SuspiciousFlag {
  header: string;
  field: CanonicalField | null;
  severity: "warn" | "error";
  code:
    | "temp_unit_ambiguous"
    | "ec_unit_ambiguous"
    | "humidity_stuck"
    | "vwc_stuck"
    | "ph_out_of_range"
    | "lux_not_ppfd";
  message: string;
}

export interface CsvPreviewParseResult {
  ok: boolean;
  /** Filename (if provided by caller). */
  fileName: string | null;
  headers: string[];
  rows: string[][];
  /** Total data rows detected (may be greater than sample rows). */
  totalRows: number;
  sampleRows: string[][];
  mappings: FieldMapping[];
  unmapped: string[];
  flags: SuspiciousFlag[];
  /** Always the read-only status copy. */
  statusLabel: typeof CSV_PREVIEW_STATUS_LABEL;
  /** Detected delimiter: "," for CSV, "\t" for TSV. */
  delimiter: "," | "\t";
  /** "csv" | "tsv" — never "live". */
  sourceLabel: DelimitedSourceLabel;
  /** Human-friendly error if the file could not be parsed. */
  error: string | null;
}

// ---------------------------------------------------------------------------
// Parsing — intentionally minimal CSV (no quoted commas in scope).
// ---------------------------------------------------------------------------

function splitCsvLine(line: string): string[] {
  // Minimal handling: support double-quoted cells with embedded commas.
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseCsvText(text: string): { headers: string[]; rows: string[][] } {
  const cleaned = (text ?? "").replace(/^\uFEFF/, "");
  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]);
  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    rows.push(splitCsvLine(lines[i]));
  }
  return { headers, rows };
}

// ---------------------------------------------------------------------------
// Mapping suggestions
// ---------------------------------------------------------------------------

interface MappingRule {
  field: CanonicalField;
  match: (norm: string, raw: string) => boolean;
  reason: string;
}

function norm(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const RULES: MappingRule[] = [
  {
    field: "captured_at",
    match: (n) =>
      /\b(timestamp|captured at|datetime|date time|time|date)\b/.test(n),
    reason: "Matches timestamp/captured_at",
  },
  {
    field: "temperature",
    match: (n) =>
      /\b(temp|temperature|air temp|tair)\b/.test(n) && !/soil|substrate|water|leaf/.test(n),
    reason: "Matches air temperature",
  },
  {
    field: "humidity",
    match: (n) => /\b(humidity|rh|relative humidity)\b/.test(n),
    reason: "Matches relative humidity",
  },
  {
    field: "vpd",
    match: (n) => /\bvpd\b/.test(n),
    reason: "Matches VPD",
  },
  {
    field: "co2",
    match: (n) => /\bco2\b/.test(n) || /\bcarbon dioxide\b/.test(n),
    reason: "Matches CO₂",
  },
  {
    field: "vwc",
    match: (n) =>
      /\b(vwc|soil moisture|substrate moisture|soil water|soil wc|moisture)\b/.test(n),
    reason: "Matches soil moisture / VWC",
  },
  {
    field: "ec",
    match: (n) => /\bec\b/.test(n) || /electrical conductivity/.test(n),
    reason: "Matches EC",
  },
  {
    field: "ph",
    match: (n) => /\bph\b/.test(n),
    reason: "Matches pH",
  },
  {
    field: "ppfd",
    match: (n) => /\bppfd\b/.test(n) || /µmol|umol|micromol/.test(n),
    reason: "Matches PPFD (µmol·m⁻²·s⁻¹)",
  },
];

export function suggestMapping(header: string): FieldMapping {
  const n = norm(header);
  // Reject lux as PPFD up front — lux is illuminance, not PPFD.
  if (/\blux\b/.test(n)) {
    return {
      header,
      field: null,
      reason: "Lux is illuminance, not PPFD. Left unmapped.",
    };
  }
  for (const rule of RULES) {
    if (rule.match(n, header)) {
      return { header, field: rule.field, reason: rule.reason };
    }
  }
  return { header, field: null, reason: "No canonical field matched" };
}

export function suggestMappings(headers: string[]): FieldMapping[] {
  return headers.map((h) => suggestMapping(h));
}

// ---------------------------------------------------------------------------
// Suspicious value flags
// ---------------------------------------------------------------------------

function colValues(headers: string[], rows: string[][], header: string): number[] {
  const idx = headers.indexOf(header);
  if (idx < 0) return [];
  const out: number[] = [];
  for (const row of rows) {
    const v = Number(row[idx]);
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

export function detectFlags(
  headers: string[],
  rows: string[][],
  mappings: FieldMapping[],
): SuspiciousFlag[] {
  const flags: SuspiciousFlag[] = [];
  const headerNorm = (h: string) => norm(h);

  for (const m of mappings) {
    const n = headerNorm(m.header);

    // Lux mislabeled as PPFD is captured both at mapping time (unmapped) and here.
    if (/\blux\b/.test(n)) {
      flags.push({
        header: m.header,
        field: "ppfd",
        severity: "warn",
        code: "lux_not_ppfd",
        message: "Lux detected — Verdant treats PPFD (µmol·m⁻²·s⁻¹) separately. Left unmapped.",
      });
    }

    if (m.field === "temperature") {
      const vals = colValues(headers, rows, m.header);
      // If a header has no unit indicator and values >50, likely Fahrenheit.
      const hasUnit = /[°cf]|celsius|fahrenheit/.test(n);
      if (!hasUnit && vals.some((v) => v > 50)) {
        flags.push({
          header: m.header,
          field: "temperature",
          severity: "warn",
          code: "temp_unit_ambiguous",
          message:
            "Temperature values exceed 50 with no unit in header — may be Fahrenheit shown as Celsius.",
        });
      }
    }

    if (m.field === "ec") {
      const hasMs = /ms\s*\/?\s*cm/.test(n);
      const hasUs = /(us|µs)\s*\/?\s*cm/.test(n);
      const vals = colValues(headers, rows, m.header);
      // Typical substrate EC < 10 mS/cm; values in the thousands suggest µS/cm
      // labeled as mS/cm (or vice versa).
      if (hasMs && vals.some((v) => v > 50)) {
        flags.push({
          header: m.header,
          field: "ec",
          severity: "warn",
          code: "ec_unit_ambiguous",
          message: "EC header says mS/cm but values look like µS/cm.",
        });
      } else if (hasUs && vals.length > 0 && vals.every((v) => v < 20)) {
        flags.push({
          header: m.header,
          field: "ec",
          severity: "warn",
          code: "ec_unit_ambiguous",
          message: "EC header says µS/cm but values look like mS/cm.",
        });
      } else if (!hasMs && !hasUs && vals.some((v) => v > 50)) {
        flags.push({
          header: m.header,
          field: "ec",
          severity: "warn",
          code: "ec_unit_ambiguous",
          message: "EC values are large with no unit in header — confirm mS/cm vs µS/cm.",
        });
      }
    }

    if (m.field === "humidity") {
      const vals = colValues(headers, rows, m.header);
      if (vals.length >= 2 && vals.every((v) => v === 0)) {
        flags.push({
          header: m.header,
          field: "humidity",
          severity: "error",
          code: "humidity_stuck",
          message: "Humidity is stuck at 0 — sensor likely offline or miswired.",
        });
      } else if (vals.length >= 2 && vals.every((v) => v === 100)) {
        flags.push({
          header: m.header,
          field: "humidity",
          severity: "error",
          code: "humidity_stuck",
          message: "Humidity is stuck at 100 — sensor likely saturated or faulted.",
        });
      }
    }

    if (m.field === "vwc") {
      const vals = colValues(headers, rows, m.header);
      if (vals.length >= 2 && vals.every((v) => v === 0)) {
        flags.push({
          header: m.header,
          field: "vwc",
          severity: "error",
          code: "vwc_stuck",
          message: "Soil moisture is stuck at 0 — probe likely disconnected.",
        });
      } else if (vals.length >= 2 && vals.every((v) => v === 100)) {
        flags.push({
          header: m.header,
          field: "vwc",
          severity: "error",
          code: "vwc_stuck",
          message: "Soil moisture is stuck at 100 — probe likely faulted or submerged.",
        });
      }
    }

    if (m.field === "ph") {
      const vals = colValues(headers, rows, m.header);
      if (vals.some((v) => v < 0 || v > 14)) {
        flags.push({
          header: m.header,
          field: "ph",
          severity: "error",
          code: "ph_out_of_range",
          message: "pH outside 0–14 — value is not physically possible.",
        });
      } else if (vals.length > 0 && vals.every((v) => v < 2 || v > 12)) {
        flags.push({
          header: m.header,
          field: "ph",
          severity: "warn",
          code: "ph_out_of_range",
          message: "pH outside realistic grow range (2–12).",
        });
      }
    }
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Delimiter detection (CSV vs TSV)
// ---------------------------------------------------------------------------

export interface DelimiterDetection {
  delimiter: "," | "\t";
  sourceLabel: DelimitedSourceLabel;
}

export function detectDelimitedSensorFile(input: string): DelimiterDetection {
  const text = (input ?? "").replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  const commas = (firstLine.match(/,/g) ?? []).length;
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  if (tabs > commas) return { delimiter: "\t", sourceLabel: "tsv" };
  return { delimiter: ",", sourceLabel: "csv" };
}

// ---------------------------------------------------------------------------
// Generic delimited parsing (CSV or TSV)
// ---------------------------------------------------------------------------

function splitDelimitedLine(line: string, delimiter: "," | "\t"): string[] {
  if (delimiter === "\t") {
    return line.split("\t").map((s) => s.trim());
  }
  return splitCsvLine(line);
}

export function parseDelimitedText(
  text: string,
  delimiter: "," | "\t",
): { headers: string[]; rows: string[][] } {
  const cleaned = (text ?? "").replace(/^\uFEFF/, "");
  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = splitDelimitedLine(lines[0], delimiter);
  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    rows.push(splitDelimitedLine(lines[i], delimiter));
  }
  return { headers, rows };
}

// ---------------------------------------------------------------------------
// Top-level builder (delimiter-aware)
// ---------------------------------------------------------------------------

function emptyResult(
  fileName: string | null,
  delimiter: "," | "\t",
  sourceLabel: DelimitedSourceLabel,
): CsvPreviewParseResult {
  return {
    ok: false,
    fileName,
    headers: [],
    rows: [],
    totalRows: 0,
    sampleRows: [],
    mappings: [],
    unmapped: [],
    flags: [],
    delimiter,
    sourceLabel,
    statusLabel: CSV_PREVIEW_STATUS_LABEL,
    error: null,
  };
}

export interface ParseDelimitedPreviewOptions {
  fileName?: string | null;
  /** Override auto-detection. */
  delimiter?: "," | "\t";
}

export function parseDelimitedSensorPreview(
  text: string,
  options: ParseDelimitedPreviewOptions = {},
): CsvPreviewParseResult {
  const detected = detectDelimitedSensorFile(text);
  const delimiter = options.delimiter ?? detected.delimiter;
  const sourceLabel: DelimitedSourceLabel = delimiter === "\t" ? "tsv" : "csv";
  const fileName = options.fileName ?? null;
  const base = emptyResult(fileName, delimiter, sourceLabel);

  if (typeof text !== "string" || text.trim().length === 0) {
    return { ...base, error: "File is empty." };
  }

  let parsed: { headers: string[]; rows: string[][] };
  try {
    parsed = parseDelimitedText(text, delimiter);
  } catch {
    return { ...base, error: "Could not parse file." };
  }

  if (parsed.headers.length === 0) {
    return { ...base, error: "No header row detected." };
  }
  if (parsed.rows.length === 0) {
    return { ...base, error: "No data rows detected.", headers: parsed.headers };
  }

  const mappings = suggestMappings(parsed.headers);
  const unmapped = mappings.filter((m) => m.field === null).map((m) => m.header);
  const flags = detectFlags(parsed.headers, parsed.rows, mappings);
  const sampleRows = parsed.rows.slice(0, CSV_PREVIEW_MAX_SAMPLE_ROWS);

  return {
    ...base,
    ok: true,
    headers: parsed.headers,
    rows: parsed.rows,
    totalRows: parsed.rows.length,
    sampleRows,
    mappings,
    unmapped,
    flags,
    error: null,
  };
}

/**
 * Backward-compatible CSV builder. Forces comma delimiter and "csv" source.
 */
export function buildCsvPreview(
  text: string,
  fileName: string | null = null,
): CsvPreviewParseResult {
  const r = parseDelimitedSensorPreview(text, { fileName, delimiter: "," });
  if (!r.ok && r.error === "File is empty.") {
    return { ...r, error: "CSV is empty." };
  }
  if (!r.ok && r.error === "Could not parse file.") {
    return { ...r, error: "Could not parse CSV." };
  }
  return r;
}

// ---------------------------------------------------------------------------
// Mapping overrides (local only — never persisted)
// ---------------------------------------------------------------------------

export type MappingOverrides = Record<string, CanonicalField | null>;

export function applySensorMappingOverrides(
  preview: CsvPreviewParseResult,
  overrides: MappingOverrides,
): CsvPreviewParseResult {
  if (!preview.ok) return preview;
  const next: FieldMapping[] = preview.mappings.map((m) => {
    if (!Object.prototype.hasOwnProperty.call(overrides, m.header)) return m;
    const v = overrides[m.header];
    return {
      header: m.header,
      field: v,
      reason: v ? "User override" : "User override — left unmapped",
    };
  });
  const unmapped = next.filter((m) => m.field === null).map((m) => m.header);
  const flags = detectFlags(preview.headers, preview.rows, next);
  return { ...preview, mappings: next, unmapped, flags };
}

// ---------------------------------------------------------------------------
// Timeline preview — read-only, derived from parsed rows when a timestamp
// column is present.
// ---------------------------------------------------------------------------

export interface CsvTimelinePreviewRow {
  capturedAt: string;
  values: Partial<Record<CanonicalField, string>>;
  sourceLabel: DelimitedSourceLabel;
}

export function buildCsvTimelinePreviewRows(
  result: CsvPreviewParseResult,
  limit = 10,
  rowsOverride?: string[][],
): CsvTimelinePreviewRow[] {
  if (!result.ok) return [];
  const tsIdx = result.mappings.findIndex((m) => m.field === "captured_at");
  if (tsIdx < 0) return [];
  const mapped = result.mappings
    .map((m, i) => ({ field: m.field, idx: i }))
    .filter((m) => m.field && m.field !== "captured_at") as {
    field: CanonicalField;
    idx: number;
  }[];

  const source = rowsOverride ?? result.sampleRows;
  const slice = limit > 0 ? source.slice(0, limit) : source;

  const out: CsvTimelinePreviewRow[] = [];
  for (const row of slice) {
    const capturedAt = row[tsIdx] ?? "";
    if (!capturedAt) continue;
    const values: Partial<Record<CanonicalField, string>> = {};
    for (const { field, idx } of mapped) {
      const v = row[idx];
      if (v != null && v !== "") values[field] = v;
    }
    out.push({
      capturedAt,
      values,
      sourceLabel: result.sourceLabel,
    });
  }
  return out;
}

/**
 * Builds timeline rows from EVERY parsed row (not the 25-row sample).
 * Used as input to window-filter + sampling controls.
 */
export function buildFullCsvTimelineRows(
  result: CsvPreviewParseResult,
): CsvTimelinePreviewRow[] {
  if (!result.ok) return [];
  return buildCsvTimelinePreviewRows(result, result.rows.length, result.rows);
}

// ---------------------------------------------------------------------------
// Time-window filter
// ---------------------------------------------------------------------------

export type TimeWindowKind = "all" | "24h" | "7d" | "30d" | "custom";

export interface TimeWindow {
  kind: TimeWindowKind;
  /** ISO string (inclusive). */
  start?: string;
  /** ISO string (inclusive). */
  end?: string;
  /** Defaults to `new Date()`. Tests pass a fixed clock. */
  now?: Date;
}

function parseDateSafe(s: string): Date | null {
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function filterPreviewTimelineByWindow(
  timeline: CsvTimelinePreviewRow[],
  window: TimeWindow,
): CsvTimelinePreviewRow[] {
  if (!window || window.kind === "all") return timeline;

  if (window.kind === "custom") {
    const start = window.start ? parseDateSafe(window.start) : null;
    const end = window.end ? parseDateSafe(window.end) : null;
    return timeline.filter((r) => {
      const d = parseDateSafe(r.capturedAt);
      if (!d) return false;
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    });
  }

  const now = window.now ?? new Date();
  const ms =
    window.kind === "24h"
      ? 86_400_000
      : window.kind === "7d"
        ? 7 * 86_400_000
        : 30 * 86_400_000;
  const cutoff = new Date(now.getTime() - ms);
  return timeline.filter((r) => {
    const d = parseDateSafe(r.capturedAt);
    if (!d) return false;
    return d >= cutoff && d <= now;
  });
}

// ---------------------------------------------------------------------------
// Sampling (deterministic, no randomness)
// ---------------------------------------------------------------------------

export type SamplingKind =
  | "every"
  | "nth5"
  | "nth10"
  | "nth25"
  | "cap100"
  | "cap500";

export const SAMPLING_OPTIONS: readonly { kind: SamplingKind; label: string }[] = [
  { kind: "every", label: "Every row" },
  { kind: "nth5", label: "Every 5th row" },
  { kind: "nth10", label: "Every 10th row" },
  { kind: "nth25", label: "Every 25th row" },
  { kind: "cap100", label: "Max 100 points" },
  { kind: "cap500", label: "Max 500 points" },
] as const;

export const TIME_WINDOW_OPTIONS: readonly { kind: TimeWindowKind; label: string }[] = [
  { kind: "all", label: "All rows" },
  { kind: "24h", label: "Last 24 hours" },
  { kind: "7d", label: "Last 7 days" },
  { kind: "30d", label: "Last 30 days" },
  { kind: "custom", label: "Custom range" },
] as const;

export function samplePreviewTimeline<T>(
  timeline: T[],
  sampling: SamplingKind,
): T[] {
  if (!Array.isArray(timeline) || timeline.length === 0) return [];
  switch (sampling) {
    case "every":
      return timeline.slice();
    case "nth5":
      return timeline.filter((_, i) => i % 5 === 0);
    case "nth10":
      return timeline.filter((_, i) => i % 10 === 0);
    case "nth25":
      return timeline.filter((_, i) => i % 25 === 0);
    case "cap100":
    case "cap500": {
      const cap = sampling === "cap100" ? 100 : 500;
      if (timeline.length <= cap) return timeline.slice();
      const step = timeline.length / cap;
      const out: T[] = [];
      for (let i = 0; i < cap; i++) {
        const idx = Math.min(timeline.length - 1, Math.floor(i * step));
        out.push(timeline[idx]);
      }
      return out;
    }
    default:
      return timeline.slice();
  }
}

// ---------------------------------------------------------------------------
// Report builder (local-only JSON object)
// ---------------------------------------------------------------------------

export interface CsvPreviewReportOptions {
  overrides?: MappingOverrides;
  timeWindow?: TimeWindow;
  sampling?: SamplingKind;
  /** Deterministic timestamp for tests. */
  generatedAt?: string;
}

export interface CsvPreviewReport {
  generatedAt: string;
  fileName: string | null;
  sourceLabel: DelimitedSourceLabel;
  statusLabel: typeof CSV_PREVIEW_STATUS_LABEL;
  delimiter: "csv" | "tsv";
  headers: string[];
  rowCount: number;
  proposedMappings: { header: string; field: CanonicalField | null; reason: string }[];
  userOverrides: { header: string; field: CanonicalField | null }[];
  effectiveMappings: { header: string; field: CanonicalField | null }[];
  unmappedColumns: string[];
  suspiciousFlags: SuspiciousFlag[];
  timeWindow: TimeWindow;
  sampling: SamplingKind;
  timelinePreview: CsvTimelinePreviewRow[];
  notes: string[];
}

export function buildCsvPreviewReport(
  preview: CsvPreviewParseResult,
  options: CsvPreviewReportOptions = {},
): CsvPreviewReport {
  const overrides = options.overrides ?? {};
  const window: TimeWindow = options.timeWindow ?? { kind: "all" };
  const sampling: SamplingKind = options.sampling ?? "every";

  const overridden = applySensorMappingOverrides(preview, overrides);
  const fullTimeline = buildFullCsvTimelineRows(overridden);
  const windowed = filterPreviewTimelineByWindow(fullTimeline, window);
  const sampled = samplePreviewTimeline(windowed, sampling);

  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    fileName: preview.fileName,
    sourceLabel: preview.sourceLabel,
    statusLabel: CSV_PREVIEW_STATUS_LABEL,
    delimiter: preview.delimiter === "\t" ? "tsv" : "csv",
    headers: preview.headers,
    rowCount: preview.totalRows,
    proposedMappings: preview.mappings.map((m) => ({
      header: m.header,
      field: m.field,
      reason: m.reason,
    })),
    userOverrides: Object.keys(overrides).map((h) => ({
      header: h,
      field: overrides[h],
    })),
    effectiveMappings: overridden.mappings.map((m) => ({
      header: m.header,
      field: m.field,
    })),
    unmappedColumns: overridden.unmapped,
    suspiciousFlags: overridden.flags,
    timeWindow: window,
    sampling,
    timelinePreview: sampled,
    notes: [
      "Preview only — not saved",
      "No database writes, no Edge Functions, no alerts, no Action Queue items, no AI calls, no device control.",
      "Generated entirely in the browser from a local file.",
    ],
  };
}

