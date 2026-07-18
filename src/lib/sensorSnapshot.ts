/**
 * Pure helpers for the scoped Dashboard "Latest Environment" card.
 *
 * No I/O, no Supabase calls, no React. Read-only derivations only.
 * NOT an AI diagnosis. NOT live device control.
 */

import { normalizeQuickLogSnapshotMetrics } from "@/lib/quick-log/quickLogSnapshotMetricNormalizer";
import { summarizeCsvVendor } from "@/lib/sensorReadingVendorLineage";
import { isSensorTestbenchRow } from "@/lib/sensorTestbenchIndicatorRules";

export type SnapshotSource =
  | "live"
  | "manual"
  | "sim"
  | "diary"
  | "csv"
  | "unavailable"
  /**
   * Rows exist but their `source` is not a recognized trust value (raw
   * vendor strings like "ecowitt"/"pi_bridge", canonical "stale"/"invalid",
   * or anything unexpected). Never rendered as "Live sensor" — claiming
   * live requires every row at the timestamp to literally say "live".
   */
  | "unverified";

/**
 * Per-metric provenance ref keys for {@link SensorSnapshot.metric_refs}.
 * Mirrors the {@link import("@/lib/environmentTargetComparison").MetricKey}
 * union; redeclared locally to avoid a circular import. Keep both lists
 * in sync if a new metric is added.
 */
export type SensorSnapshotMetricRefKey =
  | "temp"
  | "rh"
  | "vpd"
  | "soil"
  | "soil_ec"
  | "soil_temp"
  | "ppfd";

/**
 * Provenance for a single metric in a snapshot. Carries ONLY the safe
 * id + captured_at + raw source from the EXACT `sensor_readings` row
 * already selected by {@link snapshotFromReadings} for that metric.
 * Never carries raw_payload, never inferred, never "nearest" matched.
 */
export interface SensorSnapshotMetricRef {
  id: string;
  captured_at: string;
  source: string;
}

export interface SensorSnapshot {
  source: SnapshotSource;
  /** Aggregated persisted quality for the contributing timestamp cohort. */
  quality?: string | null;
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
   * CSV vendor lineage hint summarized from the contributing CSV rows'
   * upstream provenance envelope (vendor app name only — payload
   * contents are never read or returned by this file; see
   * `summarizeCsvVendor` for the only access path).
   * Presentation-only — NEVER promotes a reading to "live".
   * `"multiple"` is used when multiple CSV vendors are present at the
   * latest timestamp.
   */
  csvVendor?: import("@/lib/sensorSourceDisplayLabel").CsvVendorSummary;
  /**
   * Per-metric provenance for environment alert ref population. Each
   * entry is the EXACT `sensor_readings` row selected by
   * `snapshotFromReadings` for that metric — same id, same `ts` (as
   * `captured_at`), same raw `source`. Only present when the underlying
   * row carried an `id`. Diary-derived snapshots never populate this.
   */
  metric_refs?: Partial<Record<SensorSnapshotMetricRefKey, SensorSnapshotMetricRef>>;
}

export const EMPTY_SNAPSHOT: SensorSnapshot = {
  source: "unavailable",
  quality: null,
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
  live: "Connected sensor",
  manual: "Manual",
  sim: "Simulated",
  diary: "Diary snapshot",
  csv: "CSV history",
  unavailable: "Unavailable",
  unverified: "Unverified source",
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
  /** Persisted intake quality. Missing/unknown can never promote a Live claim. */
  quality?: string | null;
  device_id?: string | null;
  /**
   * Originating `sensor_readings.id`. Optional: when present and the row
   * is selected as the contributing row for a known metric,
   * `snapshotFromReadings` populates `SensorSnapshot.metric_refs[<key>]`
   * for the env-alert ref population path. Never inferred.
   */
  id?: string | null;
  /**
   * Upstream provenance envelope. This file NEVER reads, returns, or
   * renders its contents — it is forwarded as-is to
   * `summarizeCsvVendor`, which is the only sanctioned reader.
   */
  raw_payload?: unknown;
}

