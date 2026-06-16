/**
 * registryCsvInsertRowsAdapter — pure adapter that converts a sensor-app
 * registry mapping (Spider Farmer, Vivosun, AC Infinity) into the existing
 * `sensor_readings` insert-row shape used by buildCsvInsertRows.
 *
 * Scope: PURE LOGIC ONLY.
 *   - no React, no DB client, no fetch, no rpc
 *   - no inserts/updates/deletes/upserts
 *   - no alerts, no Action Queue, no AI, no device control
 *   - does not touch the import card or the preview-persistence gate
 *
 * Persistence policy: this slice produces rows shaped for the DB allow-list
 * but does NOT wire them in. Saving for Spider Farmer / Vivosun stays
 * blocked until a separate slice flips the UI gate and confirms the
 * deployed `validate_sensor_reading` trigger accepts the chosen `source`.
 *
 * Metric mapping (registry → DB):
 *   temp_f             → temperature_c   (°F→°C; prefer raw °C when present)
 *   humidity_pct       → humidity_pct
 *   vpd_kpa            → vpd_kpa
 *   co2_ppm            → co2_ppm
 *   ppfd_umol_m2_s     → ppfd
 */
import {
  cleanHeaders,
  mapColumnsForApp,
  parseMetricCell,
  SENSOR_IMPORT_CANONICAL_SOURCE,
  type SourceAppId,
} from "@/lib/sensorImportSourceApps";
import { parseCsv } from "@/lib/csvSensorImportRules";

// DB-side metric keys (mirrors validate_sensor_reading allow-list).
export type AdapterMetric =
  | "temperature_c"
  | "humidity_pct"
  | "vpd_kpa"
  | "co2_ppm"
  | "ppfd";

export const ADAPTER_CANONICAL_SOURCE = SENSOR_IMPORT_CANONICAL_SOURCE; // "csv"

/**
 * Insert-row shape compatible with public.sensor_readings.
 *
 * IMPORTANT: keys here MUST be a subset of the columns that actually exist
 * on the `sensor_readings` table — otherwise PostgREST rejects the batch
 * with PGRST204 ("Could not find the 'X' column of 'sensor_readings'").
 * Notably there is NO top-level `grow_id` or `plant_id` on sensor_readings;
 * grow lineage travels inside `raw_payload.grow_id`.
 */
export interface RegistryCsvInsertRow {
  tent_id: string;
  metric: AdapterMetric;
  value: number;
  captured_at: string; // ISO-8601 UTC
  source: typeof ADAPTER_CANONICAL_SOURCE; // "csv"
  quality: "ok";
  raw_payload: {
    csv_import: true;
    source_app: SourceAppId;
    import_batch_id: string;
    row_index: number; // 0-based, header excluded
    raw_row: Record<string, string>;
    /** Provenance only — never used for auth / routing. */
    grow_id?: string;
    // Optional vendor lineage extras (only present when known).
    device_serial?: string;
    room_id?: string;
    sensor_id?: string;
    /** Original °F value when temperature_c came from a °F→°C conversion. */
    temperature_f_original?: number;
    /** Original °C value when both °C and °F were present. */
    temperature_c_original?: number;
    /** Vivosun Built-in fallback metrics — never persisted as canonical rows. */
    built_in?: Partial<Record<"temperature_f" | "humidity_pct" | "vpd_kpa" | "co2_ppm", number>>;
  };
}


export interface BuildArgs {
  tentId: string;
  growId?: string | null;
  sourceApp: SourceAppId;
  importBatchId: string;
  csvText: string;
}

export interface AdapterResult {
  rows: RegistryCsvInsertRow[];
  acceptedRowCount: number;
  rejectedRowCount: number;
  rejectionReasons: Record<string, number>;
  /** When true, the adapter refused to produce rows (e.g. unknown source). */
  blocked: boolean;
  blockedReason: string | null;
}

const EMPTY_RESULT = (
  blockedReason: string | null = null,
): AdapterResult => ({
  rows: [],
  acceptedRowCount: 0,
  rejectedRowCount: 0,
  rejectionReasons: {},
  blocked: blockedReason !== null,
  blockedReason,
});

function fToC(f: number): number {
  return ((f - 32) * 5) / 9;
}

