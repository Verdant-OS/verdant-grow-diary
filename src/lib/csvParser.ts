/**
 * csvParser — CSV Drop parser for historical environment data.
 *
 * Scope: hardware-neutral environmental CSV (AC Infinity, Spider Farmer, etc.).
 * Pure, no I/O besides reading the supplied File. No alerts, no Action Queue,
 * no device control, no automation. Every parsed row carries source_tag "csv" —
 * CSV data is historical context, NEVER live.
 *
 * Output:
 *  - validRows: canonicalized + raw-preserving rows ready for confirm-insert
 *  - skippedRows: structured per-row reasons
 *  - dateRange, detectedColumns, isAmbiguous (unit)
 *  - errors: file-level structured codes (wrong_file_type, file_too_large, ...)
 */

export const CSV_SOURCE_TAG = "csv" as const;
export const MAX_CSV_BYTES = 25 * 1024 * 1024; // 25 MB

export type ParseErrorCode =
  | "wrong_file_type"
  | "file_too_large"
  | "empty_file"
  | "damaged_file"
  | "no_sensor_data";

export interface ParseError {
  code: ParseErrorCode;
  message: string;
}

export type SkippedReason =
  | "invalid_timestamp"
  | "missing_timestamp"
  | "invalid_temperature"
  | "invalid_humidity"
  | "no_metrics";

export interface SkippedRow {
  rowNumber: number; // 1-based, header-excluded
  reason: SkippedReason;
}

export type RawTempUnit = "F" | "C" | "unknown";

export interface DetectedColumns {
  timestamp: string | null;
  date: string | null;
  time: string | null;
  temperature: string | null;
  humidity: string | null;
  vpd: string | null;
  co2: string | null;
  ppfd: string | null;
}

export interface ParsedEnvironmentRow {
  rowNumber: number;
  captured_at: string; // ISO UTC
  // canonical
  temperature_c: number | null;
  humidity_pct: number | null;
  vpd_kpa: number | null;
  co2_ppm: number | null;
  ppfd: number | null;
  // raw preserved
  raw_temperature: number | null;
  raw_temp_unit: RawTempUnit;
  raw_payload: Record<string, string>;
  vpd_source: "csv" | "derived" | null;
  // source — hardcoded
  source_tag: typeof CSV_SOURCE_TAG;
}

export interface ParseEnvironmentCsvResult {
  validRows: ParsedEnvironmentRow[];
  skippedRows: SkippedRow[];
  dateRange: { start: string; end: string } | null;
  isAmbiguous: boolean;
  detectedColumns: DetectedColumns;
  errors: ParseError[];
}

// ---------- public API ----------

export async function parseEnvironmentCSV(
  file: File,
): Promise<ParseEnvironmentCsvResult> {
  const empty = emptyResult();

  if (!file || typeof file.name !== "string") {
    return withError(empty, "damaged_file", "Could not read file.");
  }
  if (!/\.csv$/i.test(file.name)) {
    return withError(empty, "wrong_file_type", "That’s not a CSV file.");
  }
  if (typeof file.size === "number" && file.size > MAX_CSV_BYTES) {
    return withError(
      empty,
      "file_too_large",
      "File is too large to import safely. Try a shorter date range.",
    );
  }

  let text: string;
  try {
    text = await readFileAsText(file);
  } catch {
    return withError(empty, "damaged_file", "This CSV looks empty or damaged.");
  }
  return parseEnvironmentCSVText(text);
}

