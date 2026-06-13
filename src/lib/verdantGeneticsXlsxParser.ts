/**
 * verdantGeneticsXlsxParser — pure adapter for the Verdant Genetics
 * multi-tent XLSX export shape.
 *
 * Input is the already-extracted 2D cell grid (header row 1 = sensor
 * group / location, header row 2 = metric label, rows 3+ = readings).
 * Callers are responsible for turning .xlsx bytes into that grid — this
 * module performs NO file I/O, NO Supabase work, NO inserts, NO alerts,
 * NO Action Queue writes, NO AI calls, NO device control. Output is a
 * preview only.
 *
 * Every emitted metric row carries source = "csv". CSV-derived data is
 * historical context and MUST never render as live telemetry.
 */

import { computeVpdKpa } from "@/lib/csvParser";

export const VERDANT_GENETICS_SOURCE_TAG = "csv" as const;
export const VERDANT_GENETICS_SOURCE_APP = "verdant_genetics_xlsx" as const;

export type VerdantGeneticsMetric =
  | "temperature_c"
  | "humidity_pct"
  | "vpd_kpa"
  | "soil_moisture_pct";

export type VerdantGeneticsSuspiciousKind =
  | "humidity_stuck_zero"
  | "humidity_stuck_full"
  | "soil_moisture_stuck_zero"
  | "soil_moisture_stuck_full"
  | "impossible_temperature"
  | "impossible_humidity"
  | "missing_timestamp"
  | "duplicate_timestamp"
  | "high_rh_watch";

export interface VerdantGeneticsRawPayload {
  csv_import: true;
  source_app: typeof VERDANT_GENETICS_SOURCE_APP;
  sensor_group: string;
  original_metric_label: string;
  original_value: string | number | null;
  original_unit: string | null;
  calculated?: boolean;
  /** Battery voltages, AD counts, etc. preserved here only. */
  extras?: Record<string, string | number>;
}

export interface VerdantGeneticsPreviewMetricRow {
  captured_at: string; // ISO
  sensor_group: string;
  metric: VerdantGeneticsMetric;
  value: number;
  calculated: boolean;
  source: typeof VERDANT_GENETICS_SOURCE_TAG;
  raw_payload: VerdantGeneticsRawPayload;
}

export interface VerdantGeneticsSuspiciousFlag {
  kind: VerdantGeneticsSuspiciousKind;
  sensor_group: string | null;
  captured_at: string | null;
  metric: VerdantGeneticsMetric | null;
  value: number | null;
  note: string;
}

export interface VerdantGeneticsRejectedColumn {
  column_index: number;
  sensor_group: string;
  original_metric_label: string;
  reason:
    | "blank_metric_label"
    | "unsupported_metric"
    | "battery_preserved_in_raw"
    | "ad_preserved_in_raw";
}

export interface VerdantGeneticsPreviewSummary {
  detected_groups: string[];
  reading_group_count: number;
  date_range: { start: string; end: string } | null;
  mapped_metric_count: number;
  rejected_metric_count: number;
  suspicious_count: number;
  recommended_source: typeof VERDANT_GENETICS_SOURCE_TAG;
  source_app: typeof VERDANT_GENETICS_SOURCE_APP;
}

export interface VerdantGeneticsParseResult {
  rows: VerdantGeneticsPreviewMetricRow[];
  suspicious: VerdantGeneticsSuspiciousFlag[];
  rejected: VerdantGeneticsRejectedColumn[];
  summary: VerdantGeneticsPreviewSummary;
}

export type CellGrid = ReadonlyArray<ReadonlyArray<unknown>>;

interface ColumnMeta {
  index: number;
  sensor_group: string;
  original_label: string;
  metric: VerdantGeneticsMetric | null;
  unit: "F" | "C" | "%" | null;
  preserveOnly: "battery" | "ad" | null;
}

const TIMESTAMP_HEADERS = /^(timestamp|time|date|datetime|recorded.?at|captured.?at)$/i;
const HIGH_RH_WATCH_MIN = 94;
const HIGH_RH_WATCH_MAX = 97;

