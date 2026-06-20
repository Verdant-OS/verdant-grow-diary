/**
 * sensorImportSourceApps — pure source-app registry for historical sensor
 * CSV imports.
 *
 * Scope: read-only logic. No I/O, no fetch, no Supabase, no AI, no alerts,
 * no Action Queue writes, no device control, no automation. The output is a
 * deterministic preview summary describing how a given CSV would be mapped
 * if persisted; actual persistence lives in csvSensorImportRules (AC
 * Infinity) and is intentionally not modified here.
 *
 * Canonical metric vocabulary used by the preview layer (vendor-neutral):
 *   - temp_f             (°F, preserve raw °C separately when present)
 *   - humidity_pct
 *   - vpd_kpa
 *   - co2_ppm            (numeric only)
 *   - ppfd_umol_m2_s     (numeric only)
 *
 * Source apps emit canonical `source = "csv"` and store vendor identity
 * separately in `source_app`. CSV rows are never live data.
 */

import { parseCsv } from "@/lib/csvSensorImportRules";

// ---------- constants ----------

export const SENSOR_IMPORT_CANONICAL_SOURCE = "csv" as const;

export type SourceAppId =
  | "ac_infinity"
  | "spider_farmer"
  | "vivosun"
  | "unknown_source_app";

export type CanonicalMetric =
  | "temp_f"
  | "humidity_pct"
  | "vpd_kpa"
  | "co2_ppm"
  | "ppfd_umol_m2_s";

export const SOURCE_APP_LABELS: Record<SourceAppId, string> = {
  ac_infinity: "AC Infinity",
  spider_farmer: "Spider Farmer / THP Data",
  vivosun: "Vivosun / GrowHub",
  unknown_source_app: "Unknown CSV source",
};

// ---------- BOM-safe header normalization ----------

/** Strip UTF-8 BOM + outer whitespace. Preserves inner casing/punctuation. */
export function stripBomAndTrim(s: string): string {
  return String(s ?? "").replace(/^\uFEFF/, "").trim();
}

/** Lowercase + collapse whitespace, BOM-stripped — for header matching only. */
function normHeader(s: string): string {
  return stripBomAndTrim(s).toLowerCase().replace(/\s+/g, " ");
}

/** Returns a cleaned (BOM-stripped, trimmed) copy of the header list. */
export function cleanHeaders(headers: ReadonlyArray<string>): string[] {
  return headers.map(stripBomAndTrim);
}

// ---------- detection ----------

export interface SourceAppDetection {
  id: SourceAppId;
  confidence: "high" | "medium" | "low" | "none";
  reason: string;
}

const AC_INFINITY_REQUIRED = ["timestamp"]; // generic — plus temperature/humidity
const SPIDER_FARMER_MARKER = "deviceserialnum";
const SPIDER_FARMER_ALT = "temperature(°c)";
const VIVOSUN_MARKERS = ["timestamp(1 min)", "probe temperature", "built-in temperature"];

