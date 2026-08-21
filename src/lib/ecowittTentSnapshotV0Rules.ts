/**
 * ecowittTentSnapshotV0Rules — locked EcoWitt one-tent Sensor Snapshot V0.
 *
 * Exactly three metrics: air temp, air RH, soil moisture.
 * Constitution Sensor Truth labels only: live | manual | csv | demo | stale | invalid.
 *
 * Hard constraints:
 *  - Pure. No I/O, no React, no timers, no device control.
 *  - Transport may be EcoWitt; Sensor Truth tags are never transport/vendor
 *    strings. Never store, display, or promote `ecowitt`, `ha`,
 *    `homeassistant`, `mqtt`, `esp32`, or `webhook` as the truth source.
 *  - Age uses packet `dateutc` when present (else captured_at / ts).
 *  - Freshness alone never promotes vendor/unknown to live.
 *  - Demo / testbench never live. Stuck RH/soil 0 or 100 → invalid.
 *  - Quiet bridge → no_live_data (presenter shows "No live data").
 *  - Does not remap FIELD_MAP or schema; uses existing repo metric keys only.
 *  - Parked label helpers that still vendor-promote (e.g. sensorSourceLabelRules)
 *    are left alone — V0 does not call them.
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

/** Constitution tags only — the only values V0 may store or show as Sensor Truth. */
export const CONSTITUTION_SENSOR_TRUTH_SOURCES = [
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
] as const satisfies readonly EcowittTentSnapshotV0TruthSource[];

/**
 * Transport / vendor / bridge tokens that must never be Sensor Truth.
 * Matching is exact on the normalized `source` string (not substring), so
 * lineage in raw_payload.vendor stays usable for EcoWitt recognition without
 * becoming a trust label.
 */
export const FORBIDDEN_SENSOR_TRUTH_SOURCE_TOKENS = [
  "ecowitt",
  "ha",
  "homeassistant",
  "home_assistant",
  "mqtt",
  "esp32",
  "webhook",
] as const;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Parse EcoWitt-style dateutc / ISO timestamps to epoch ms.
 * Matches existing ingest convention: space-separated UTC → treat as Z.
 */
export function parseEcowittTentSnapshotV0DateUtcMs(raw: unknown): number | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  const s = raw.trim();
  const iso = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(s)
    ? s.replace(" ", "T") + (s.endsWith("Z") ? "" : "Z")
    : s;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function readDateUtcFromPayload(raw: unknown): number | null {
  if (!isRecord(raw)) return null;
  const direct = parseEcowittTentSnapshotV0DateUtcMs(raw.dateutc);
  if (direct !== null) return direct;
  const metadata = isRecord(raw.metadata) ? raw.metadata : null;
  if (metadata) {
    const nested = parseEcowittTentSnapshotV0DateUtcMs(metadata.dateutc);
    if (nested !== null) return nested;
  }
  return null;
}

/**
 * Packet observation time: prefer raw_payload.dateutc (gateway clock), then
 * captured_at / ts / created_at. Never invents "now".
 */
function observedAtMs(row: EcowittTentSnapshotV0RowLike): number | null {
  const fromDateutc = readDateUtcFromPayload(row.raw_payload);
  if (fromDateutc !== null) return fromDateutc;
  for (const candidate of [row.captured_at, row.ts, row.created_at]) {
    const ms = parseEcowittTentSnapshotV0DateUtcMs(candidate);
    if (ms !== null) return ms;
  }
  return null;
}

function normalizedSource(source: unknown): string {
  return typeof source === "string" ? source.trim().toLowerCase() : "";
}

export function isConstitutionSensorTruthSource(
  value: unknown,
): value is EcowittTentSnapshotV0TruthSource {
  return (
    typeof value === "string" &&
    (CONSTITUTION_SENSOR_TRUTH_SOURCES as readonly string[]).includes(value)
  );
}

export function isForbiddenSensorTruthSourceToken(source: unknown): boolean {
  const src = normalizedSource(source);
  if (!src) return false;
  return (FORBIDDEN_SENSOR_TRUTH_SOURCE_TOKENS as readonly string[]).includes(src);
}

/** User-facing badge copy — constitution tags only; never vendor/transport. */
export function constitutionSensorTruthBadgeLabel(
  truth: EcowittTentSnapshotV0TruthSource | "none",
): string {
  switch (truth) {
    case "live":
      return "Live";
    case "manual":
      return "Manual";
    case "csv":
      return "CSV";
    case "demo":
      return "Demo";
    case "stale":
      return "Stale";
    case "invalid":
      return "Invalid";
    case "none":
      return "No live data";
  }
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
 *  3. Forbidden transport/vendor tokens (ecowitt, ha, mqtt, esp32, webhook, …)
 *     → invalid — freshness cannot rescue them
 *  4. Any other non-canonical token → invalid
 *  5. Canonical `live` + dateutc/captured age ≤ 15m → live; else stale
 *  6. Missing/unparseable timestamp on live path → invalid
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

  // Transport/vendor tokens are never Sensor Truth — even when the packet is fresh.
  if (isForbiddenSensorTruthSourceToken(src) || src !== "live") {
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

export function toFiniteMetricValue(value: unknown): number | null {
  return toFiniteNumber(value);
}

export function readObservedAtIso(row: EcowittTentSnapshotV0RowLike): string | null {
  const ms = observedAtMs(row);
  if (ms === null) return null;
  return new Date(ms).toISOString();
}