export function parseVerdantGeneticsXlsx(grid: CellGrid): VerdantGeneticsParseResult {
  const empty: VerdantGeneticsParseResult = {
    rows: [],
    suspicious: [],
    rejected: [],
    summary: {
      detected_groups: [],
      reading_group_count: 0,
      date_range: null,
      mapped_metric_count: 0,
      rejected_metric_count: 0,
      suspicious_count: 0,
      recommended_source: VERDANT_GENETICS_SOURCE_TAG,
      source_app: VERDANT_GENETICS_SOURCE_APP,
    },
  };
  if (!grid || grid.length < 3) return empty;

  const headerGroupRow = grid[0] ?? [];
  const headerMetricRow = grid[1] ?? [];
  const width = Math.max(headerGroupRow.length, headerMetricRow.length);

  // Forward-fill sensor group across merged header cells (row 1).
  const groupForCol: string[] = [];
  let lastGroup = "";
  for (let c = 0; c < width; c++) {
    const raw = cellText(headerGroupRow[c]);
    if (raw) lastGroup = raw;
    groupForCol.push(lastGroup);
  }

  const columns: ColumnMeta[] = [];
  const rejected: VerdantGeneticsRejectedColumn[] = [];
  let timestampCol = -1;

  for (let c = 0; c < width; c++) {
    const label = cellText(headerMetricRow[c]);
    const group = groupForCol[c];
    if (c === 0 || TIMESTAMP_HEADERS.test(label)) {
      if (timestampCol === -1) {
        timestampCol = c;
        continue;
      }
    }
    if (!label) {
      rejected.push({
        column_index: c,
        sensor_group: group,
        original_metric_label: "",
        reason: "blank_metric_label",
      });
      continue;
    }
    const mapping = classifyMetric(label);
    if (mapping.preserveOnly) {
      rejected.push({
        column_index: c,
        sensor_group: group,
        original_metric_label: label,
        reason:
          mapping.preserveOnly === "battery"
            ? "battery_preserved_in_raw"
            : "ad_preserved_in_raw",
      });
      columns.push({
        index: c,
        sensor_group: group,
        original_label: label,
        metric: null,
        unit: null,
        preserveOnly: mapping.preserveOnly,
      });
      continue;
    }
    if (!mapping.metric) {
      rejected.push({
        column_index: c,
        sensor_group: group,
        original_metric_label: label,
        reason: "unsupported_metric",
      });
      continue;
    }
    columns.push({
      index: c,
      sensor_group: group,
      original_label: label,
      metric: mapping.metric,
      unit: mapping.unit,
      preserveOnly: null,
    });
  }

  if (timestampCol === -1) return empty;

  const rows: VerdantGeneticsPreviewMetricRow[] = [];
  const suspicious: VerdantGeneticsSuspiciousFlag[] = [];

  // Track per-group/per-timestamp values to compute VPD + dup detection.
  const seenByGroup = new Map<string, Set<string>>();
  const tempByKey = new Map<string, number>(); // `${group}|${iso}` -> tempC
  const rhByKey = new Map<string, number>();
  const extrasByKey = new Map<string, Record<string, string | number>>();

  const detectedGroupsSet = new Set<string>();
  const isoTimestamps: string[] = [];
  let readingGroupCount = 0;

  for (let r = 2; r < grid.length; r++) {
    const row = grid[r] ?? [];
    if (isRowBlank(row)) continue;

    const rawTs = row[timestampCol];
    const iso = toIsoTimestamp(rawTs);
    if (!iso) {
      suspicious.push({
        kind: "missing_timestamp",
        sensor_group: null,
        captured_at: null,
        metric: null,
        value: null,
        note: `Row ${r + 1} has a missing or unparseable timestamp.`,
      });
      continue;
    }
    isoTimestamps.push(iso);
    readingGroupCount += 1;

    for (const col of columns) {
      const cell = row[col.index];
      const text = cellText(cell);
      if (text === "" || text === "-" || text.toLowerCase() === "null") continue;

      const group = col.sensor_group || "Unknown";
      detectedGroupsSet.add(group);

      const key = `${group}|${iso}`;

      // Duplicate timestamp per (group, metric)
      if (col.metric) {
        const seenKey = `${group}|${col.metric}`;
        const set = seenByGroup.get(seenKey) ?? new Set<string>();
        if (set.has(iso)) {
          suspicious.push({
            kind: "duplicate_timestamp",
            sensor_group: group,
            captured_at: iso,
            metric: col.metric,
            value: null,
            note: `Duplicate ${col.metric} reading for ${group} at ${iso}.`,
          });
        } else {
          set.add(iso);
          seenByGroup.set(seenKey, set);
        }
      }

      if (col.preserveOnly) {
        const extras = extrasByKey.get(key) ?? {};
        extras[col.original_label] = isNumericLike(text) ? Number(text) : text;
        extrasByKey.set(key, extras);
        continue;
      }

      const numeric = parseNumeric(text);
      if (numeric == null) continue;

      const base: VerdantGeneticsRawPayload = {
        csv_import: true,
        source_app: VERDANT_GENETICS_SOURCE_APP,
        sensor_group: group,
        original_metric_label: col.original_label,
        original_value: numeric,
        original_unit: col.unit,
      };

      if (col.metric === "temperature_c") {
        const tempC =
          col.unit === "F" ? (numeric - 32) * (5 / 9) : numeric;
        if (!Number.isFinite(tempC) || tempC < -20 || tempC > 70) {
          suspicious.push({
            kind: "impossible_temperature",
            sensor_group: group,
            captured_at: iso,
            metric: "temperature_c",
            value: tempC,
            note: `Temperature ${numeric}${col.unit ?? ""} for ${group} is outside a plausible range.`,
          });
          continue;
        }
        tempByKey.set(key, tempC);
        rows.push({
          captured_at: iso,
          sensor_group: group,
          metric: "temperature_c",
          value: round(tempC, 3),
          calculated: false,
          source: VERDANT_GENETICS_SOURCE_TAG,
          raw_payload: {
            ...base,
            original_value: numeric,
            original_unit: col.unit,
          },
        });
        continue;
      }

      if (col.metric === "humidity_pct") {
        let rh = numeric;
        if (rh > 0 && rh <= 1) rh = rh * 100;
        if (!Number.isFinite(rh) || rh < 0 || rh > 100) {
          suspicious.push({
            kind: "impossible_humidity",
            sensor_group: group,
            captured_at: iso,
            metric: "humidity_pct",
            value: rh,
            note: `Humidity ${numeric} for ${group} is outside 0–100%.`,
          });
          continue;
        }
        if (rh === 0) {
          suspicious.push({
            kind: "humidity_stuck_zero",
            sensor_group: group,
            captured_at: iso,
            metric: "humidity_pct",
            value: 0,
            note: `Humidity stuck at 0% for ${group} at ${iso}.`,
          });
        } else if (rh === 100) {
          suspicious.push({
            kind: "humidity_stuck_full",
            sensor_group: group,
            captured_at: iso,
            metric: "humidity_pct",
            value: 100,
            note: `Humidity stuck at 100% for ${group} at ${iso}.`,
          });
        } else if (rh >= HIGH_RH_WATCH_MIN && rh <= HIGH_RH_WATCH_MAX) {
          suspicious.push({
            kind: "high_rh_watch",
            sensor_group: group,
            captured_at: iso,
            metric: "humidity_pct",
            value: rh,
            note: `High humidity ${rh.toFixed(1)}% for ${group} — watch for mold risk.`,
          });
        }
        rhByKey.set(key, rh);
        rows.push({
          captured_at: iso,
          sensor_group: group,
          metric: "humidity_pct",
          value: round(rh, 2),
          calculated: false,
          source: VERDANT_GENETICS_SOURCE_TAG,
          raw_payload: { ...base, original_value: numeric, original_unit: "%" },
        });
        continue;
      }

      if (col.metric === "soil_moisture_pct") {
        let v = numeric;
        if (v > 0 && v <= 1) v = v * 100;
        if (!Number.isFinite(v) || v < 0 || v > 100) continue;
        if (v === 0) {
          suspicious.push({
            kind: "soil_moisture_stuck_zero",
            sensor_group: group,
            captured_at: iso,
            metric: "soil_moisture_pct",
            value: 0,
            note: `Soil moisture stuck at 0% for ${group} at ${iso}.`,
          });
        } else if (v === 100) {
          suspicious.push({
            kind: "soil_moisture_stuck_full",
            sensor_group: group,
            captured_at: iso,
            metric: "soil_moisture_pct",
            value: 100,
            note: `Soil moisture stuck at 100% for ${group} at ${iso}.`,
          });
        }
        rows.push({
          captured_at: iso,
          sensor_group: group,
          metric: "soil_moisture_pct",
          value: round(v, 2),
          calculated: false,
          source: VERDANT_GENETICS_SOURCE_TAG,
          raw_payload: { ...base, original_value: numeric, original_unit: "%" },
        });
        continue;
      }
    }
  }

  // Calculate VPD per (group, iso) when temp + RH both present and no
  // existing vpd metric was provided.
  for (const [key, tempC] of tempByKey) {
    const rh = rhByKey.get(key);
    if (rh == null) continue;
    const [group, iso] = key.split("|");
    const vpd = computeVpdKpa(tempC, rh);
    rows.push({
      captured_at: iso,
      sensor_group: group,
      metric: "vpd_kpa",
      value: round(vpd, 3),
      calculated: true,
      source: VERDANT_GENETICS_SOURCE_TAG,
      raw_payload: {
        csv_import: true,
        source_app: VERDANT_GENETICS_SOURCE_APP,
        sensor_group: group,
        original_metric_label: "calculated_from_temp_rh",
        original_value: null,
        original_unit: "kPa",
        calculated: true,
      },
    });
  }

  // Fold preserved extras (battery/AD) into the matching rows' raw payload
  // when one exists for the same key, else they remain implicit.
  for (const row of rows) {
    const key = `${row.sensor_group}|${row.captured_at}`;
    const extras = extrasByKey.get(key);
    if (extras && Object.keys(extras).length > 0) {
      row.raw_payload.extras = { ...(row.raw_payload.extras ?? {}), ...extras };
    }
  }

  const sortedTs = isoTimestamps.slice().sort();
  const dateRange =
    sortedTs.length > 0
      ? { start: sortedTs[0], end: sortedTs[sortedTs.length - 1] }
      : null;

  return {
    rows,
    suspicious,
    rejected,
    summary: {
      detected_groups: [...detectedGroupsSet],
      reading_group_count: readingGroupCount,
      date_range: dateRange,
      mapped_metric_count: rows.length,
      rejected_metric_count: rejected.length,
      suspicious_count: suspicious.length,
      recommended_source: VERDANT_GENETICS_SOURCE_TAG,
      source_app: VERDANT_GENETICS_SOURCE_APP,
    },
  };
}