/** Parse a captured-at cell into ISO-8601 UTC, returns null on failure. */
function parseCapturedAt(raw: string | undefined): string | null {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  // Normalize "YYYY/MM/DD HH:MM:SS" → "YYYY-MM-DD HH:MM:SS", then ISO "T".
  const normalized = v.replace(/\//g, "-").replace(" ", "T");
  const d = new Date(normalized);
  const ms = d.getTime();
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

/** Lower-case header lookup, returns column index or -1. */
function indexOfHeader(
  headers: ReadonlyArray<string>,
  needle: string | null | undefined,
): number {
  if (!needle) return -1;
  const target = needle.toLowerCase();
  for (let i = 0; i < headers.length; i++) {
    if (headers[i].toLowerCase() === target) return i;
  }
  return -1;
}

function bump(rec: Record<string, number>, key: string): void {
  rec[key] = (rec[key] ?? 0) + 1;
}

export function buildRegistryCsvInsertRows(args: BuildArgs): AdapterResult {
  if (!args.tentId?.trim()) {
    throw new Error("tentId is required");
  }
  if (args.sourceApp === "unknown_source_app") {
    return EMPTY_RESULT("unknown_source_app");
  }

  const parsed = parseCsv(args.csvText);
  const headers = cleanHeaders(parsed.headers);
  const mapping = mapColumnsForApp(args.sourceApp, headers);
  const tsIdx = indexOfHeader(headers, mapping.timestamp);
  if (tsIdx < 0) {
    return EMPTY_RESULT("missing_timestamp_column");
  }

  // Pre-resolve column indices for each canonical metric.
  const idx = {
    temp_f: indexOfHeader(headers, mapping.mapped.temp_f ?? null),
    humidity: indexOfHeader(headers, mapping.mapped.humidity_pct ?? null),
    vpd: indexOfHeader(headers, mapping.mapped.vpd_kpa ?? null),
    co2: indexOfHeader(headers, mapping.mapped.co2_ppm ?? null),
    ppfd: indexOfHeader(headers, mapping.mapped.ppfd_umol_m2_s ?? null),
  };

  // Spider Farmer raw °C (kept as rawProvenance so it never reaches mapped).
  const tempCIdx =
    args.sourceApp === "spider_farmer"
      ? indexOfHeader(
          headers,
          mapping.rawProvenance.find((h) => h.toLowerCase() === "temperature(°c)") ?? null,
        )
      : -1;

  // Provenance columns by app.
  const deviceSerialIdx =
    args.sourceApp === "spider_farmer"
      ? indexOfHeader(headers, "deviceSerialnum")
      : -1;
  const roomIdIdx =
    args.sourceApp === "spider_farmer" ? indexOfHeader(headers, "roomId") : -1;
  const sensorIdIdx =
    args.sourceApp === "spider_farmer" ? indexOfHeader(headers, "sensorId") : -1;

  // Vivosun Built-in indices (preserved, never emitted).
  const builtIn =
    args.sourceApp === "vivosun"
      ? {
          temp: headers.findIndex((h) => /^built-in temperature/i.test(h)),
          humidity: headers.findIndex((h) => /^built-in humidity/i.test(h)),
          vpd: headers.findIndex((h) => /^built-in vpd/i.test(h)),
          co2: headers.findIndex((h) => /^built-in co2/i.test(h)),
        }
      : null;

  const rows: RegistryCsvInsertRow[] = [];
  const rejectionReasons: Record<string, number> = {};
  let rejected = 0;

  parsed.rows.forEach((cells, rowIndex) => {
    const captured = parseCapturedAt(cells[tsIdx]);
    if (!captured) {
      bump(rejectionReasons, "missing_or_invalid_timestamp");
      rejected++;
      return;
    }

    // Resolve numeric metric cells.
    const tempF = idx.temp_f >= 0 ? parseMetricCell(cells[idx.temp_f]) : null;
    const tempC = tempCIdx >= 0 ? parseMetricCell(cells[tempCIdx]) : null;
    const humidity = idx.humidity >= 0 ? parseMetricCell(cells[idx.humidity]) : null;
    const vpd = idx.vpd >= 0 ? parseMetricCell(cells[idx.vpd]) : null;
    const co2 = idx.co2 >= 0 ? parseMetricCell(cells[idx.co2]) : null;
    const ppfd = idx.ppfd >= 0 ? parseMetricCell(cells[idx.ppfd]) : null;

    // Decide canonical temperature_c value (prefer raw °C when numeric).
    let temperatureC: number | null = null;
    let convertedFromF = false;
    if (tempC != null) {
      temperatureC = tempC;
    } else if (tempF != null) {
      temperatureC = fToC(tempF);
      convertedFromF = true;
    }

    const emit: Array<{ metric: AdapterMetric; value: number }> = [];
    if (temperatureC != null) {
      emit.push({ metric: "temperature_c", value: temperatureC });
    }
    if (humidity != null) emit.push({ metric: "humidity_pct", value: humidity });
    if (vpd != null) emit.push({ metric: "vpd_kpa", value: vpd });
    if (co2 != null) emit.push({ metric: "co2_ppm", value: co2 });
    // PPFD is detected for source-app preview/diagnostics but is intentionally
    // NOT imported into sensor_readings in this release. The original numeric
    // value is preserved verbatim inside raw_payload.raw_row when present.
    void ppfd;

    if (emit.length === 0) {
      bump(rejectionReasons, "empty_metrics");
      rejected++;
      return;
    }

    // Build raw_row snapshot for provenance.
    const rawRow: Record<string, string> = {};
    headers.forEach((h, i) => {
      rawRow[h] = String(cells[i] ?? "");
    });

    const payloadExtras: RegistryCsvInsertRow["raw_payload"] = {
      csv_import: true,
      source_app: args.sourceApp,
      import_batch_id: args.importBatchId,
      row_index: rowIndex,
      raw_row: rawRow,
    };

    // Preserve grow lineage as provenance only — never as a top-level
    // sensor_readings column (the table has no grow_id; surfacing it there
    // triggers PostgREST PGRST204).
    if (args.growId && args.growId.trim() !== "") {
      payloadExtras.grow_id = args.growId;
    }


    if (deviceSerialIdx >= 0) {
      const v = String(cells[deviceSerialIdx] ?? "").trim();
      if (v) payloadExtras.device_serial = v;
    }
    if (roomIdIdx >= 0) {
      const v = String(cells[roomIdIdx] ?? "").trim();
      if (v) payloadExtras.room_id = v;
    }
    if (sensorIdIdx >= 0) {
      const v = String(cells[sensorIdIdx] ?? "").trim();
      if (v) payloadExtras.sensor_id = v;
    }
    if (temperatureC != null) {
      if (convertedFromF && tempF != null) {
        payloadExtras.temperature_f_original = tempF;
      } else if (tempC != null && tempF != null) {
        payloadExtras.temperature_c_original = tempC;
        payloadExtras.temperature_f_original = tempF;
      }
    }
    if (builtIn) {
      const bi: NonNullable<RegistryCsvInsertRow["raw_payload"]["built_in"]> = {};
      if (builtIn.temp >= 0) {
        const v = parseMetricCell(cells[builtIn.temp]);
        if (v != null) bi.temperature_f = v;
      }
      if (builtIn.humidity >= 0) {
        const v = parseMetricCell(cells[builtIn.humidity]);
        if (v != null) bi.humidity_pct = v;
      }
      if (builtIn.vpd >= 0) {
        const v = parseMetricCell(cells[builtIn.vpd]);
        if (v != null) bi.vpd_kpa = v;
      }
      if (builtIn.co2 >= 0) {
        const v = parseMetricCell(cells[builtIn.co2]);
        if (v != null) bi.co2_ppm = v;
      }
      if (Object.keys(bi).length > 0) payloadExtras.built_in = bi;
    }

    for (const r of emit) {
      rows.push({
        tent_id: args.tentId,
        metric: r.metric,
        value: r.value,
        captured_at: captured,
        source: ADAPTER_CANONICAL_SOURCE,
        quality: "ok",
        raw_payload: payloadExtras,
      });
    }
  });


  return {
    rows,
    acceptedRowCount: rows.length,
    rejectedRowCount: rejected,
    rejectionReasons,
    blocked: false,
    blockedReason: null,
  };
}