/**
 * Map a {@link SensorSnapshotMetricRefKey} to the matching
 * `sensor_readings.metric` value. Snapshot fields and reading metrics
 * use different vocabularies; this table is the only mapping site.
 */
const METRIC_REF_KEY_TO_READING_METRIC: Record<SensorSnapshotMetricRefKey, string> = {
  temp: "temperature_c",
  rh: "humidity_pct",
  vpd: "vpd_kpa",
  soil: "soil_moisture_pct",
  soil_ec: "soil_ec",
  soil_temp: "soil_temp_c",
  ppfd: "ppfd",
};

/**
 * Build a snapshot from a batch of sensor_readings rows. Picks the latest
 * `ts` value and folds metric/value pairs at that timestamp into the
 * snapshot fields. Unknown metrics are ignored, not faked.
 */
export function snapshotFromReadings(rows: SensorReadingLike[]): SensorSnapshot | null {
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
  // "demo" is the canonical name for simulated data in sensor_readings;
  // fold it into the card's existing "sim" bucket so demo rows can never
  // fall through to a live claim.
  const allSim =
    latest.length > 0 && latest.every((r) => r.source === "sim" || r.source === "demo");
  const allCsv = latest.length > 0 && latest.every((r) => r.source === "csv");
  const anyCsv = latest.some((r) => r.source === "csv");
  const normalizedQualities = latest.map((r) =>
    typeof r.quality === "string" ? r.quality.trim().toLowerCase() : "",
  );
  const quality = normalizedQualities.every((value) => value === "ok")
    ? "ok"
    : normalizedQualities.includes("invalid")
      ? "invalid"
      : normalizedQualities.includes("stale")
        ? "stale"
        : normalizedQualities.includes("degraded")
          ? "degraded"
          : null;
  // "Live sensor" is a claim, not a default: it requires EVERY row at the
  // latest timestamp to carry a source in the live reservation. That
  // reservation is the canonical `live` value with accepted persisted
  // quality. Everything else — aliases like "pi_bridge", vendor strings,
  // canonical "stale"/"invalid", or unexpected junk — classifies as
  // "unverified"; the strict trust-badge path refuses the same
  // promotion, and this card must not be looser than it.
  const allLive =
    latest.length > 0 &&
    latest.every((r) => r.source === "live" && r.quality === "ok" && !isSensorTestbenchRow(r));
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
          : allLive
            ? "live"
            : "unverified";
  // Prefer a device_id from a row matching the resolved source so manual
  // device notes (device_id = "manual:...") are surfaced for manual
  // snapshots; otherwise fall back to any device_id at the latest ts.
  const deviceRow =
    latest.find((r) => r.source === source && !!r.device_id) ?? latest.find((r) => !!r.device_id);
  // Summarise CSV vendor lineage (presentation hint only — never
  // upgrades the source classification).
  const csvVendor = source === "csv" ? summarizeCsvVendor(latest) : null;
  // Per-metric provenance — use the EXACT row selected by `get(metric)`
  // (first match in `latest`, preserving existing selection semantics).
  // Only emit a ref when the row carries a non-empty id. Never inferred.
  let metric_refs: Partial<Record<SensorSnapshotMetricRefKey, SensorSnapshotMetricRef>> | undefined;
  for (const key of Object.keys(METRIC_REF_KEY_TO_READING_METRIC) as SensorSnapshotMetricRefKey[]) {
    const readingMetric = METRIC_REF_KEY_TO_READING_METRIC[key];
    const row = latest.find((x) => x.metric === readingMetric);
    if (!row) continue;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!id) continue;
    if (!metric_refs) metric_refs = {};
    metric_refs[key] = {
      id,
      captured_at: row.ts,
      source: typeof row.source === "string" ? row.source : "",
    };
  }
  return {
    source,
    quality,
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
    ...(metric_refs ? { metric_refs } : {}),
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
      quality: null,
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
    quality: null,
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

export function formatValue(v: number | null, unit: string, digits = 1): string {
  if (v === null) return "Unknown";
  return `${v.toFixed(digits)}${unit}`;
}
