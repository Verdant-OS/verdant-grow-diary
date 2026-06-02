/**
 * Representative CSV Sensor Preview — pure normalization helpers.
 *
 * Scope: preview-only intake of a SYNTHETIC, AROYA-shaped representative
 * CSV sample for testing Verdant's partner-data intake workflow. This is
 * NOT a confirmed AROYA production importer.
 *
 * Hard constraints (enforced by tests + static scan):
 *  - Pure: no I/O, no Supabase, no React, no timers, no globals.
 *  - No DB writes: no insert/upsert/rpc/functions.invoke.
 *  - No alerts, no action_queue, no AI Doctor calls.
 *  - No service_role, no client user_id, no automation/device control.
 *  - Never labels preview rows as "live" data.
 *  - Preserves raw_payload verbatim for every parsed row.
 *  - Canonical units only; temperature display conversion happens in the
 *    presenter, not here.
 *
 * Expected representative columns (case-insensitive header match):
 *   Timestamp, Facility, Room, Zone, Sensor,
 *   Substrate_VWC_%, Substrate_EC_mS/cm, Substrate_Temp_C,
 *   Air_Temp_C, Humidity_%, VPD_kPa, CO2_ppm, PPFD_umol
 */

import { parseCsv, type ParsedCsv } from "@/lib/csvSensorImportRules";

// Re-export the shared parser so callers don't reach into csvSensorImportRules
// for parsing concerns specific to the preview flow.
export { parseCsv };
export type { ParsedCsv };

export const REPRESENTATIVE_CSV_SOURCE = "csv" as const;
export const REPRESENTATIVE_CSV_DATA_CONTEXT = "representative_sample" as const;

export type RepresentativeRowState = "valid" | "warning" | "invalid";

export interface RepresentativeRawPayload {
  /** Original header→cell map for the row, exactly as parsed. */
  [columnName: string]: string;
}

export interface RepresentativeDraftReading {
  /** Row number from the CSV body (0-based, header excluded). */
  rowIndex: number;
  /** ISO-8601 UTC timestamp parsed from Timestamp column, or null when invalid. */
  captured_at: string | null;
  /** Always "csv" for this flow. Never "live". */
  source: typeof REPRESENTATIVE_CSV_SOURCE;
  /** Always "representative_sample". Marks the data as demo/preview. */
  data_context: typeof REPRESENTATIVE_CSV_DATA_CONTEXT;
  /** Untouched header→cell snapshot of the source row. */
  raw_payload: RepresentativeRawPayload;
  /** Identifying context, never auto-mapped to a Verdant tent_id. */
  facility: string | null;
  room: string | null;
  zone: string | null;
  sensor: string | null;
  /** Canonical units. Null when missing/non-finite. */
  air_temp_c: number | null;
  substrate_temp_c: number | null;
  humidity_pct: number | null;
  vpd_kpa: number | null;
  co2_ppm: number | null;
  ppfd: number | null;
  vwc_pct: number | null;
  substrate_ec_mscm: number | null;
  /** Row-level validation outcome. */
  state: RepresentativeRowState;
  reasons: string[];
}

// ----- Column header detection (synonym-tolerant, case-insensitive) -----

const HEADER_SYNONYMS: Record<string, ReadonlyArray<string>> = {
  timestamp: ["timestamp", "time", "datetime", "date_time"],
  facility: ["facility", "site"],
  room: ["room"],
  zone: ["zone"],
  sensor: ["sensor", "sensor_id", "device", "probe"],
  air_temp_c: ["air_temp_c", "air temperature c", "air_temp", "air temp c"],
  substrate_temp_c: ["substrate_temp_c", "substrate temp c", "substrate_temperature_c"],
  humidity_pct: ["humidity_%", "humidity", "rh", "humidity_pct", "humidity %"],
  vpd_kpa: ["vpd_kpa", "vpd", "vpd kpa"],
  co2_ppm: ["co2_ppm", "co2", "co2 ppm"],
  ppfd: ["ppfd_umol", "ppfd", "ppfd umol"],
  vwc_pct: ["substrate_vwc_%", "vwc", "vwc_%", "substrate_vwc", "vwc %"],
  substrate_ec_mscm: [
    "substrate_ec_ms/cm",
    "substrate_ec_mscm",
    "ec",
    "substrate_ec",
    "ec_ms/cm",
    "ec mscm",
  ],
};

