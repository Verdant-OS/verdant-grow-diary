/**
 * CSV Row Validation — pure presenter helpers.
 *
 * Turns a normalized {@link RepresentativeDraftReading} plus the user's
 * mapping into per-field hints, a per-field state, and a row severity
 * suitable for UI display. Adds extra checks on top of what the normalizer
 * owns (pH range, humidity stuck at exactly 0/100, EC likely in µS/cm
 * while mS/cm selected, timezone-missing timestamp warnings, year-only
 * timestamp invalidity, mapping-collision warnings).
 *
 * Hard constraints (tests enforced):
 *  - Pure, deterministic, no I/O, no React, no Supabase.
 *  - Never reclassifies unknown / suspicious telemetry as healthy.
 *  - Timestamp invalid/missing → row marked `invalid` and NOT
 *    canonical-previewable, but UI must still render the row.
 *  - EC unit mismatch is warning-only, never invalid, copy uses
 *    "may be" / "looks like" (no false certainty).
 *  - All thresholds come from src/constants/csvValidationRanges.ts.
 */

import {
  CSV_VALIDATION_RANGES,
  HUMIDITY_STUCK_VALUES,
  PH_REALISTIC_RANGE,
  EC_SUSPICIOUS_MSCM_MAX,
} from "@/constants/csvValidationRanges";
import type {
  RepresentativeColumnMapping,
  RepresentativeDraftReading,
  RepresentativeMappingField,
} from "@/lib/representativeCsvSensorPreviewRules";

// ---------- Public types ----------

export type CsvFieldState = "not_mapped" | "mapped_unparseable" | "mapped_parsed";

export type CsvRowSeverity = "ok" | "warning" | "invalid";
/** Field-hint severity. "invalid" only ever comes from the timestamp policy. */
export type CsvRowHintSeverity = "warn" | "invalid" | "info";
/** Back-compat alias for the previous severity vocabulary used by the page. */
export type CsvRowHintLegacySeverity = "block" | "warn";

export interface CsvRowValidationHint {
  /** Canonical field name (e.g. "timestamp", "humidity", "substrate_ec"). */
  field: string;
  /** CSV header that was mapped to this canonical field, when available. */
  header: string | null;
  /** Raw cell value as it appeared in the CSV, when available. */
  rawValue: string | null;
  /** Field state at the time the hint was emitted. */
  state: CsvFieldState;
  severity: CsvRowHintSeverity;
  /** Stable machine code; UI keys/icons can switch on this. */
  code: string;
  /** Human-readable copy. Names the canonical field + header when present. */
  message: string;
}

export interface RowValidationOutcome {
  hints: CsvRowValidationHint[];
  fieldStates: Record<string, CsvFieldState>;
  severity: CsvRowSeverity;
  /** False when the row's timestamp is missing or invalid. */
  canonicalPreviewable: boolean;
}

export interface DeriveHintsArgs {
  row: RepresentativeDraftReading;
  mapping: RepresentativeColumnMapping;
  /**
   * Optional: canonical field → list of source headers that all match.
   * When length >= 2, a collision warning is emitted naming both headers.
   */
  ambiguousMappings?: Partial<Record<string, ReadonlyArray<string>>>;
}

// ---------- Internal helpers ----------

interface FieldMapInfo {
  header: string | null;
  unit: string | null;
}

function mapInfo(
  mapping: RepresentativeColumnMapping,
  field: RepresentativeMappingField,
): FieldMapInfo {
  const v = mapping[field];
  if (v === null) return { header: null, unit: null };
  if (typeof v === "string") return { header: v, unit: null };
  return { header: v.column, unit: "unit" in v ? v.unit : null };
}