export function detectSourceApp(
  rawHeaders: ReadonlyArray<string>,
): SourceAppDetection {
  const normed = cleanHeaders(rawHeaders).map((h) => h.toLowerCase());
  const set = new Set(normed);

  // Vivosun: distinctive `Timestamp(1 min)` + Probe/Built-in pairs.
  const vivosunHits = VIVOSUN_MARKERS.filter((m) =>
    normed.some((h) => h.includes(m)),
  );
  if (vivosunHits.length >= 2) {
    return {
      id: "vivosun",
      confidence: vivosunHits.length === 3 ? "high" : "medium",
      reason: `vivosun_markers:${vivosunHits.length}/3`,
    };
  }

  // Spider Farmer / THP: `deviceSerialnum` + `temperature(°C)` columns.
  if (set.has(SPIDER_FARMER_MARKER) || normed.some((h) => h === SPIDER_FARMER_ALT)) {
    const richness =
      Number(set.has("co2")) +
      Number(set.has("ppfd")) +
      Number(set.has("vpd")) +
      Number(set.has("humidity")) +
      Number(normed.some((h) => h === "temperature(°f)"));
    return {
      id: "spider_farmer",
      confidence: richness >= 4 ? "high" : richness >= 2 ? "medium" : "low",
      reason: `spider_farmer_markers:device_serial+${richness}`,
    };
  }

  // AC Infinity: generic `Timestamp` (or Date/Time pair) + Temperature column,
  // but no vendor-specific marker. Be conservative: only claim AC Infinity
  // when temperature header carries an explicit unit annotation typical of
  // AC Infinity exports — otherwise fall through to unknown.
  const hasTimestamp = normed.some((h) =>
    /(^|[^a-z])timestamp([^a-z]|$)|^date$|^date time$/.test(h),
  );
  const hasAcTempCol = normed.some(
    (h) =>
      /temperature\s*\(\s*°?\s*[cf]\s*\)/.test(h) ||
      /^temp\s*\(\s*°?\s*[cf]\s*\)/.test(h) ||
      /^temperature\b/.test(h),
  );
  if (hasTimestamp && hasAcTempCol) {
    return {
      id: "ac_infinity",
      confidence: "medium",
      reason: "generic_timestamp_plus_temperature",
    };
  }
  // Date+Time pair fallback
  if (normed.includes("date") && normed.includes("time") && hasAcTempCol) {
    return {
      id: "ac_infinity",
      confidence: "medium",
      reason: "date_time_pair_plus_temperature",
    };
  }

  return {
    id: "unknown_source_app",
    confidence: "none",
    reason: "no_known_markers",
  };
}

// ---------- per-app column mapping ----------

export interface ColumnMapping {
  /** Canonical-metric → header (original cleaned header name). */
  mapped: Partial<Record<CanonicalMetric, string>>;
  /** Header used for captured timestamp. */
  timestamp: string | null;
  /** Cleaned headers not mapped to any canonical metric or timestamp. */
  unmapped: string[];
  /** Vendor/raw metadata headers (kept for provenance, not metrics). */
  rawProvenance: string[];
}

function findHeader(
  headers: ReadonlyArray<string>,
  predicate: (lower: string, original: string) => boolean,
): string | null {
  for (const h of headers) {
    if (predicate(h.toLowerCase(), h)) return h;
  }
  return null;
}

export function mapColumnsForSpiderFarmer(
  rawHeaders: ReadonlyArray<string>,
): ColumnMapping {
  const headers = cleanHeaders(rawHeaders);
  const tempF = findHeader(headers, (l) => l === "temperature(°f)");
  const tempC = findHeader(headers, (l) => l === "temperature(°c)");
  const hum = findHeader(headers, (l) => l === "humidity");
  const vpd = findHeader(headers, (l) => l === "vpd");
  const co2 = findHeader(headers, (l) => l === "co2");
  const ppfd = findHeader(headers, (l) => l === "ppfd");
  const ts = findHeader(headers, (l) => l === "timestamp");

  const mapped: ColumnMapping["mapped"] = {};
  if (tempF) mapped.temp_f = tempF;
  if (hum) mapped.humidity_pct = hum;
  if (vpd) mapped.vpd_kpa = vpd;
  if (co2) mapped.co2_ppm = co2;
  if (ppfd) mapped.ppfd_umol_m2_s = ppfd;

  // Vendor provenance columns — never mapped as metrics.
  const rawProvenance = headers.filter((h) =>
    ["deviceserialnum", "roomid", "sensorid"].includes(h.toLowerCase()),
  );
  // °C column is kept for raw/validation only; do not double-emit when °F
  // is present. If °F is missing, fall back to °C — but only as raw, since
  // canonical metric is `temp_f`. (Fixtures always carry both.)
  if (tempC && tempF) rawProvenance.push(tempC);

  const usedSet = new Set<string>(
    [tempF, hum, vpd, co2, ppfd, ts, ...rawProvenance].filter(Boolean) as string[],
  );
  const unmapped = headers.filter((h) => !usedSet.has(h));

  return { mapped, timestamp: ts, unmapped, rawProvenance };
}