function normalizeHeader(raw: string): string {
  return String(raw ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

export interface RepresentativeColumnPlan {
  [logicalKey: string]: number | null;
}

export function planRepresentativeColumns(
  headers: ReadonlyArray<string>,
): RepresentativeColumnPlan {
  const normalizedHeaders = headers.map(normalizeHeader);
  const plan: RepresentativeColumnPlan = {};
  for (const [key, synonyms] of Object.entries(HEADER_SYNONYMS)) {
    plan[key] = null;
    for (const syn of synonyms) {
      const target = normalizeHeader(syn);
      const idx = normalizedHeaders.indexOf(target);
      if (idx >= 0) {
        plan[key] = idx;
        break;
      }
    }
  }
  return plan;
}

// ----- Cell parsing -----

function pickCell(cells: ReadonlyArray<string>, idx: number | null): string | null {
  if (idx === null || idx < 0 || idx >= cells.length) return null;
  const raw = cells[idx];
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseFiniteNumber(raw: string | null): number | null {
  if (raw === null) return null;
  const cleaned = raw.replace(/[,_]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseTimestamp(raw: string | null): string | null {
  if (!raw) return null;
  // Accept "YYYY-MM-DD HH:MM:SS" by swapping the space for ISO "T".
  const candidate = raw.includes("T") ? raw : raw.replace(" ", "T");
  const ms = new Date(candidate).getTime();
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

// ----- Per-row normalization -----

/** Unit selectors applied AFTER explicit mapping. */
export type TempUnit = "C" | "F";
export type EcUnit = "mS/cm" | "uS/cm";

export interface NormalizeRowUnits {
  airTempUnit?: TempUnit;
  substrateTempUnit?: TempUnit;
  ecUnit?: EcUnit;
}

export interface NormalizeRowArgs {
  cells: ReadonlyArray<string>;
  headers: ReadonlyArray<string>;
  plan: RepresentativeColumnPlan;
  rowIndex: number;
  units?: NormalizeRowUnits;
}

function buildRawPayload(
  headers: ReadonlyArray<string>,
  cells: ReadonlyArray<string>,
): RepresentativeRawPayload {
  const payload: RepresentativeRawPayload = {};
  for (let i = 0; i < headers.length; i++) {
    payload[headers[i]] = cells[i] ?? "";
  }
  return payload;
}

function fToC(f: number): number {
  return (f - 32) * (5 / 9);
}

function usToMs(us: number): number {
  return us / 1000;
}

/**
 * Normalize a single parsed CSV row into a draft reading. Pure and
 * deterministic. Never mutates inputs.
 */
export function normalizeRepresentativeRow(
  args: NormalizeRowArgs,
): RepresentativeDraftReading {
  const { cells, headers, plan, rowIndex, units } = args;
  const airTempUnit: TempUnit = units?.airTempUnit ?? "C";
  const subTempUnit: TempUnit = units?.substrateTempUnit ?? "C";
  const ecUnit: EcUnit = units?.ecUnit ?? "mS/cm";

  const raw_payload = buildRawPayload(headers, cells);
  const reasons: string[] = [];

  const tsCell = pickCell(cells, plan.timestamp ?? null);
  const captured_at = parseTimestamp(tsCell);

  if (!tsCell) reasons.push("missing_timestamp");
  else if (!captured_at) reasons.push("invalid_timestamp");

  const rawAirTempNum = parseFiniteNumber(pickCell(cells, plan.air_temp_c ?? null));
  const rawSubTempNum = parseFiniteNumber(
    pickCell(cells, plan.substrate_temp_c ?? null),
  );
  const rawEcNum = parseFiniteNumber(pickCell(cells, plan.substrate_ec_mscm ?? null));

  const air_temp_c =
    rawAirTempNum === null ? null : airTempUnit === "F" ? fToC(rawAirTempNum) : rawAirTempNum;
  const substrate_temp_c =
    rawSubTempNum === null ? null : subTempUnit === "F" ? fToC(rawSubTempNum) : rawSubTempNum;
  const substrate_ec_mscm =
    rawEcNum === null ? null : ecUnit === "uS/cm" ? usToMs(rawEcNum) : rawEcNum;

  const humidity_pct = parseFiniteNumber(pickCell(cells, plan.humidity_pct ?? null));
  const vpd_kpa = parseFiniteNumber(pickCell(cells, plan.vpd_kpa ?? null));
  const co2_ppm = parseFiniteNumber(pickCell(cells, plan.co2_ppm ?? null));
  const ppfd = parseFiniteNumber(pickCell(cells, plan.ppfd ?? null));
  const vwc_pct = parseFiniteNumber(pickCell(cells, plan.vwc_pct ?? null));

  // Raw-cell sanity: present-but-unparseable values flag the row.
  const rawHumidity = pickCell(cells, plan.humidity_pct ?? null);
  if (rawHumidity !== null && humidity_pct === null) reasons.push("humidity_non_finite");
  const rawVwc = pickCell(cells, plan.vwc_pct ?? null);
  if (rawVwc !== null && vwc_pct === null) reasons.push("vwc_non_finite");
  const rawEcCell = pickCell(cells, plan.substrate_ec_mscm ?? null);
  if (rawEcCell !== null && substrate_ec_mscm === null) reasons.push("ec_non_finite");
  const rawAirTempCell = pickCell(cells, plan.air_temp_c ?? null);
  if (rawAirTempCell !== null && air_temp_c === null) reasons.push("air_temp_non_finite");
  const rawSubTempCell = pickCell(cells, plan.substrate_temp_c ?? null);
  if (rawSubTempCell !== null && substrate_temp_c === null) reasons.push("substrate_temp_non_finite");

  // Range checks (post unit conversion, canonical units).
  if (humidity_pct !== null && (humidity_pct < 0 || humidity_pct > 100)) {
    reasons.push("humidity_out_of_range");
  }
  if (vwc_pct !== null && (vwc_pct < 0 || vwc_pct > 100)) {
    reasons.push("vwc_out_of_range");
  }
  if (vpd_kpa !== null && vpd_kpa < 0) reasons.push("vpd_negative");
  if (substrate_ec_mscm !== null && substrate_ec_mscm < 0) {
    reasons.push("ec_impossible");
  }
  if (air_temp_c !== null && (air_temp_c < -50 || air_temp_c > 80)) {
    reasons.push("air_temp_impossible");
  }
  if (substrate_temp_c !== null && (substrate_temp_c < -50 || substrate_temp_c > 80)) {
    reasons.push("substrate_temp_impossible");
  }

  const invalidReasons = new Set([
    "missing_timestamp",
    "invalid_timestamp",
    "humidity_non_finite",
    "vwc_non_finite",
    "ec_non_finite",
    "air_temp_non_finite",
    "substrate_temp_non_finite",
  ]);
  const warningReasons = new Set([
    "humidity_out_of_range",
    "vwc_out_of_range",
    "vpd_negative",
    "ec_impossible",
    "air_temp_impossible",
    "substrate_temp_impossible",
  ]);

  let state: RepresentativeRowState = "valid";
  if (reasons.some((r) => invalidReasons.has(r))) state = "invalid";
  else if (reasons.some((r) => warningReasons.has(r))) state = "warning";

  return {
    rowIndex,
    captured_at,
    source: REPRESENTATIVE_CSV_SOURCE,
    data_context: REPRESENTATIVE_CSV_DATA_CONTEXT,
    raw_payload,
    facility: pickCell(cells, plan.facility ?? null),
    room: pickCell(cells, plan.room ?? null),
    zone: pickCell(cells, plan.zone ?? null),
    sensor: pickCell(cells, plan.sensor ?? null),
    air_temp_c,
    substrate_temp_c,
    humidity_pct,
    vpd_kpa,
    co2_ppm,
    ppfd,
    vwc_pct,
    substrate_ec_mscm,
    state,
    reasons,
  };
}

// ----- Explicit column + unit mapping (preview-only) -----

/**
 * Logical canonical fields a user can map CSV headers to. The mapping is
 * EXPLICIT and never inferred into Verdant grow_id / tent_id / plant_id.
 * Facility/Room/Zone are preserved as identifying context only.
 */
export interface RepresentativeColumnMapping {
  timestamp: string | null;
  sensor: string | null;
  facility: string | null;
  room: string | null;
  zone: string | null;
  air_temp: { column: string | null; unit: TempUnit };
  substrate_temp: { column: string | null; unit: TempUnit };
  humidity: { column: string | null };
  vpd: { column: string | null };
  co2: { column: string | null };
  ppfd: { column: string | null };
  vwc: { column: string | null };
  substrate_ec: { column: string | null; unit: EcUnit };
}

/** Canonical field keys exposed to the UI for building mapping controls. */
export const REPRESENTATIVE_MAPPING_FIELDS = [
  "timestamp",
  "sensor",
  "facility",
  "room",
  "zone",
  "air_temp",
  "substrate_temp",
  "humidity",
  "vpd",
  "co2",
  "ppfd",
  "vwc",
  "substrate_ec",
] as const;

export type RepresentativeMappingField = (typeof REPRESENTATIVE_MAPPING_FIELDS)[number];

/** Default empty mapping with canonical units. */
export function emptyRepresentativeMapping(): RepresentativeColumnMapping {
  return {
    timestamp: null,
    sensor: null,
    facility: null,
    room: null,
    zone: null,
    air_temp: { column: null, unit: "C" },
    substrate_temp: { column: null, unit: "C" },
    humidity: { column: null },
    vpd: { column: null },
    co2: { column: null },
    ppfd: { column: null },
    vwc: { column: null },
    substrate_ec: { column: null, unit: "mS/cm" },
  };
}

const MAPPING_TO_PLAN_KEY: Record<RepresentativeMappingField, keyof RepresentativeColumnPlan> = {
  timestamp: "timestamp",
  sensor: "sensor",
  facility: "facility",
  room: "room",
  zone: "zone",
  air_temp: "air_temp_c",
  substrate_temp: "substrate_temp_c",
  humidity: "humidity_pct",
  vpd: "vpd_kpa",
  co2: "co2_ppm",
  ppfd: "ppfd",
  vwc: "vwc_pct",
  substrate_ec: "substrate_ec_mscm",
};

function indexOfHeader(headers: ReadonlyArray<string>, name: string | null): number | null {
  if (!name) return null;
  const target = normalizeHeader(name);
  const idx = headers.map(normalizeHeader).indexOf(target);
  return idx >= 0 ? idx : null;
}

/**
 * Build a default mapping by running the existing synonym detector against
 * the parsed headers. The result is pure and safe to feed back to the UI.
 */
export function defaultMappingFromHeaders(
  headers: ReadonlyArray<string>,
): RepresentativeColumnMapping {
  const plan = planRepresentativeColumns(headers);
  const mapping = emptyRepresentativeMapping();
  for (const field of REPRESENTATIVE_MAPPING_FIELDS) {
    const planKey = MAPPING_TO_PLAN_KEY[field];
    const idx = plan[planKey];
    const header = idx !== null && idx !== undefined ? headers[idx] ?? null : null;
    if (header === null) continue;
    if (field === "air_temp" || field === "substrate_temp") {
      mapping[field] = { column: header, unit: "C" };
    } else if (field === "substrate_ec") {
      mapping[field] = { column: header, unit: "mS/cm" };
    } else if (
      field === "humidity" ||
      field === "vpd" ||
      field === "co2" ||
      field === "ppfd" ||
      field === "vwc"
    ) {
      mapping[field] = { column: header };
    } else {
      mapping[field] = header;
    }
  }
  return mapping;
}

/** Convert an explicit user mapping into the index-based column plan. */
export function planFromMapping(
  headers: ReadonlyArray<string>,
  mapping: RepresentativeColumnMapping,
): RepresentativeColumnPlan {
  const plan: RepresentativeColumnPlan = {};
  for (const field of REPRESENTATIVE_MAPPING_FIELDS) {
    const planKey = MAPPING_TO_PLAN_KEY[field];
    const value = mapping[field];
    const column =
      typeof value === "string" || value === null
        ? (value as string | null)
        : value.column;
    plan[planKey] = indexOfHeader(headers, column);
  }
  return plan;
}

export interface PreviewSummary {
  total: number;
  valid: number;
  warning: number;
  invalid: number;
}

export interface RepresentativePreviewResult {
  headers: string[];
  plan: RepresentativeColumnPlan;
  mapping: RepresentativeColumnMapping;
  rows: RepresentativeDraftReading[];
  summary: PreviewSummary;
}

export interface PreviewOptions {
  /** Explicit user-chosen mapping. When omitted, synonym auto-detect runs. */
  mapping?: RepresentativeColumnMapping;
}

/**
 * End-to-end preview: parse CSV text → resolve mapping → plan columns →
 * normalize every row. Duplicate timestamps across different sensors are
 * preserved as distinct rows (no collapsing).
 *
 * Accepts an optional explicit mapping; when omitted, falls back to the
 * synonym-based default for backward compatibility.
 */
export function previewRepresentativeCsv(
  text: string,
  options?: PreviewOptions,
): RepresentativePreviewResult {
  const parsed = parseCsv(text);
  const mapping = options?.mapping ?? defaultMappingFromHeaders(parsed.headers);
  const plan = planFromMapping(parsed.headers, mapping);
  const units: NormalizeRowUnits = {
    airTempUnit: mapping.air_temp.unit,
    substrateTempUnit: mapping.substrate_temp.unit,
    ecUnit: mapping.substrate_ec.unit,
  };
  const rows = parsed.rows.map((cells, idx) =>
    normalizeRepresentativeRow({
      cells,
      headers: parsed.headers,
      plan,
      rowIndex: idx,
      units,
    }),
  );
  const summary: PreviewSummary = {
    total: rows.length,
    valid: rows.filter((r) => r.state === "valid").length,
    warning: rows.filter((r) => r.state === "warning").length,
    invalid: rows.filter((r) => r.state === "invalid").length,
  };
  return { headers: [...parsed.headers], plan, mapping, rows, summary };
}

/** Presenter-only helper. Pure. Never call from the normalizer. */
export function cToF(c: number | null): number | null {
  if (c === null || !Number.isFinite(c)) return null;
  return c * (9 / 5) + 32;
}

