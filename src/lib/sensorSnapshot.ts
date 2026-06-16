/**
 * Pure helpers for the scoped Dashboard "Latest Environment" card.
 *
 * No I/O, no Supabase calls, no React. Read-only derivations only.
 * NOT an AI diagnosis. NOT live device control.
 */

import { normalizeQuickLogSnapshotMetrics } from "@/lib/quick-log/quickLogSnapshotMetricNormalizer";
import { summarizeCsvVendor } from "@/lib/sensorReadingVendorLineage";


export type SnapshotSource = "live" | "manual" | "sim" | "diary" | "csv" | "unavailable";

export interface SensorSnapshot {
  source: SnapshotSource;
  ts: string | null;
  temp: number | null;
  rh: number | null;
  vpd: number | null;
  co2: number | null;
  soil: number | null;
  soil_ec: number | null;
  soil_temp: number | null;
  ppfd: number | null;
  /**
   * Raw `device_id` from the contributing sensor row (when one is
   * available). Display surfaces pair this with `source` via
   * `formatSensorSourceLabel` to render labels like
   * "Manual reading · EcoWitt WH45 CO2/THP Monitor" without ever upgrading
   * a manual row to live.
   */
  device_id?: string | null;
  /**
   * CSV vendor lineage hint extracted upstream from the contributing
   * CSV rows' provenance envelope (vendor app name only — never the
   * underlying payload contents). Presentation-only — NEVER promotes a
   * reading to "live". `"multiple"` is used when multiple CSV vendors
   * are present at the latest timestamp.
   */
  csvVendor?: import("@/lib/sensorSourceDisplayLabel").CsvVendorSummary;
}

export const EMPTY_SNAPSHOT: SensorSnapshot = {
  source: "unavailable",
  ts: null,
  temp: null,
  rh: null,
  vpd: null,
  co2: null,
  soil: null,
  soil_ec: null,
  soil_temp: null,
  ppfd: null,
  device_id: null,
  csvVendor: null,
};

/** Coerce numeric DB values; returns null for null/undefined/NaN/Infinity. */
export function toFiniteNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export const SOURCE_LABEL: Record<SnapshotSource, string> = {
  live: "Live sensor",
  manual: "Manual",
  sim: "Simulated",
  diary: "Diary snapshot",
  csv: "CSV history",
  unavailable: "Unavailable",
};

/** Default stale threshold (30 minutes). */
export const STALE_THRESHOLD_MS = 30 * 60 * 1000;

export function isStale(
  ts: string | null,
  now: number = Date.now(),
  thresholdMs: number = STALE_THRESHOLD_MS,
): boolean {
  if (!ts) return false;
  const t = new Date(ts).getTime();
  if (!Number.isFinite(t)) return false;
  return now - t > thresholdMs;
}

export interface SensorReadingLike {
  ts: string;
  metric: string;
  value: number | string | null;
  source?: string | null;
  device_id?: string | null;
  raw_payload?: unknown;
}

/**
 * Build a snapshot from a batch of sensor_readings rows. Picks the latest
 * `ts` value and folds metric/value pairs at that timestamp into the
 * snapshot fields. Unknown metrics are ignored, not faked.
 */
export function snapshotFromReadings(
  rows: SensorReadingLike[],
): SensorSnapshot | null {
  if (!rows || rows.length === 0) return null;
  // rows are expected ordered desc; take the latest ts then keep all rows at
  // that exact timestamp (multi-metric readings often share ts).
  const latestTs = rows[0].ts;
  const latest = rows.filter((r) => r.ts === latestTs);
  const get = (metric: string): number | null => {
    const r = latest.find((x) => x.metric === metric);
    return r ? toFiniteNumber(r.value) : null;
  };
  const anyManual = latest.some((r) => r.source === "manual");
  const allSim =
    latest.length > 0 && latest.every((r) => r.source === "sim");
  const allCsv =
    latest.length > 0 && latest.every((r) => r.source === "csv");
  const anyCsv = latest.some((r) => r.source === "csv");
  // CSV history must never be promoted to "live". If every row at the
  // latest timestamp is CSV, classify as "csv". If CSV is mixed with
  // non-live sources but no manual, still prefer csv over live so
  // imported history never masquerades as a live reading.
  const source: SnapshotSource = anyManual
    ? "manual"
    : allSim
      ? "sim"
      : allCsv
        ? "csv"
        : anyCsv
          ? "csv"
          : "live";
  // Prefer a device_id from a row matching the resolved source so manual
  // device notes (device_id = "manual:...") are surfaced for manual
  // snapshots; otherwise fall back to any device_id at the latest ts.
  const deviceRow =
    latest.find((r) => r.source === source && !!r.device_id) ??
    latest.find((r) => !!r.device_id);
  // Summarise CSV vendor lineage (presentation hint only — never
  // upgrades the source classification).
  const csvVendor = source === "csv" ? summarizeCsvVendor(latest) : null;
  return {
    source,
    ts: latestTs,
    temp: get("temperature_c"),
    rh: get("humidity_pct"),
    vpd: get("vpd_kpa"),
    co2: get("co2_ppm"),
    soil: get("soil_moisture_pct"),
    soil_ec: get("soil_ec"),
    soil_temp: get("soil_temp_c"),
    ppfd: get("ppfd"),
    device_id: deviceRow?.device_id ?? null,
    csvVendor,
  };
}