async function readFileAsText(file: File): Promise<string> {
  if (typeof (file as { text?: unknown }).text === "function") {
    try {
      const t = await file.text();
      if (typeof t === "string") return t;
    } catch {
      /* fall through */
    }
  }
  if (typeof (file as { arrayBuffer?: unknown }).arrayBuffer === "function") {
    const buf = await file.arrayBuffer();
    return new TextDecoder("utf-8").decode(buf);
  }
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export function parseEnvironmentCSVText(
  text: string,
): ParseEnvironmentCsvResult {
  const empty = emptyResult();
  if (!text || !text.trim()) {
    return withError(empty, "empty_file", "This CSV looks empty or damaged.");
  }

  let parsed: { headers: string[]; rows: string[][] };
  try {
    parsed = parseCsvText(text);
  } catch {
    return withError(empty, "damaged_file", "This CSV looks empty or damaged.");
  }
  const { headers, rows } = parsed;
  if (headers.length === 0) {
    return withError(empty, "empty_file", "This CSV looks empty or damaged.");
  }

  const detected = detectColumns(headers);
  const hasTimeCol =
    detected.timestamp !== null ||
    (detected.date !== null && detected.time !== null) ||
    detected.date !== null;
  const hasMetricCol =
    detected.temperature !== null ||
    detected.humidity !== null ||
    detected.vpd !== null ||
    detected.co2 !== null ||
    detected.ppfd !== null;
  if (!hasTimeCol || !hasMetricCol) {
    return withError(
      empty,
      "no_sensor_data",
      "We couldn’t read sensor data from this file.",
    );
  }

  // Unit detection: header-driven first, then sample values.
  const tempHeader = detected.temperature;
  let inferredUnit: RawTempUnit = "unknown";
  let isAmbiguous = false;
  if (tempHeader) {
    const hdrUnit = unitFromHeader(tempHeader);
    if (hdrUnit !== "unknown") {
      inferredUnit = hdrUnit;
    } else {
      const sample = collectTemperatureSample(rows, headers, tempHeader);
      const valueUnit = unitFromValues(sample);
      inferredUnit = valueUnit.unit;
      isAmbiguous = valueUnit.ambiguous;
    }
  }

  const validRows: ParsedEnvironmentRow[] = [];
  const skipped: SkippedRow[] = [];
  let minTs = Number.POSITIVE_INFINITY;
  let maxTs = Number.NEGATIVE_INFINITY;

  rows.forEach((cells, idx) => {
    const rowNumber = idx + 1;
    const rec = rowRecord(headers, cells);

    const captured = resolveCapturedAt(rec, detected);
    if (!captured) {
      skipped.push({
        rowNumber,
        reason: rec[detected.timestamp ?? detected.date ?? ""]
          ? "invalid_timestamp"
          : "missing_timestamp",
      });
      return;
    }

    let rawTemp: number | null = null;
    let tempC: number | null = null;
    if (tempHeader) {
      const cell = (rec[tempHeader] ?? "").trim();
      if (cell !== "") {
        const n = parseNumber(cell);
        if (n == null) {
          skipped.push({ rowNumber, reason: "invalid_temperature" });
          return;
        }
        rawTemp = n;
        tempC = inferredUnit === "F" ? (n - 32) * (5 / 9) : n;
        if (tempC < -40 || tempC > 80) {
          skipped.push({ rowNumber, reason: "invalid_temperature" });
          return;
        }
      }
    }

    let rh: number | null = null;
    if (detected.humidity) {
      const cell = (rec[detected.humidity] ?? "").trim();
      if (cell !== "") {
        let n = parseNumber(cell.replace(/%$/, ""));
        if (n == null) {
          skipped.push({ rowNumber, reason: "invalid_humidity" });
          return;
        }
        if (n > 0 && n <= 1) n = n * 100; // 0–1 form
        if (n < 0 || n > 100) {
          skipped.push({ rowNumber, reason: "invalid_humidity" });
          return;
        }
        rh = n;
      }
    }

    const csvVpd = detected.vpd ? parseMetric(rec[detected.vpd], 0, 10) : null;
    const vpd =
      csvVpd != null
        ? csvVpd
        : tempC != null && rh != null && Number.isFinite(tempC) && Number.isFinite(rh)
          ? computeVpdKpa(tempC, rh)
          : null;
    const co2Ppm = detected.co2 ? parseMetric(rec[detected.co2], 0, 10_000) : null;
    const ppfd = detected.ppfd ? parseMetric(rec[detected.ppfd], 0, 2_500) : null;

    if (tempC == null && rh == null && vpd == null && co2Ppm == null && ppfd == null) {
      skipped.push({ rowNumber, reason: "no_metrics" });
      return;
    }

    const tMs = Date.parse(captured);
    if (Number.isFinite(tMs)) {
      if (tMs < minTs) minTs = tMs;
      if (tMs > maxTs) maxTs = tMs;
    }

    validRows.push({
      rowNumber,
      captured_at: captured,
      temperature_c: tempC,
      humidity_pct: rh,
      vpd_kpa: vpd,
      co2_ppm: co2Ppm,
      ppfd,
      raw_temperature: rawTemp,
      raw_temp_unit: tempHeader ? inferredUnit : "unknown",
      raw_payload: rec,
      vpd_source: csvVpd != null ? "csv" : vpd != null ? "derived" : null,
      source_tag: CSV_SOURCE_TAG,
    });
  });

  if (validRows.length === 0) {
    return withError(
      { ...empty, skippedRows: skipped, detectedColumns: detected },
      "no_sensor_data",
      "We couldn’t read sensor data from this file.",
    );
  }

  return {
    validRows,
    skippedRows: skipped,
    dateRange:
      minTs <= maxTs
        ? { start: new Date(minTs).toISOString(), end: new Date(maxTs).toISOString() }
        : null,
    isAmbiguous,
    detectedColumns: detected,
    errors: [],
  };
}

/**
 * Re-normalize a previously parsed result using a user-chosen temperature unit.
 * Used after the ambiguity confirm screen — recomputes temperature_c + vpd_kpa
 * without re-parsing the file. If a CSV VPD column existed, it remains the
 * source of truth instead of being overwritten by derived VPD.
 */
export function renormalizeWithUnit(
  result: ParseEnvironmentCsvResult,
  unit: "F" | "C",
): ParseEnvironmentCsvResult {
  if (!result.isAmbiguous) return result;
  const validRows = result.validRows.map((r) => {
    if (r.raw_temperature == null) return { ...r, raw_temp_unit: unit };
    const tempC =
      unit === "F" ? (r.raw_temperature - 32) * (5 / 9) : r.raw_temperature;
    const vpd =
      r.vpd_source === "csv"
        ? r.vpd_kpa
        : tempC != null && r.humidity_pct != null
          ? computeVpdKpa(tempC, r.humidity_pct)
          : null;
    return {
      ...r,
      temperature_c: tempC,
      vpd_kpa: vpd,
      raw_temp_unit: unit,
    };
  });
  return { ...result, validRows, isAmbiguous: false };
}

// ---------- VPD ----------

export function computeVpdKpa(tempC: number, rhPct: number): number {
  const svp = 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));
  const avp = svp * (rhPct / 100);
  const vpd = svp - avp;
  return Math.round(vpd * 1000) / 1000;
}