export function mapColumnsForVivosun(
  rawHeaders: ReadonlyArray<string>,
): ColumnMapping {
  const headers = cleanHeaders(rawHeaders);
  const ts = findHeader(headers, (l) => l.startsWith("timestamp"));
  const probeTemp = findHeader(headers, (l) =>
    /^probe temperature/.test(l),
  );
  const probeHum = findHeader(headers, (l) => /^probe humidity/.test(l));
  const probeVpd = findHeader(headers, (l) => /^probe vpd/.test(l));
  const probeCo2 = findHeader(headers, (l) => /^probe co2/.test(l));

  const mapped: ColumnMapping["mapped"] = {};
  if (probeTemp) mapped.temp_f = probeTemp;
  if (probeHum) mapped.humidity_pct = probeHum;
  if (probeVpd) mapped.vpd_kpa = probeVpd;
  if (probeCo2) mapped.co2_ppm = probeCo2;

  // Built-in columns are explicitly preserved as raw/secondary metadata —
  // they must NEVER overwrite the canonical Probe mappings.
  const rawProvenance = headers.filter((h) => /^built-in /i.test(h));

  const usedSet = new Set<string>(
    [ts, probeTemp, probeHum, probeVpd, probeCo2, ...rawProvenance].filter(
      Boolean,
    ) as string[],
  );
  const unmapped = headers.filter((h) => !usedSet.has(h));

  return { mapped, timestamp: ts, unmapped, rawProvenance };
}

export function mapColumnsForAcInfinity(
  rawHeaders: ReadonlyArray<string>,
): ColumnMapping {
  const headers = cleanHeaders(rawHeaders);
  const ts = findHeader(headers, (l) => /^timestamp/.test(l));
  const tempF = findHeader(headers, (l) =>
    /^temperature\s*\(\s*°?\s*f\s*\)/.test(l),
  );
  const tempC = findHeader(headers, (l) =>
    /^temperature\s*\(\s*°?\s*c\s*\)/.test(l),
  );
  const hum = findHeader(headers, (l) => /^humidity/.test(l) || /^rh\b/.test(l));
  const vpd = findHeader(headers, (l) => /^vpd/.test(l));
  const co2 = findHeader(headers, (l) => /^co2/.test(l));

  const mapped: ColumnMapping["mapped"] = {};
  if (tempF) mapped.temp_f = tempF;
  else if (tempC) mapped.temp_f = tempC; // canonical via conversion in persistence path
  if (hum) mapped.humidity_pct = hum;
  if (vpd) mapped.vpd_kpa = vpd;
  if (co2) mapped.co2_ppm = co2;

  const rawProvenance: string[] = [];
  if (tempF && tempC) rawProvenance.push(tempC);

  const usedSet = new Set<string>(
    [ts, tempF, tempC, hum, vpd, co2].filter(Boolean) as string[],
  );
  const unmapped = headers.filter((h) => !usedSet.has(h));
  return { mapped, timestamp: ts, unmapped, rawProvenance };
}

export function mapColumnsForApp(
  app: SourceAppId,
  rawHeaders: ReadonlyArray<string>,
): ColumnMapping {
  switch (app) {
    case "spider_farmer":
      return mapColumnsForSpiderFarmer(rawHeaders);
    case "vivosun":
      return mapColumnsForVivosun(rawHeaders);
    case "ac_infinity":
      return mapColumnsForAcInfinity(rawHeaders);
    case "unknown_source_app":
      return {
        mapped: {},
        timestamp: null,
        unmapped: cleanHeaders(rawHeaders),
        rawProvenance: [],
      };
  }
}

// ---------- value parsing helpers ----------

