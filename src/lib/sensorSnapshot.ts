/**
 * Pure helpers for the scoped Dashboard "Latest Environment" card.
 *
 * No I/O, no Supabase calls, no React. Read-only derivations only.
 * NOT an AI diagnosis. NOT live device control.
 */

import { normalizeQuickLogSnapshotMetrics } from "@/lib/quick-log/quickLogSnapshotMetricNormalizer";
import { summarizeCsvVendor } from "@/lib/sensorReadingVendorLineage";
import { classifyTimelineSensorSource } from "@/lib/timelineSensorSourceBadgeRules";


export type SnapshotSource =
  | "live"
  | "manual"
  | "sim"
  | "diary"
  | "csv"
  | "demo"
  | "stale"
  | "invalid"
  | "unavailable";

export interface SensorSnapshot {
  source: SnapshotSource;
  ts: string | null;
  /**
   * Explicit capture time from the contributing sensor rows, when one is
   * present. `ts` is the ingest/bucket timestamp and can be fresher than
   * the moment the reading was actually captured, so freshness decisions
   * must prefer `captured_at` over `ts` whenever it is available.
   */
  captured_at?: string | null;
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
   * CSV vendor lineage hint summarized from the contributing CSV rows'
   * upstream provenance envelope (vendor app name only — payload
   * contents are never read or returned by this file; see
   * `summarizeCsvVendor` for the only access path).
   * Presentation-only — NEVER promotes a reading to "live".
   * `"multiple"` is used when multiple CSV vendors are present at the
   * latest timestamp.
   */
  csvVendor?: import("@/lib/sensorSourceDisplayLabel").CsvVendorSummary;
}

export const EMPTY_SNAPSHOT: SensorSnapshot = {
  source: "unavailable",
  ts: null,
  captured_at: null,
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
  demo: "Demo data",
  stale: "Stale",
  invalid: "Invalid",
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
  /** Explicit capture time from the row, when the caller selected it. */
  captured_at?: string | null;
  device_id?: string | null;
  /**
   * Upstream provenance envelope. This file NEVER reads, returns, or
   * renders its contents — it is forwarded as-is to
   * `summarizeCsvVendor`, which is the only sanctioned reader.
   */
  raw_payload?: unknown;
}

/**
 * Source tags persisted by ACTIVE checked ingest writers that have not yet
 * migrated to the canonical "live" label:
 *   - "pi_bridge"  — supabase/functions/pi-ingest-readings
 *   - "ecowitt"    — supabase/functions/_shared/ecowittRoutedRowBuilder
 * These are live-transport readings; freshness/quality layers decide the
 * rest. Compatibility mapping only — remove entries once the writers store
 * canonical "live" (EcoWitt Phase 1.8 workstream). Do NOT add new tags
 * here; new writers must persist canonical sources.
 */
const ACTIVE_LIVE_TRANSPORT_SOURCES: ReadonlySet<string> = new Set([
  "pi_bridge",
  "ecowitt",
]);

/**
 * Classify one sensor_readings row's raw source into the snapshot
 * vocabulary. Routes through the canonical timeline classifier so
 * missing/unknown/retired alias sources resolve to "invalid" — never
 * "live". Exceptions: the legacy "sim" label is kept as "sim" for
 * existing simulated-data disclosure surfaces, and the active writers'
 * transport tags above map to "live" until those writers migrate.
 */
export function classifySensorReadingRowSource(
  raw: string | null | undefined,
): Exclude<SnapshotSource, "diary" | "unavailable"> {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (v === "sim") return "sim";
  if (ACTIVE_LIVE_TRANSPORT_SOURCES.has(v)) return "live";
  return classifyTimelineSensorSource({ rawSource: raw }).kind;
}

/**
 * Fold the per-row source kinds of one capture batch into a single
 * snapshot source. Precedence: manual wins (a grower's entry is never
 * relabeled), all-sim stays sim, CSV history never masquerades as live,
 * then invalid / demo / stale each block "live". "live" is returned only
 * when every contributing row is canonically live — never by fallthrough.
 */
export function foldSensorSourceKinds(
  kinds: ReadonlyArray<Exclude<SnapshotSource, "diary" | "unavailable">>,
): SnapshotSource {
  if (kinds.length === 0) return "unavailable";
  if (kinds.includes("manual")) return "manual";
  if (kinds.every((k) => k === "sim")) return "sim";
  if (kinds.includes("csv")) return "csv";
  if (kinds.includes("invalid")) return "invalid";
  if (kinds.includes("demo") || kinds.includes("sim")) return "demo";
  if (kinds.includes("stale")) return "stale";
  return kinds.every((k) => k === "live") ? "live" : "invalid";
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
  const kinds = latest.map((r) => classifySensorReadingRowSource(r.source));
  const source = foldSensorSourceKinds(kinds);
  // Prefer a device_id from a row matching the resolved source so manual
  // device notes (device_id = "manual:...") are surfaced for manual
  // snapshots; otherwise fall back to any device_id at the latest ts.
  const deviceRow =
    latest.find((r, i) => kinds[i] === source && !!r.device_id) ??
    latest.find((r) => !!r.device_id);
  // Summarise CSV vendor lineage (presentation hint only — never
  // upgrades the source classification).
  const csvVendor = source === "csv" ? summarizeCsvVendor(latest) : null;
  // Explicit capture time from the contributing rows, when selected by
  // the caller. Freshness decisions must prefer this over `ts`.
  let capturedAt: string | null = null;
  for (const r of latest) {
    const c = r.captured_at;
    if (typeof c === "string" && Number.isFinite(Date.parse(c))) {
      capturedAt = c;
      break;
    }
  }
  return {
    source,
    ts: latestTs,
    captured_at: capturedAt,
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
      captured_at: capturedAt,
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
    captured_at: ts,
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
