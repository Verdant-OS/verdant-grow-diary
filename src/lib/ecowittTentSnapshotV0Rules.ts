/**
 * ecowittTentSnapshotV0Rules — locked EcoWitt one-tent Sensor Snapshot V0.
 *
 * Exactly three metrics: air temp, air RH, soil moisture.
 * Constitution Sensor Truth labels only: live | manual | csv | demo | stale | invalid.
 *
 * Hard constraints:
 *  - Pure. No I/O, no React, no timers, no device control.
 *  - Vendor string `ecowitt` is never a Sensor Truth source and never live.
 *  - Freshness alone never promotes vendor/unknown to live.
 *  - Demo / testbench never live. Stuck RH/soil 0 or 100 → invalid.
 *  - Quiet bridge → no_live_data (presenter shows "No live data").
 *  - Does not remap FIELD_MAP; uses existing repo metric keys only.
 */

import { SENSOR_SNAPSHOT_STALE_THRESHOLD_MS } from "@/constants/sensorTiming";
import { isSensorTestbenchRow } from "@/lib/sensorTestbenchIndicatorRules";

/** Constitution Sensor Truth source labels for V0. */
export type EcowittTentSnapshotV0TruthSource =
  "live" | "manual" | "csv" | "demo" | "stale" | "invalid";

/** V0 metric keys — match existing snapshot vocabulary (temp/rh/soil). */
export type EcowittTentSnapshotV0MetricKey = "temp" | "rh" | "soil";

export const ECOWITT_TENT_SNAPSHOT_V0_METRICS: readonly EcowittTentSnapshotV0MetricKey[] = [
  "temp",
  "rh",
  "soil",
] as const;

export const ECOWITT_TENT_SNAPSHOT_V0_NO_LIVE_DATA = "No live data" as const;

export const ECOWITT_TENT_SNAPSHOT_V0_FRESH_MS = SENSOR_SNAPSHOT_STALE_THRESHOLD_MS;

/** Night window for "drifted last night" (UTC hours, inclusive start / exclusive end). */
export const ECOWITT_TENT_SNAPSHOT_V0_NIGHT_UTC_START_HOUR = 0;
export const ECOWITT_TENT_SNAPSHOT_V0_NIGHT_UTC_END_HOUR = 6;

export interface EcowittTentSnapshotV0RowLike {
  source?: string | null;
  captured_at?: string | null;
  ts?: string | null;
  created_at?: string | null;
  metric?: string | null;
  value?: number | string | null;
  raw_payload?: unknown;
  tent_id?: string | null;
  plant_id?: string | null;
  quality?: string | null;
}

export interface ClassifyEcowittTentSnapshotV0SourceInput {
  row: EcowittTentSnapshotV0RowLike;
  now?: Date;
  /** Override freshness window (default 15 min). */
  freshWindowMs?: number;
}

/**
 * Map long-format / EcoWitt FIELD_MAP aliases into V0 metric keys.
 * Unknown names are refused (returned null) — never invented.
 */