/**
 * Build a snapshot from a diary_entries.details.sensor_snapshot blob.
 *
 * Tolerates BOTH shapes:
 *   1. Legacy flat shape: { ts, temp, rh, vpd, co2, soil, soil_ec,
 *      soil_temp, ppfd } — written by pre-Quick-Log diary code. Numeric
 *      strings are coerced (existing contract).
 *   2. Quick Log v1 companion shape: { source, captured_at, metrics: {
 *      temperature, humidity, vpd, co2, soil_moisture, soil_temp,
 *      soil_ec, ppfd, ... } } — written by `createQuickLogEvent` into
 *      the companion diary row. Routed through the shared
 *      `normalizeQuickLogSnapshotMetrics` so legacy (`temperature_c`,
 *      `humidity_pct`, …) and clean canonical keys collapse to the
 *      same canonical vocabulary the Quick Log timeline / AI Doctor
 *      adapter consume. Without this, Quick Log writes render correctly
 *      in the timeline but "Unknown" in the Latest Environment card.
 *
 * Source label remains `"diary"` in both shapes so existing source-label
 * / trust badge behavior is preserved (no legacy/companion blob ever
 * relabels itself as `live` via this path).
 */
export function snapshotFromDiary(
  entryAt: string | null,
  snap: Record<string, unknown> | null | undefined,
): SensorSnapshot | null {
  if (!snap || typeof snap !== "object") return null;

  const rawMetrics =
    snap.metrics && typeof snap.metrics === "object" && !Array.isArray(snap.metrics)
      ? (snap.metrics as Record<string, unknown>)
      : null;

  if (rawMetrics) {
    const capturedAt =
      (typeof snap.captured_at === "string" ? (snap.captured_at as string) : null) ??
      (typeof snap.ts === "string" ? (snap.ts as string) : null) ??
      entryAt;
    if (!capturedAt) return null;
    const m = normalizeQuickLogSnapshotMetrics(rawMetrics);
    return {
      source: "diary",
      ts: capturedAt,
      temp: toFiniteNumber(m.temperature),
      rh: toFiniteNumber(m.humidity),
      vpd: toFiniteNumber(m.vpd),
      co2: toFiniteNumber(m.co2),
      soil: toFiniteNumber(m.soil_moisture),
      soil_ec: toFiniteNumber(m.soil_ec),
      soil_temp: toFiniteNumber(m.soil_temp),
      ppfd: toFiniteNumber(m.ppfd),
      device_id: null,
    };
  }

  const ts = (typeof snap.ts === "string" ? snap.ts : null) ?? entryAt;
  if (!ts) return null;
  return {
    source: "diary",
    ts,
    temp: toFiniteNumber(snap.temp),
    rh: toFiniteNumber(snap.rh),
    vpd: toFiniteNumber(snap.vpd),
    co2: toFiniteNumber(snap.co2),
    soil: toFiniteNumber(snap.soil),
    soil_ec: toFiniteNumber(snap.soil_ec),
    soil_temp: toFiniteNumber(snap.soil_temp),
    ppfd: toFiniteNumber(snap.ppfd),
    device_id: null,
  };
}

export function formatValue(
  v: number | null,
  unit: string,
  digits = 1,
): string {
  if (v === null) return "Unknown";
  return `${v.toFixed(digits)}${unit}`;
}
