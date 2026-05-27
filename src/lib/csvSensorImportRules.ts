/**
 * Pure parser + normalizer for the Gate 2A CSV Drop flow.
 *
 * Scope: AC Infinity-style exports for a single tent. Hardware-neutral; no
 * APIs, no automation, no AI, no device control. Read-only logic.
 *
 * Timezone: input timestamps without an explicit zone are treated as the
 * browser's local zone (which is what AC Infinity exports use); all output
 * `captured_at` values are normalized to ISO-8601 UTC strings so the database
 * stays in one canonical zone.
 *
 * Safety contract is enforced by src/test/csv-sensor-import.test.ts —
 * no alerts, no action_queue, no plant auto-assignment, no service_role,
 * no live/manual blending, never coerces empty cells to 0.
 */

// ---------- Constants ----------

export type CsvImportSourceApp = "ac_infinity" | "trolmaster" | "other";

export const CSV_IMPORT_SOURCE_APPS: ReadonlyArray<{
  id: CsvImportSourceApp;
  label: string;
  enabled: boolean;
}> = [
  { id: "ac_infinity", label: "AC Infinity", enabled: true },
  { id: "trolmaster", label: "TrolMaster — Coming soon", enabled: false },
  { id: "other", label: "Other — Coming soon", enabled: false },
];

export const CSV_SOURCE_AC_INFINITY = "csv_import_ac_infinity" as const;

export const CSV_SOURCE_LABEL: Record<CsvImportSourceApp, string> = {
  ac_infinity: "CSV Import \u2013 AC Infinity",
  trolmaster: "CSV Import \u2013 TrolMaster",
  other: "CSV Import",
};

export function csvSourceTagFor(app: CsvImportSourceApp): string {
  switch (app) {
    case "ac_infinity":
      return CSV_SOURCE_AC_INFINITY;
    case "trolmaster":
      return "csv_import_trolmaster";
    case "other":
      return "csv_import_other";
  }
}

/**
 * Sensor metrics this import flow can currently persist. Matches the
 * `validate_sensor_reading` allow-list. Other columns (ph/ec/ppfd) parse but
 * are reported as `skipped_unsupported_metric` and not written.
 */
export const SUPPORTED_METRICS = [
  "temperature_c",
  "humidity_pct",
  "vpd_kpa",
  "co2_ppm",
  "soil_moisture_pct",
] as const;
export type SupportedMetric = (typeof SUPPORTED_METRICS)[number];

export const MAX_CSV_BYTES = 5 * 1024 * 1024; // 5 MB graceful guard

// ---------- Minimal CSV parser ----------
// Handles commas, CRLF, and double-quoted strings with escaped quotes.

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

export function parseCsv(text: string): ParsedCsv {
  const out: string[][] = [];
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
      if (row.length > 1 || row[0] !== "") out.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") out.push(row);
  }
  const headers = (out.shift() ?? []).map((h) => h.trim());
  return { headers, rows: out };
}

// ---------- Header detection ----------

export interface ColumnPlan {
  timestamp: number | null;
  date: number | null;
  time: number | null;
  temperature: { idx: number; unit: "F" | "C" } | null;
  humidity: number | null;
  vpd: number | null;
  co2: number | null;
  soilMoisture: number | null;
  // Parsed but not persisted in this PR:
  ph: number | null;
  ec: number | null;
  ppfd: number | null;
}

function norm(h: string): string {
  return h.toLowerCase().replace(/[\s_]+/g, " ").trim();
}

function detectTempUnit(header: string): "F" | "C" {
  const h = header.toLowerCase();
  if (/°\s*c|\bcelsius\b|\(c\)/.test(h)) return "C";
  // AC Infinity exports default to Fahrenheit in US locale.
  if (/°\s*f|\bfahrenheit\b|\(f\)/.test(h)) return "F";
  return "F";
}