// ------------------------------------------------------------------
// helpers
// ------------------------------------------------------------------

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

function isRowBlank(row: ReadonlyArray<unknown>): boolean {
  return row.every((c) => cellText(c) === "");
}

function isNumericLike(s: string): boolean {
  return s !== "" && Number.isFinite(Number(s));
}

function parseNumeric(s: string): number | null {
  const cleaned = s.replace(/[%\s]/g, "").replace(/,/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function round(n: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

function toIsoTimestamp(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    // Excel serial date (days since 1899-12-30)
    const ms = Math.round((v - 25569) * 86400 * 1000);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }
  const s = String(v).trim();
  if (!s) return null;
  // Accept "YYYY-MM-DD HH:mm[:ss]" as UTC, plus ISO-with-Z, plus "YYYY/MM/DD".
  const m = s.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?Z?$/,
  );
  if (m) {
    const [, y, mo, d, h, mi, se] = m;
    const dt = Date.UTC(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(h),
      Number(mi),
      Number(se ?? 0),
    );
    return Number.isFinite(dt) ? new Date(dt).toISOString() : null;
  }
  const parsed = Date.parse(s);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

interface MetricClassification {
  metric: VerdantGeneticsMetric | null;
  unit: "F" | "C" | "%" | null;
  preserveOnly: "battery" | "ad" | null;
}

function classifyMetric(label: string): MetricClassification {
  const k = label.toLowerCase().trim();
  if (/battery|batt|voltage|volts?\b/.test(k)) {
    return { metric: null, unit: null, preserveOnly: "battery" };
  }
  if (/^ad(\b|_)|\bad raw\b|\badc\b/.test(k)) {
    return { metric: null, unit: null, preserveOnly: "ad" };
  }
  if (/soil.*(moist|water|vwc)|vwc|water.?content/.test(k)) {
    return { metric: "soil_moisture_pct", unit: "%", preserveOnly: null };
  }
  if (/(humidity|^rh\b|\brh\b|relative.?humidity)/.test(k)) {
    return { metric: "humidity_pct", unit: "%", preserveOnly: null };
  }
  if (/temp/.test(k) && !/set.?point|target/.test(k)) {
    const unit: "F" | "C" =
      /°?f\b|fahrenheit|temp_f|\(f\)/.test(k) ? "F"
      : /°?c\b|celsius|temp_c|\(c\)/.test(k) ? "C"
      : "F"; // Verdant Genetics export defaults to Fahrenheit
    return { metric: "temperature_c", unit, preserveOnly: null };
  }
  return { metric: null, unit: null, preserveOnly: null };
}
