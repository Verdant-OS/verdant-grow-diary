/**
 * Pure helpers for the scoped Dashboard "Latest Environment" card.
 *
 * No I/O, no Supabase calls, no React. Read-only derivations only.
 * NOT an AI diagnosis. NOT live device control.
 */

export type SnapshotSource = "live" | "manual" | "sim" | "diary" | "unavailable";

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
  const source: SnapshotSource = anyManual
    ? "manual"
    : allSim
      ? "sim"
      : "live";
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
  };
}

/**
 * Build a snapshot from a diary_entries.details.sensor_snapshot blob.
 * Tolerates missing/invalid values (rendered as Unknown).
 */
export function snapshotFromDiary(
  entryAt: string | null,
  snap: Record<string, unknown> | null | undefined,
): SensorSnapshot | null {
  if (!snap || typeof snap !== "object") return null;
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