// ---------- internals ----------

function emptyResult(): ParseEnvironmentCsvResult {
  return {
    validRows: [],
    skippedRows: [],
    dateRange: null,
    isAmbiguous: false,
    detectedColumns: {
      timestamp: null,
      date: null,
      time: null,
      temperature: null,
      humidity: null,
      vpd: null,
      co2: null,
      ppfd: null,
    },
    errors: [],
  };
}

function withError(
  base: ParseEnvironmentCsvResult,
  code: ParseErrorCode,
  message: string,
): ParseEnvironmentCsvResult {
  return { ...base, errors: [...base.errors, { code, message }] };
}

function rowRecord(headers: string[], cells: string[]): Record<string, string> {
  const rec: Record<string, string> = {};
  headers.forEach((h, i) => {
    rec[h] = cells[i] ?? "";
  });
  return rec;
}

// Minimal RFC4180-ish parser: handles quotes, escaped quotes, CRLF.
function parseCsvText(text: string): { headers: string[]; rows: string[][] } {
  const all: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      all.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    all.push(row);
  }
  const nonEmpty = all.filter((r) => !(r.length === 1 && r[0].trim() === ""));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };
  const headers = nonEmpty[0].map((h) => h.replace(/^\uFEFF/, "").trim());
  return { headers, rows: nonEmpty.slice(1) };
}

function detectColumns(headers: string[]): DetectedColumns {
  const out: DetectedColumns = {
    timestamp: null,
    date: null,
    time: null,
    temperature: null,
    humidity: null,
    vpd: null,
    co2: null,
    ppfd: null,
  };

  const temperatureCandidates: string[] = [];

  for (const h of headers) {
    const k = normalizeHeader(h);
    if (out.timestamp == null && /(^|[^a-z])timestamp([^a-z]|$)|^created.?at$|^recorded.?at$/.test(k)) {
      out.timestamp = h;
      continue;
    }
    if (out.date == null && /^date$/.test(k)) {
      out.date = h;
      continue;
    }
    if (out.time == null && /^time$/.test(k)) {
      out.time = h;
      continue;
    }
    if (/temp/.test(k) && !/setpoint|target/.test(k)) {
      temperatureCandidates.push(h);
      continue;
    }
    if (out.humidity == null && /(humidity|^rh\b|^rh[^a-z])/.test(k)) {
      out.humidity = h;
      continue;
    }
    if (out.vpd == null && /(^|[^a-z])vpd([^a-z]|$)/.test(k)) {
      out.vpd = h;
      continue;
    }
    if (out.co2 == null && /(co2|co₂|carbon.?dioxide)/.test(k)) {
      out.co2 = h;
      continue;
    }
    if (out.ppfd == null && /(ppfd|par|photosynthetic)/.test(k)) {
      out.ppfd = h;
      continue;
    }
  }

  out.temperature = chooseTemperatureColumn(temperatureCandidates);
  return out;
}