export function planColumns(headers: ReadonlyArray<string>): ColumnPlan {
  const plan: ColumnPlan = {
    timestamp: null,
    date: null,
    time: null,
    temperature: null,
    humidity: null,
    vpd: null,
    co2: null,
    soilMoisture: null,
    ph: null,
    ec: null,
    ppfd: null,
  };
  headers.forEach((raw, idx) => {
    const h = norm(raw);
    if (plan.timestamp === null && /(^|\s)(timestamp|datetime|date time)\b/.test(h)) {
      plan.timestamp = idx;
      return;
    }
    if (plan.date === null && /^date\b/.test(h)) plan.date = idx;
    if (plan.time === null && /^time\b/.test(h)) plan.time = idx;
    if (plan.temperature === null && /\b(temperature|temp)\b/.test(h)) {
      plan.temperature = { idx, unit: detectTempUnit(raw) };
    }
    if (plan.humidity === null && /\b(humidity|rh)\b/.test(h)) plan.humidity = idx;
    if (plan.vpd === null && /\bvpd\b/.test(h)) plan.vpd = idx;
    if (plan.co2 === null && /\bco2\b/.test(h)) plan.co2 = idx;
    if (plan.soilMoisture === null && /\bsoil\s*moisture\b/.test(h)) {
      plan.soilMoisture = idx;
    }
    if (plan.ph === null && /^ph\b/.test(h)) plan.ph = idx;
    if (plan.ec === null && /\b(ec|soil\s*ec)\b/.test(h)) plan.ec = idx;
    if (plan.ppfd === null && /\bppfd\b/.test(h)) plan.ppfd = idx;
  });
  return plan;
}

// ---------- Cell parsing ----------