function rawCell(row: RepresentativeDraftReading, header: string | null): string | null {
  if (!header) return null;
  const cell = row.raw_payload[header];
  if (cell === undefined || cell === null) return null;
  const trimmed = String(cell).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseFiniteNumber(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number(String(raw).replace(/[,_]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// ---------- Timestamp policy ----------

const ISO_WITH_TZ_RE = /T[\d:.\-+Z]+(?:Z|[+\-]\d{2}:?\d{2})$/;
const YEAR_ONLY_RE = /^\d{4}$/;
const HAS_TIME_COMPONENT_RE = /\d{1,2}:\d{2}/;

interface TimestampVerdict {
  state: CsvFieldState;
  severity: CsvRowHintSeverity | null;
  code: string | null;
  message: string | null;
}

function evaluateTimestamp(
  header: string | null,
  raw: string | null,
  parsed: string | null,
): TimestampVerdict {
  if (header === null) {
    return {
      state: "not_mapped",
      severity: "invalid",
      code: "timestamp_not_mapped",
      message: "timestamp — no header mapped",
    };
  }
  if (raw === null) {
    return {
      state: "mapped_unparseable",
      severity: "invalid",
      code: "timestamp_missing",
      message: `timestamp — header "${header}" maps OK; value is empty`,
    };
  }
  // Year-only "2026" — many engines accept it; we reject explicitly.
  if (YEAR_ONLY_RE.test(raw)) {
    return {
      state: "mapped_unparseable",
      severity: "invalid",
      code: "timestamp_year_only",
      message: `timestamp — value "${raw}" is year-only; not a valid timestamp`,
    };
  }
  if (parsed === null || !HAS_TIME_COMPONENT_RE.test(raw)) {
    return {
      state: "mapped_unparseable",
      severity: "invalid",
      code: "timestamp_unparseable",
      message: `timestamp — header "${header}" maps OK; value "${raw}" unparseable`,
    };
  }
  if (ISO_WITH_TZ_RE.test(raw)) {
    return { state: "mapped_parsed", severity: null, code: null, message: null };
  }
  return {
    state: "mapped_parsed",
    severity: "warn",
    code: "timestamp_no_timezone",
    message: `timestamp — value "${raw}" has no timezone; review timezone before trusting sequence`,
  };
}

// ---------- Field evaluators ----------

interface NumericFieldSpec {
  canonical: string;
  mappingField: RepresentativeMappingField;
  parsedValue: number | null;
  range?: { min: number; max: number };
}

function evaluateNumericField(
  spec: NumericFieldSpec,
  row: RepresentativeDraftReading,
  mapping: RepresentativeColumnMapping,
): { state: CsvFieldState; hints: CsvRowValidationHint[] } {
  const info = mapInfo(mapping, spec.mappingField);
  const raw = rawCell(row, info.header);
  const hints: CsvRowValidationHint[] = [];

  if (info.header === null) {
    hints.push({
      field: spec.canonical,
      header: null,
      rawValue: null,
      state: "not_mapped",
      severity: "warn",
      code: `${spec.canonical}_not_mapped`,
      message: `${spec.canonical} — no header mapped`,
    });
    return { state: "not_mapped", hints };
  }
  if (raw === null) {
    hints.push({
      field: spec.canonical,
      header: info.header,
      rawValue: null,
      state: "mapped_unparseable",
      severity: "warn",
      code: `${spec.canonical}_empty`,
      message: `${spec.canonical} — header "${info.header}" maps OK; value is empty`,
    });
    return { state: "mapped_unparseable", hints };
  }
  const rawNum = parseFiniteNumber(raw);
  if (rawNum === null || spec.parsedValue === null) {
    hints.push({
      field: spec.canonical,
      header: info.header,
      rawValue: raw,
      state: "mapped_unparseable",
      severity: "warn",
      code: `${spec.canonical}_unparseable`,
      message: `${spec.canonical} — header "${info.header}" maps OK; value "${raw}" unparseable`,
    });
    return { state: "mapped_unparseable", hints };
  }
  if (spec.range) {
    const { min, max } = spec.range;
    if (spec.parsedValue < min || spec.parsedValue > max) {
      hints.push({
        field: spec.canonical,
        header: info.header,
        rawValue: raw,
        state: "mapped_parsed",
        severity: "warn",
        code: `${spec.canonical}_out_of_range`,
        message: `${spec.canonical} — header "${info.header}" value "${raw}" is outside expected range ${min}–${max}`,
      });
    }
  }
  return { state: "mapped_parsed", hints };
}

// ---------- pH (read from raw_payload by header name) ----------

function findPhCell(row: RepresentativeDraftReading): {
  header: string;
  raw: string;
  value: number | null;
} | null {
  for (const [header, cell] of Object.entries(row.raw_payload)) {
    const name = header.toLowerCase().replace(/\s+/g, "_");
    if (name === "ph" || name.endsWith("_ph") || name.startsWith("ph_")) {
      const raw = String(cell ?? "").trim();
      if (!raw) continue;
      return { header, raw, value: parseFiniteNumber(raw) };
    }
  }
  return null;
}

// ---------- Mapping collision detection ----------

const CANONICAL_FIELDS_FOR_COLLISION: ReadonlyArray<RepresentativeMappingField> = [
  "timestamp",
  "air_temp",
  "substrate_temp",
  "humidity",
  "vpd",
  "co2",
  "ppfd",
  "vwc",
  "substrate_ec",
];

/**
 * Detect cases where ONE source header is mapped to MULTIPLE canonical
 * fields (e.g. "Temp" mapped to both air_temp and substrate_temp). Returns
 * mapping-level hints — not tied to a specific row.
 */
export function detectMappingCollisions(
  mapping: RepresentativeColumnMapping,
): CsvRowValidationHint[] {
  const headerToFields = new Map<string, RepresentativeMappingField[]>();
  for (const field of CANONICAL_FIELDS_FOR_COLLISION) {
    const info = mapInfo(mapping, field);
    if (!info.header) continue;
    const key = info.header.toLowerCase();
    const list = headerToFields.get(key) ?? [];
    list.push(field);
    headerToFields.set(key, list);
  }
  const hints: CsvRowValidationHint[] = [];
  for (const [, fields] of headerToFields) {
    if (fields.length < 2) continue;
    const header = mapInfo(mapping, fields[0]).header!;
    hints.push({
      field: fields.join("+"),
      header,
      rawValue: null,
      state: "mapped_parsed",
      severity: "warn",
      code: "header_mapped_to_multiple_fields",
      message: `header "${header}" is mapped to multiple canonical fields: ${fields.join(", ")}; review before trusting these fields`,
    });
  }
  return hints;
}

function emitAmbiguousMappingHints(
  ambiguous: Partial<Record<string, ReadonlyArray<string>>> | undefined,
): CsvRowValidationHint[] {
  if (!ambiguous) return [];
  const hints: CsvRowValidationHint[] = [];
  const keys = Object.keys(ambiguous).sort();
  for (const field of keys) {
    const headers = ambiguous[field];
    if (!headers || headers.length < 2) continue;
    const quoted = headers.map((h) => `"${h}"`).join(", ");
    hints.push({
      field,
      header: null,
      rawValue: null,
      state: "not_mapped",
      severity: "warn",
      code: "multiple_headers_for_field",
      message: `${field} — multiple headers mapped: ${quoted}; review before trusting this field`,
    });
  }
  return hints;
}

// ---------- Public entry point ----------

/** Mapping → canonical field name used in hint copy. */
const CANONICAL_NAME: Record<string, string> = {
  air_temp: "air_temp",
  substrate_temp: "substrate_temp",
  humidity: "humidity",
  vpd: "vpd",
  co2: "co2",
  ppfd: "ppfd",
  vwc: "vwc",
  substrate_ec: "soil_ec",
};

export function deriveCsvRowValidationHints(
  args: DeriveHintsArgs,
): RowValidationOutcome {
  const { row, mapping, ambiguousMappings } = args;
  const hints: CsvRowValidationHint[] = [];
  const fieldStates: Record<string, CsvFieldState> = {};

  // ----- Timestamp -----
  const tsInfo = mapInfo(mapping, "timestamp");
  const tsRaw = rawCell(row, tsInfo.header);
  const ts = evaluateTimestamp(tsInfo.header, tsRaw, row.captured_at);
  fieldStates.timestamp = ts.state;
  if (ts.code && ts.severity && ts.message) {
    hints.push({
      field: "timestamp",
      header: tsInfo.header,
      rawValue: tsRaw,
      state: ts.state,
      severity: ts.severity,
      code: ts.code,
      message: ts.message,
    });
  }
  const timestampInvalid = ts.state !== "mapped_parsed";

  // ----- Numeric fields -----
  const numericSpecs: NumericFieldSpec[] = [
    { canonical: CANONICAL_NAME.air_temp, mappingField: "air_temp", parsedValue: row.air_temp_c, range: CSV_VALIDATION_RANGES.airTempC },
    { canonical: CANONICAL_NAME.substrate_temp, mappingField: "substrate_temp", parsedValue: row.substrate_temp_c, range: CSV_VALIDATION_RANGES.substrateTempC },
    { canonical: CANONICAL_NAME.humidity, mappingField: "humidity", parsedValue: row.humidity_pct, range: CSV_VALIDATION_RANGES.humidity },
    { canonical: CANONICAL_NAME.vwc, mappingField: "vwc", parsedValue: row.vwc_pct, range: CSV_VALIDATION_RANGES.vwc },
    // CO2 / VPD / PPFD — parse-only this slice (no range).
    { canonical: CANONICAL_NAME.co2, mappingField: "co2", parsedValue: row.co2_ppm },
    { canonical: CANONICAL_NAME.vpd, mappingField: "vpd", parsedValue: row.vpd_kpa },
    { canonical: CANONICAL_NAME.ppfd, mappingField: "ppfd", parsedValue: row.ppfd },
    // EC has no range check — unit suspicion handled separately below.
    { canonical: CANONICAL_NAME.substrate_ec, mappingField: "substrate_ec", parsedValue: row.substrate_ec_mscm },
  ];

  for (const spec of numericSpecs) {
    const { state, hints: fh } = evaluateNumericField(spec, row, mapping);
    fieldStates[spec.canonical] = state;
    for (const h of fh) hints.push(h);
  }

  // ----- Humidity stuck at 0 / 100 -----
  if (row.humidity_pct !== null && HUMIDITY_STUCK_VALUES.includes(row.humidity_pct)) {
    const hInfo = mapInfo(mapping, "humidity");
    hints.push({
      field: CANONICAL_NAME.humidity,
      header: hInfo.header,
      rawValue: rawCell(row, hInfo.header),
      state: "mapped_parsed",
      severity: "warn",
      code: "humidity_stuck",
      message: `${CANONICAL_NAME.humidity} — header "${hInfo.header ?? "?"}" value "${row.humidity_pct}" may indicate a stuck or invalid sensor`,
    });
  }

  // ----- pH range check -----
  const ph = findPhCell(row);
  if (ph && ph.value !== null && (ph.value < PH_REALISTIC_RANGE.min || ph.value > PH_REALISTIC_RANGE.max)) {
    hints.push({
      field: "ph",
      header: ph.header,
      rawValue: ph.raw,
      state: "mapped_parsed",
      severity: "warn",
      code: "ph_out_of_range",
      message: `ph — header "${ph.header}" value "${ph.raw}" is outside the realistic ${PH_REALISTIC_RANGE.min}–${PH_REALISTIC_RANGE.max} cultivation range`,
    });
  }

  // ----- EC unit suspicion (warning only) -----
  const ecInfo = mapInfo(mapping, "substrate_ec");
  const ecRaw = rawCell(row, ecInfo.header);
  const ecRawNum = parseFiniteNumber(ecRaw);
  if (
    ecRawNum !== null &&
    ecInfo.unit === "mS/cm" &&
    ecRawNum > EC_SUSPICIOUS_MSCM_MAX
  ) {
    hints.push({
      field: CANONICAL_NAME.substrate_ec,
      header: ecInfo.header,
      rawValue: ecRaw,
      state: "mapped_parsed",
      severity: "warn",
      code: "ec_suspicious_units",
      message: `${CANONICAL_NAME.substrate_ec} — value "${ecRaw}" looks like µS/cm while mS/cm is selected; may be a unit mismatch`,
    });
  }

  // ----- Ambiguous-mapping (caller-provided) collision hints -----
  for (const h of emitAmbiguousMappingHints(ambiguousMappings)) hints.push(h);

  // ----- Row severity (precedence: invalid > warning > ok) -----
  let severity: CsvRowSeverity = "ok";
  if (timestampInvalid) severity = "invalid";
  else if (hints.some((h) => h.severity === "warn")) severity = "warning";

  return {
    hints,
    fieldStates,
    severity,
    canonicalPreviewable: !timestampInvalid,
  };
}