export function mapEcowittTentSnapshotV0MetricKey(
  rawMetric: string | null | undefined,
): EcowittTentSnapshotV0MetricKey | null {
  if (typeof rawMetric !== "string") return null;
  const key = rawMetric.trim().toLowerCase();
  switch (key) {
    case "temperature_c":
    case "temp_c":
    case "temp_f":
    case "temp":
      return "temp";
    case "humidity_pct":
    case "humidity_percent":
    case "rh":
      return "rh";
    case "soil_moisture_pct":
    case "soil":
      return "soil";
    default:
      return null;
  }
}

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function observedAtMs(row: EcowittTentSnapshotV0RowLike): number | null {
  for (const candidate of [row.captured_at, row.ts, row.created_at]) {
    if (typeof candidate !== "string" || candidate.trim().length === 0) continue;
    const ms = Date.parse(candidate);
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

function normalizedSource(source: unknown): string {
  return typeof source === "string" ? source.trim().toLowerCase() : "";
}

/** True when RH or soil moisture is stuck at the impossible healthy extremes. */
export function isStuckZeroOrHundredPct(value: number | null | undefined): boolean {
  if (value === null || value === undefined || !Number.isFinite(value)) return false;
  return value === 0 || value === 100;
}

/**
 * Validate a V0 metric value. Stuck RH/soil at 0 or 100 → invalid.
 * Unparseable → invalid. Temp uses Celsius storage realism when metric is temp
 * and value looks like °C (typical stored form); Fahrenheit display convert is
 * presenter-side.
 */
export function evaluateEcowittTentSnapshotV0Metric(
  key: EcowittTentSnapshotV0MetricKey,
  value: number | null,
): { valid: boolean; reason: string | null } {
  if (value === null || !Number.isFinite(value)) {
    return { valid: false, reason: "Unparseable metric value." };
  }
  switch (key) {
    case "temp": {
      // Stored temp is Celsius in long-format rows. Allow a wide but realistic band.
      // Values that look like Fahrenheit (>60) are still accepted here; display
      // conversion happens in the view-model using the stored-unit convention.
      const looksLikeC = value >= -20 && value <= 60;
      const looksLikeF = value > 60 && value <= 110;
      if (!looksLikeC && !looksLikeF) {
        return { valid: false, reason: "Temperature outside plausible range." };
      }
      return { valid: true, reason: null };
    }
    case "rh":
    case "soil": {
      if (value < 0 || value > 100) {
        return {
          valid: false,
          reason: `${key === "rh" ? "Humidity" : "Soil moisture"} outside 0–100%.`,
        };
      }
      if (isStuckZeroOrHundredPct(value)) {
        return {
          valid: false,
          reason: `${key === "rh" ? "Humidity" : "Soil moisture"} stuck at ${value}% — invalid.`,
        };
      }
      return { valid: true, reason: null };
    }
  }
}

/**
 * Classify constitution Sensor Truth source for one EcoWitt-lineage row.
 *
 * Order (fail closed):
 *  1. Testbench / demo provenance → demo (never live)
 *  2. Canonical manual / csv / demo / stale / invalid pass through
 *  3. Vendor string `ecowitt` (and other non-canonical) → invalid
 *  4. Canonical `live` + age ≤ 15m → live; else stale
 *  5. Missing/unparseable timestamp on live path → invalid
 */
export function classifyEcowittTentSnapshotV0Source(
  input: ClassifyEcowittTentSnapshotV0SourceInput,
): EcowittTentSnapshotV0TruthSource {
  const row = input.row;
  const now = input.now ?? new Date();
  const windowMs = input.freshWindowMs ?? ECOWITT_TENT_SNAPSHOT_V0_FRESH_MS;
  const src = normalizedSource(row.source);

  if (isSensorTestbenchRow(row)) return "demo";

  if (src === "manual" || src === "csv" || src === "demo" || src === "stale" || src === "invalid") {
    return src;
  }

  // Vendor / transport / unknown tokens are never Sensor Truth sources.
  if (src !== "live") {
    return "invalid";
  }

  const observedMs = observedAtMs(row);
  if (observedMs === null) return "invalid";
  const ageMs = now.getTime() - observedMs;
  if (!Number.isFinite(ageMs)) return "invalid";
  // Far-future timestamps fail closed.
  if (ageMs < -5 * 60 * 1000) return "invalid";
  if (ageMs <= windowMs) return "live";
  return "stale";
}

export type EcowittTentSnapshotV0BridgeQuietState = "quiet" | "has_live" | "has_non_live_only";

/**
 * Quiet bridge = no constitution `live` reading in the freshness window.
 */
export function classifyEcowittTentSnapshotV0BridgeQuiet(
  rows: readonly EcowittTentSnapshotV0RowLike[] | null | undefined,
  options: { now?: Date; freshWindowMs?: number } = {},
): EcowittTentSnapshotV0BridgeQuietState {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) return "quiet";

  let sawNonLive = false;
  for (const row of list) {
    const truth = classifyEcowittTentSnapshotV0Source({
      row,
      now: options.now,
      freshWindowMs: options.freshWindowMs,
    });
    if (truth === "live") return "has_live";
    sawNonLive = true;
  }
  return sawNonLive ? "has_non_live_only" : "quiet";
}

export function isUtcNightHour(
  iso: string,
  startHour = ECOWITT_TENT_SNAPSHOT_V0_NIGHT_UTC_START_HOUR,
  endHour = ECOWITT_TENT_SNAPSHOT_V0_NIGHT_UTC_END_HOUR,
): boolean {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return false;
  const hour = new Date(ms).getUTCHours();
  if (startHour === endHour) return true;
  if (startHour < endHour) return hour >= startHour && hour < endHour;
  // Wrap past midnight (not used by V0 defaults, but keep deterministic).
  return hour >= startHour || hour < endHour;
}

export function toFiniteMetricValue(value: unknown): number | null {
  return toFiniteNumber(value);
}

export function readObservedAtIso(row: EcowittTentSnapshotV0RowLike): string | null {
  const ms = observedAtMs(row);
  if (ms === null) return null;
  return new Date(ms).toISOString();
}