export function parseOptionalNumberCell(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const trimmed = String(raw).trim().replace(/[,_]/g, "");
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function parseTimestampCell(
  raw: string | undefined,
  date?: string,
  time?: string,
): string | null {
  let candidate = raw?.trim();
  if (!candidate) {
    const d = date?.trim();
    const t = time?.trim();
    if (d && t) candidate = `${d} ${t}`;
    else if (d) candidate = d;
    else return null;
  }
  // Replace AC Infinity's "YYYY-MM-DD HH:MM:SS" with ISO "T" so the Date
  // constructor parses it consistently across browsers.
  const iso = candidate.replace(" ", "T");
  const d = new Date(iso);
  const ms = d.getTime();
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

// ---------- Normalization ----------

export interface NormalizedReading {
  captured_at: string;
  metric: SupportedMetric;
  value: number;
}

export interface NormalizedCsvRow {
  captured_at: string;
  readings: NormalizedReading[];
}

export interface SkippedRow {
  rowIndex: number; // 0-based, header excluded
  reason:
    | "missing_timestamp"
    | "invalid_timestamp"
    | "no_numeric_metrics"
    | "duplicate";
}

function fToC(f: number): number {
  return ((f - 32) * 5) / 9;
}

export interface NormalizeResult {
  rows: NormalizedCsvRow[];
  skipped: SkippedRow[];
  unsupportedMetrics: string[];
  metricsDetected: SupportedMetric[];
  dateRange: { from: string; to: string } | null;
}

/**
 * Walks parsed rows, normalizes per the column plan, drops invalid rows,
 * de-dupes by (captured_at, metric, value) inside the same file.
 *
 * Returns deterministic output. No side effects.
 */
export function normalizeAcInfinityRows(
  parsed: ParsedCsv,
  plan: ColumnPlan,
): NormalizeResult {
  const out: NormalizedCsvRow[] = [];
  const skipped: SkippedRow[] = [];
  const unsupported = new Set<string>();
  const detected = new Set<SupportedMetric>();
  const seen = new Set<string>();
  let minTs: number | null = null;
  let maxTs: number | null = null;

  if (plan.ph !== null) unsupported.add("ph");
  if (plan.ec !== null) unsupported.add("ec");
  if (plan.ppfd !== null) unsupported.add("ppfd");

  parsed.rows.forEach((cells, idx) => {
    const tsCell = plan.timestamp !== null ? cells[plan.timestamp] : undefined;
    const dateCell = plan.date !== null ? cells[plan.date] : undefined;
    const timeCell = plan.time !== null ? cells[plan.time] : undefined;

    if (
      (plan.timestamp === null && plan.date === null) ||
      (tsCell === undefined && dateCell === undefined)
    ) {
      skipped.push({ rowIndex: idx, reason: "missing_timestamp" });
      return;
    }

    const captured = parseTimestampCell(tsCell, dateCell, timeCell);
    if (!captured) {
      skipped.push({ rowIndex: idx, reason: "invalid_timestamp" });
      return;
    }

    const readings: NormalizedReading[] = [];

    if (plan.temperature) {
      const raw = parseOptionalNumberCell(cells[plan.temperature.idx]);
      if (raw !== null) {
        const c = plan.temperature.unit === "F" ? fToC(raw) : raw;
        readings.push({ captured_at: captured, metric: "temperature_c", value: c });
        detected.add("temperature_c");
      }
    }
    if (plan.humidity !== null) {
      const v = parseOptionalNumberCell(cells[plan.humidity]);
      if (v !== null) {
        readings.push({ captured_at: captured, metric: "humidity_pct", value: v });
        detected.add("humidity_pct");
      }
    }
    if (plan.vpd !== null) {
      const v = parseOptionalNumberCell(cells[plan.vpd]);
      if (v !== null) {
        readings.push({ captured_at: captured, metric: "vpd_kpa", value: v });
        detected.add("vpd_kpa");
      }
    }
    if (plan.co2 !== null) {
      const v = parseOptionalNumberCell(cells[plan.co2]);
      if (v !== null) {
        readings.push({ captured_at: captured, metric: "co2_ppm", value: v });
        detected.add("co2_ppm");
      }
    }
    if (plan.soilMoisture !== null) {
      const v = parseOptionalNumberCell(cells[plan.soilMoisture]);
      if (v !== null) {
        readings.push({
          captured_at: captured,
          metric: "soil_moisture_pct",
          value: v,
        });
        detected.add("soil_moisture_pct");
      }
    }

    if (readings.length === 0) {
      skipped.push({ rowIndex: idx, reason: "no_numeric_metrics" });
      return;
    }

    // De-dupe within file by (captured_at + metric + value)
    const fresh: NormalizedReading[] = [];
    for (const r of readings) {
      const key = `${r.captured_at}|${r.metric}|${r.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      fresh.push(r);
    }
    if (fresh.length === 0) {
      skipped.push({ rowIndex: idx, reason: "duplicate" });
      return;
    }

    const ms = new Date(captured).getTime();
    if (minTs === null || ms < minTs) minTs = ms;
    if (maxTs === null || ms > maxTs) maxTs = ms;

    out.push({ captured_at: captured, readings: fresh });
  });

  const dateRange =
    minTs !== null && maxTs !== null
      ? { from: new Date(minTs).toISOString(), to: new Date(maxTs).toISOString() }
      : null;

  return {
    rows: out,
    skipped,
    unsupportedMetrics: [...unsupported],
    metricsDetected: SUPPORTED_METRICS.filter((m) => detected.has(m)),
    dateRange,
  };
}

// ---------- Build inserts ----------

export interface CsvInsertRow {
  tent_id: string;
  grow_id?: string | null;
  metric: SupportedMetric;
  value: number;
  captured_at: string;
  source: string;
  quality: "ok";
  raw_payload: {
    csv_import: true;
    source_app: CsvImportSourceApp;
    source_label: string;
    import_batch_id: string;
  };
}

export interface BuildInsertsArgs {
  tentId: string;
  growId?: string | null;
  sourceApp: CsvImportSourceApp;
  importBatchId: string;
  rows: ReadonlyArray<NormalizedCsvRow>;
}

export function buildCsvInsertRows(args: BuildInsertsArgs): CsvInsertRow[] {
  if (!args.tentId?.trim()) throw new Error("tentId is required");
  const source = csvSourceTagFor(args.sourceApp);
  const label = CSV_SOURCE_LABEL[args.sourceApp];
  const out: CsvInsertRow[] = [];
  for (const row of args.rows) {
    for (const r of row.readings) {
      out.push({
        tent_id: args.tentId,
        grow_id: args.growId ?? null,
        metric: r.metric,
        value: r.value,
        captured_at: r.captured_at,
        source,
        quality: "ok",
        raw_payload: {
          csv_import: true,
          source_app: args.sourceApp,
          source_label: label,
          import_batch_id: args.importBatchId,
        },
      });
    }
  }
  return out;
}

export function isCsvImportSource(source: string | null | undefined): boolean {
  return !!source && source.startsWith("csv_import_");
}