function normalizeHeader(header: string): string {
  return header.replace(/^\uFEFF/, "").toLowerCase().trim();
}

function chooseTemperatureColumn(candidates: readonly string[]): string | null {
  if (candidates.length === 0) return null;
  const celsius = candidates.find((h) => unitFromHeader(h) === "C");
  if (celsius) return celsius;
  const fahrenheit = candidates.find((h) => unitFromHeader(h) === "F");
  if (fahrenheit) return fahrenheit;
  return candidates[0];
}

function unitFromHeader(header: string): RawTempUnit {
  const k = header.toLowerCase();
  if (/(°?f\b|fahrenheit|temp_f|tempf)/.test(k)) return "F";
  if (/(°?c\b|celsius|temp_c|tempc)/.test(k)) return "C";
  return "unknown";
}

function collectTemperatureSample(
  rows: string[][],
  headers: string[],
  tempHeader: string,
): number[] {
  const idx = headers.indexOf(tempHeader);
  if (idx < 0) return [];
  const out: number[] = [];
  for (const r of rows) {
    const n = parseNumber((r[idx] ?? "").trim());
    if (n != null) out.push(n);
    if (out.length >= 50) break;
  }
  return out;
}

function unitFromValues(sample: number[]): { unit: RawTempUnit; ambiguous: boolean } {
  if (sample.length === 0) return { unit: "unknown", ambiguous: false };
  const max = Math.max(...sample);
  const min = Math.min(...sample);
  if (max > 45) return { unit: "F", ambiguous: false };
  // 0–45: ambiguous overlap range (could be °C or low °F)
  if (min >= 0 && max <= 45) return { unit: "C", ambiguous: true };
  return { unit: "C", ambiguous: false };
}

function resolveCapturedAt(
  rec: Record<string, string>,
  detected: DetectedColumns,
): string | null {
  if (detected.timestamp) {
    const v = (rec[detected.timestamp] ?? "").trim();
    if (!v) return null;
    return parseFlexibleDate(v);
  }
  if (detected.date && detected.time) {
    const d = (rec[detected.date] ?? "").trim();
    const t = (rec[detected.time] ?? "").trim();
    if (!d) return null;
    return parseFlexibleDate(`${d} ${t}`.trim());
  }
  if (detected.date) {
    const d = (rec[detected.date] ?? "").trim();
    if (!d) return null;
    return parseFlexibleDate(d);
  }
  return null;
}

function parseFlexibleDate(input: string): string | null {
  if (!input) return null;

  // Explicit Spider Farmer / common export format: YYYY-MM-DD HH:mm[:ss]
  const ymd = input.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (ymd) {
    const [, yr, mo, da, hh, mm, ss] = ymd;
    const d = new Date(
      Date.UTC(
        Number(yr),
        Number(mo) - 1,
        Number(da),
        Number(hh ?? 0),
        Number(mm ?? 0),
        Number(ss ?? 0),
      ),
    );
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }

  // Try ISO / native for timezone-marked strings.
  const direct = Date.parse(input);
  if (Number.isFinite(direct)) return new Date(direct).toISOString();

  // Try MM/DD/YYYY HH:mm[:ss]
  const m = input.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (m) {
    const [, mo, da, yrStr, hh, mm, ss] = m;
    const yr = yrStr.length === 2 ? 2000 + Number(yrStr) : Number(yrStr);
    const d = new Date(
      Date.UTC(
        yr,
        Number(mo) - 1,
        Number(da),
        Number(hh ?? 0),
        Number(mm ?? 0),
        Number(ss ?? 0),
      ),
    );
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }
  return null;
}

function parseNumber(input: string): number | null {
  const cleaned = `${input ?? ""}`.trim().replace(/,/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseMetric(
  input: string | undefined,
  min: number,
  max: number,
): number | null {
  const n = parseNumber(input ?? "");
  if (n == null) return null;
  return n >= min && n <= max ? n : null;
}