/** Parse numeric metric cell. Treats `-`, blank, `--`, `n/a` as empty/null. */
export function parseMetricCell(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (/^(-|--|n\/?a|null|none)$/i.test(trimmed)) return null;
  const n = Number(trimmed.replace(/[,_]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// ---------- preview summary ----------

export type PreviewWarningCode =
  | "co2_column_empty"
  | "celsius_shown_as_fahrenheit"
  | "ec_unit_suspicion_us_per_cm"
  | "humidity_stuck"
  | "soil_moisture_stuck"
  | "ph_out_of_range"
  | "no_rows_accepted"
  | "sensor_only_export";

export interface PreviewWarning {
  code: PreviewWarningCode;
  message: string;
  metric?: CanonicalMetric;
  column?: string;
}

export interface SourceAppPreview {
  sourceApp: SourceAppId;
  confidence: SourceAppDetection["confidence"];
  detectionReason: string;
  acceptedRowCount: number;
  rejectedRowCount: number;
  rejectionReasons: Record<string, number>;
  mappedMetrics: CanonicalMetric[];
  mapping: ColumnMapping;
  unmappedColumns: string[];
  warnings: PreviewWarning[];
  /** Canonical source label persisted on every imported row. Always `"csv"`. */
  canonicalSource: typeof SENSOR_IMPORT_CANONICAL_SOURCE;
}

const SOIL_MOISTURE_PATTERNS = /(soil\s*moisture|vwc|substrate\s*moisture)/i;
const PH_PATTERNS = /(^|\b)ph(\b|\()/i;
const EC_MSCM_PATTERNS = /\bec\s*\(?\s*ms\s*\/?\s*cm/i;

/**
 * Build a deterministic, read-only preview summary for a raw CSV body.
 * Never persists. Never calls the network. The returned shape powers any
 * preview UI without exposing it to live ingest paths.
 */
export function summarizeImportPreview(
  csvText: string,
  hint?: SourceAppId,
): SourceAppPreview {
  const parsed = parseCsv(csvText);
  const headers = cleanHeaders(parsed.headers);
  const detection =
    hint && hint !== "unknown_source_app"
      ? { id: hint, confidence: "high" as const, reason: "hinted" }
      : detectSourceApp(headers);

  const mapping = mapColumnsForApp(detection.id, headers);
  const mappedMetrics = Object.keys(mapping.mapped) as CanonicalMetric[];

  const rejectionReasons: Record<string, number> = {};
  let accepted = 0;
  let rejected = 0;

  // Column indices for the active mapping.
  const idx = (h: string | null | undefined): number =>
    h == null ? -1 : headers.indexOf(h);
  const tsIdx = idx(mapping.timestamp);
  const metricIdx: Array<{ metric: CanonicalMetric; col: number }> = (
    Object.entries(mapping.mapped) as Array<[CanonicalMetric, string]>
  ).map(([m, h]) => ({ metric: m, col: idx(h) }));

  // Stuck-value detection accumulators (sampled across accepted rows).
  const stuckSamples: Partial<Record<CanonicalMetric, number[]>> = {};
  const co2Samples: number[] = [];
  let co2Col: number | null = null;
  for (const m of metricIdx) {
    if (m.metric === "co2_ppm") co2Col = m.col;
  }

  for (const cells of parsed.rows) {
    const tsCell = tsIdx >= 0 ? cells[tsIdx] : undefined;
    if (!tsCell || !String(tsCell).trim()) {
      bump(rejectionReasons, "missing_timestamp");
      rejected++;
      continue;
    }
    let anyMetric = false;
    for (const m of metricIdx) {
      const v = parseMetricCell(cells[m.col]);
      if (v != null) {
        anyMetric = true;
        if (m.metric === "humidity_pct") {
          (stuckSamples.humidity_pct ??= []).push(v);
        }
      }
      if (m.metric === "co2_ppm" && v != null) co2Samples.push(v);
    }
    if (!anyMetric) {
      bump(rejectionReasons, "empty_metrics");
      rejected++;
      continue;
    }
    accepted++;
  }

  const warnings: PreviewWarning[] = [];

  // co2_column_empty: column is mapped but no numeric values across the file.
  if (co2Col != null && co2Samples.length === 0) {
    warnings.push({
      code: "co2_column_empty",
      message:
        "CO₂ column is present but contains no numeric values; CO₂ will not be imported.",
      metric: "co2_ppm",
      column: mapping.mapped.co2_ppm,
    });
  }

  // sensor_only_export: zero metric columns mapped (provenance/timestamp only).
  if (metricIdx.length === 0 && headers.length > 0) {
    warnings.push({
      code: "sensor_only_export",
      message:
        "This export only contains timestamps and provenance — no sensor metrics will be imported.",
    });
  }

  // humidity stuck at 0 or 100 across all sampled rows.
  const humSamples = stuckSamples.humidity_pct ?? [];
  if (humSamples.length >= 5) {
    const allZero = humSamples.every((v) => v === 0);
    const allHundred = humSamples.every((v) => v === 100);
    if (allZero || allHundred) {
      warnings.push({
        code: "humidity_stuck",
        message: `Humidity values are stuck at ${allZero ? 0 : 100}% — likely a faulty sensor or bad export.`,
        metric: "humidity_pct",
      });
    }
  }

  // Celsius-shown-as-Fahrenheit: when temp_f is mapped but values look like °C.
  const tempCol = idx(mapping.mapped.temp_f ?? null);
  if (tempCol >= 0) {
    const tempVals: number[] = [];
    for (const cells of parsed.rows) {
      const v = parseMetricCell(cells[tempCol]);
      if (v != null) tempVals.push(v);
      if (tempVals.length >= 50) break;
    }
    if (tempVals.length >= 5) {
      const max = Math.max(...tempVals);
      const min = Math.min(...tempVals);
      // If a "°F" column never exceeds ~50, it's almost certainly °C mislabeled.
      const headerName = (mapping.mapped.temp_f ?? "").toLowerCase();
      if (/°f|fahrenheit|\(f\)/.test(headerName) && max <= 50 && min >= -10) {
        warnings.push({
          code: "celsius_shown_as_fahrenheit",
          message:
            "Temperature column is labeled °F but values look like °C. Verify the export unit.",
          metric: "temp_f",
          column: mapping.mapped.temp_f,
        });
      }
    }
  }

  // EC mS/cm vs µS/cm — only fires if an EC column exists in the raw headers.
  for (const h of headers) {
    if (EC_MSCM_PATTERNS.test(h)) {
      const i = headers.indexOf(h);
      for (const cells of parsed.rows) {
        const v = parseMetricCell(cells[i]);
        if (v != null && v > 50) {
          warnings.push({
            code: "ec_unit_suspicion_us_per_cm",
            message:
              "EC values exceed 50 mS/cm — likely µS/cm being reported as mS/cm.",
            column: h,
          });
          break;
        }
      }
      break;
    }
  }

  // Soil moisture stuck at 0/100 (only when a soil moisture column exists).
  for (const h of headers) {
    if (SOIL_MOISTURE_PATTERNS.test(h)) {
      const i = headers.indexOf(h);
      const vals: number[] = [];
      for (const cells of parsed.rows) {
        const v = parseMetricCell(cells[i]);
        if (v != null) vals.push(v);
        if (vals.length >= 25) break;
      }
      if (vals.length >= 5) {
        const allZero = vals.every((v) => v === 0);
        const allHundred = vals.every((v) => v === 100);
        if (allZero || allHundred) {
          warnings.push({
            code: "soil_moisture_stuck",
            message: `Soil moisture stuck at ${allZero ? 0 : 100}% — verify probe.`,
            column: h,
          });
        }
      }
      break;
    }
  }

  // pH out of realistic range: rely on existing csvRowValidationRules
  // semantics — pH outside [4.5, 8.5] is suspicious. Emit a warning when
  // any sampled value falls outside that band.
  for (const h of headers) {
    if (PH_PATTERNS.test(h) && !/phase|phosphorus/i.test(h)) {
      const i = headers.indexOf(h);
      for (const cells of parsed.rows) {
        const v = parseMetricCell(cells[i]);
        if (v != null && (v < 4.5 || v > 8.5)) {
          warnings.push({
            code: "ph_out_of_range",
            message: "pH values outside realistic 4.5–8.5 window.",
            column: h,
          });
          break;
        }
      }
      break;
    }
  }

  if (accepted === 0) {
    warnings.push({
      code: "no_rows_accepted",
      message: "No rows were accepted from this CSV.",
    });
  }

  return {
    sourceApp: detection.id,
    confidence: detection.confidence,
    detectionReason: detection.reason,
    acceptedRowCount: accepted,
    rejectedRowCount: rejected,
    rejectionReasons,
    mappedMetrics,
    mapping,
    unmappedColumns: mapping.unmapped,
    warnings,
    canonicalSource: SENSOR_IMPORT_CANONICAL_SOURCE,
  };
}

function bump(rec: Record<string, number>, key: string): void {
  rec[key] = (rec[key] ?? 0) + 1;
}
