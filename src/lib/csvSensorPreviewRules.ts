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
  /** Always `csv`. */
  sourceLabel: typeof CSV_PREVIEW_SOURCE_LABEL;
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
// Top-level builder
// ---------------------------------------------------------------------------

export function buildCsvPreview(
  text: string,
  fileName: string | null = null,
): CsvPreviewParseResult {
  const base: CsvPreviewParseResult = {
    ok: false,
    fileName,
    headers: [],
    rows: [],
    totalRows: 0,
    sampleRows: [],
    mappings: [],
    unmapped: [],
    flags: [],
    sourceLabel: CSV_PREVIEW_SOURCE_LABEL,
    statusLabel: CSV_PREVIEW_STATUS_LABEL,
    error: null,
  };

  if (typeof text !== "string" || text.trim().length === 0) {
    return { ...base, error: "CSV is empty." };
  }

  let parsed: { headers: string[]; rows: string[][] };
  try {
    parsed = parseCsvText(text);
  } catch {
    return { ...base, error: "Could not parse CSV." };
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

// ---------------------------------------------------------------------------
// Timeline preview — read-only, derived from parsed rows when a timestamp
// column is present.
// ---------------------------------------------------------------------------

export interface CsvTimelinePreviewRow {
  capturedAt: string;
  values: Partial<Record<CanonicalField, string>>;
  sourceLabel: typeof CSV_PREVIEW_SOURCE_LABEL;
}

export function buildCsvTimelinePreviewRows(
  result: CsvPreviewParseResult,
  limit = 10,
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

  const out: CsvTimelinePreviewRow[] = [];
  for (const row of result.sampleRows.slice(0, limit)) {
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
      sourceLabel: CSV_PREVIEW_SOURCE_LABEL,
    });
  }
  return out;
}
