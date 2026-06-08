/**
 * latestSensorSnapshotRules — pure, deterministic helpers that turn raw
 * long-format `sensor_readings` rows (one row per metric) into a single
 * "latest tent snapshot" object ready for Quick Log attach + UI preview.
 *
 * Boundaries (stop-ship if violated):
 *  - Pure: no React, no Supabase, no fetch, no timers, no auth.
 *  - Read-only: never writes sensor_readings / grow_events / action_queue /
 *    alerts / ai_doctor_sessions and never returns a device-control hint.
 *  - Never marks stale / manual / csv / demo as Live.
 *  - Never invents data: missing metrics stay missing, never zero.
 *  - Never infers plant identity from a tent snapshot.
 *  - Never infers a soil-moisture channel→plant mapping.
 *  - No fake live / demo fallback.
 */

export const SENSOR_FRESH_WINDOW_MINUTES = 15;
export const SENSOR_FUTURE_SKEW_LIMIT_MINUTES = 5;

export type SensorSnapshotStatus =
  | "fresh_live"
  | "fresh_non_live"
  | "stale"
  | "invalid"
  | "empty";

export type SensorSnapshotFreshness = "fresh" | "stale" | "invalid" | "unknown";

export type SensorMetricKey =
  | "temp_f"
  | "humidity_pct"
  | "vpd_kpa"
  | "soil_moisture_pct"
  | "co2_ppm";

export const REQUIRED_SNAPSHOT_METRICS: readonly SensorMetricKey[] = [
  "temp_f",
  "humidity_pct",
];

export const OPTIONAL_SNAPSHOT_METRICS: readonly SensorMetricKey[] = [
  "vpd_kpa",
  "soil_moisture_pct",
  "co2_ppm",
];

export interface RawSensorRow {
  id?: string | null;
  tent_id?: string | null;
  /** Long-format metric key (e.g. "temperature_c", "humidity_pct"). */
  metric?: string | null;
  value?: number | string | null;
  source?: string | null;
  /** Raw quality field from intake validation; not a Live promotion. */
  quality?: string | null;
  captured_at?: string | null;
  ts?: string | null;
  created_at?: string | null;
  raw_payload?: unknown;
}

export interface SensorMetricEvaluation {
  value: number | null;
  /** True when value is finite AND inside the hard validity range. */
  valid: boolean;
  /** True when valid but at an operator-warning boundary. */
  warn: boolean;
  reason: string | null;
}

export interface SensorSnapshot {
  /** Stable id derived from the freshest row used (never an internal token). */
  sensor_snapshot_id: string | null;
  tent_id: string | null;
  captured_at: string | null;
  age_minutes: number | null;
  source: string | null;
  confidence: number | null;
  freshness: SensorSnapshotFreshness;
  status: SensorSnapshotStatus;
  badge_label: string;
  metrics: Record<SensorMetricKey, number | null>;
  metricDetails: Record<SensorMetricKey, SensorMetricEvaluation>;
  warnings: string[];
  /** True when the snapshot has at least one required metric and is not invalid. */
  usable: boolean;
}

export interface BuildSnapshotOptions {
  now?: Date;
  /** Tent id the rows were fetched for; trusted from caller (not payload). */
  tentId?: string | null;
  /** Optional confidence pass-through (0..1) when caller has one. */
  confidence?: number | null;
}

const EMPTY_METRICS: Record<SensorMetricKey, number | null> = {
  temp_f: null,
  humidity_pct: null,
  vpd_kpa: null,
  soil_moisture_pct: null,
  co2_ppm: null,
};

const EMPTY_DETAILS: Record<SensorMetricKey, SensorMetricEvaluation> = {
  temp_f: { value: null, valid: false, warn: false, reason: null },
  humidity_pct: { value: null, valid: false, warn: false, reason: null },
  vpd_kpa: { value: null, valid: false, warn: false, reason: null },
  soil_moisture_pct: { value: null, valid: false, warn: false, reason: null },
  co2_ppm: { value: null, valid: false, warn: false, reason: null },
};

export const EMPTY_SENSOR_SNAPSHOT: SensorSnapshot = Object.freeze({
  sensor_snapshot_id: null,
  tent_id: null,
  captured_at: null,
  age_minutes: null,
  source: null,
  confidence: null,
  freshness: "unknown",
  status: "empty",
  badge_label: "No sensor data yet",
  metrics: { ...EMPTY_METRICS },
  metricDetails: { ...EMPTY_DETAILS },
  warnings: [],
  usable: false,
}) as SensorSnapshot;

/** Coerce a numeric or numeric-string to a finite number, else null. */
function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Convert Celsius to Fahrenheit. */
function cToF(c: number): number {
  return (c * 9) / 5 + 32;
}

/** Map raw long-format metric keys into our canonical SensorMetricKey. */
function mapRawMetricKey(
  rawMetric: string,
  rawValue: number,
): { key: SensorMetricKey | null; value: number } {
  switch (rawMetric) {
    case "temperature_c":
      return { key: "temp_f", value: cToF(rawValue) };
    case "temp_f":
    case "humidity_pct":
    case "vpd_kpa":
    case "soil_moisture_pct":
    case "co2_ppm":
      return { key: rawMetric, value: rawValue };
    default:
      return { key: null, value: rawValue };
  }
}

export function evaluateMetric(
  key: SensorMetricKey,
  value: number | null,
): SensorMetricEvaluation {
  if (value === null || !Number.isFinite(value)) {
    return { value: null, valid: false, warn: false, reason: null };
  }
  switch (key) {
    case "temp_f": {
      const valid = value >= 32 && value <= 120;
      const warn = valid && (value < 55 || value > 95);
      return {
        value,
        valid,
        warn,
        reason: !valid
          ? "Temperature outside plausible range (32–120°F)."
          : warn
            ? "Temperature outside comfortable range (55–95°F)."
            : null,
      };
    }
    case "humidity_pct": {
      const valid = value >= 0 && value <= 100;
      const warn = valid && (value === 0 || value === 100);
      return {
        value,
        valid,
        warn,
        reason: !valid
          ? "Humidity outside 0–100%."
          : warn
            ? "Humidity stuck at extreme (0% or 100%)."
            : null,
      };
    }
    case "vpd_kpa": {
      const valid = value >= 0 && value <= 5;
      const warn = valid && (value <= 0 || value > 3);
      return {
        value,
        valid,
        warn,
        reason: !valid
          ? "VPD outside 0–5 kPa."
          : warn
            ? "VPD at edge (≤0 or >3 kPa)."
            : null,
      };
    }
    case "soil_moisture_pct": {
      const valid = value >= 0 && value <= 100;
      const warn = valid && (value === 0 || value === 100);
      return {
        value,
        valid,
        warn,
        reason: !valid
          ? "Soil moisture outside 0–100%."
          : warn
            ? "Soil moisture stuck at extreme (0% or 100%)."
            : null,
      };
    }
    case "co2_ppm": {
      const valid = value >= 250 && value <= 5000;
      const warn = valid && (value < 350 || value > 2000);
      return {
        value,
        valid,
        warn,
        reason: !valid
          ? "CO₂ outside 250–5000 ppm."
          : warn
            ? "CO₂ outside comfortable range (350–2000 ppm)."
            : null,
      };
    }
  }
}

export interface FreshnessResult {
  freshness: SensorSnapshotFreshness;
  ageMinutes: number | null;
  capturedAt: string | null;
  reason: string | null;
}

export function classifyFreshness(
  capturedAt: string | null | undefined,
  now: Date,
): FreshnessResult {
  if (typeof capturedAt !== "string" || capturedAt.length === 0) {
    return {
      freshness: "invalid",
      ageMinutes: null,
      capturedAt: null,
      reason: "Missing captured_at.",
    };
  }
  const t = Date.parse(capturedAt);
  if (!Number.isFinite(t)) {
    return {
      freshness: "invalid",
      ageMinutes: null,
      capturedAt,
      reason: "Unparseable captured_at.",
    };
  }
  const ageMs = now.getTime() - t;
  const ageMinutes = Math.round(ageMs / 60_000);
  if (-ageMinutes > SENSOR_FUTURE_SKEW_LIMIT_MINUTES) {
    return {
      freshness: "invalid",
      ageMinutes,
      capturedAt,
      reason: "captured_at is too far in the future.",
    };
  }
  if (ageMinutes <= SENSOR_FRESH_WINDOW_MINUTES) {
    return { freshness: "fresh", ageMinutes, capturedAt, reason: null };
  }
  return { freshness: "stale", ageMinutes, capturedAt, reason: null };
}

const LIVE_SOURCES = new Set<string>([
  "live",
  "pi_bridge",
  "ecowitt",
  "mqtt",
  "webhook",
  "webhook_generic",
  "home_assistant_bridge",
  "ha_forwarded",
  "node_red_bridge",
  "esp32_arduino",
  "esp32_arduino_sht31",
  "esp32_esphome",
  "esp32_mqtt_bridge",
]);

function isLiveSource(source: string | null): boolean {
  if (!source) return false;
  return LIVE_SOURCES.has(source);
}

function formatAge(ageMinutes: number | null): string {
  if (ageMinutes === null) return "unknown age";
  const m = Math.max(0, ageMinutes);
  if (m === 0) return "just now";
  if (m === 1) return "1 min ago";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h === 1 ? "1 hr ago" : `${h} hr ago`;
}

function buildBadgeLabel(
  status: SensorSnapshotStatus,
  source: string | null,
  ageMinutes: number | null,
): string {
  switch (status) {
    case "fresh_live":
      return `Live • as of ${formatAge(ageMinutes)} • source: ${source ?? "live"}`;
    case "fresh_non_live":
      return `${source ?? "manual"} • as of ${formatAge(ageMinutes)}`;
    case "stale":
      return `Stale • as of ${formatAge(ageMinutes)} • source: ${source ?? "unknown"}`;
    case "invalid":
      return `Invalid • source: ${source ?? "unknown"}`;
    case "empty":
    default:
      return "No sensor data yet";
  }
}

/**
 * Build a snapshot from up to N long-format `sensor_readings` rows.
 * The rows MUST already be filtered to a single tent and sorted newest
 * first by the caller. We pivot to the latest value per metric.
 */
export function buildSensorSnapshot(
  rows: readonly RawSensorRow[] | null | undefined,
  options: BuildSnapshotOptions = {},
): SensorSnapshot {
  const now = options.now ?? new Date();
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      ...EMPTY_SENSOR_SNAPSHOT,
      metrics: { ...EMPTY_METRICS },
      metricDetails: { ...EMPTY_DETAILS },
      warnings: [],
      tent_id: options.tentId ?? null,
    };
  }

  const metricValues: Record<SensorMetricKey, number | null> = {
    ...EMPTY_METRICS,
  };
  let freshestCapturedAt: string | null = null;
  let freshestT = -Infinity;
  let freshestSource: string | null = null;
  let freshestId: string | null = null;

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const rawMetric =
      typeof row.metric === "string" ? row.metric : null;
    if (!rawMetric) continue;
    const value = toFiniteNumber(row.value);
    if (value === null) continue;
    const mapped = mapRawMetricKey(rawMetric, value);
    if (!mapped.key) continue;

    const captured =
      typeof row.captured_at === "string" && row.captured_at.length > 0
        ? row.captured_at
        : typeof row.ts === "string" && row.ts.length > 0
          ? row.ts
          : null;

    // Take the latest value per metric (rows arrive newest-first).
    if (metricValues[mapped.key] === null) {
      metricValues[mapped.key] = mapped.value;
    }

    if (captured) {
      const t = Date.parse(captured);
      if (Number.isFinite(t) && t > freshestT) {
        freshestT = t;
        freshestCapturedAt = captured;
        freshestSource =
          typeof row.source === "string" && row.source.length > 0
            ? row.source
            : freshestSource;
        freshestId =
          typeof row.id === "string" && row.id.length > 0
            ? row.id
            : freshestId;
      }
    }
  }

  const metricDetails: Record<SensorMetricKey, SensorMetricEvaluation> = {
    temp_f: evaluateMetric("temp_f", metricValues.temp_f),
    humidity_pct: evaluateMetric("humidity_pct", metricValues.humidity_pct),
    vpd_kpa: evaluateMetric("vpd_kpa", metricValues.vpd_kpa),
    soil_moisture_pct: evaluateMetric(
      "soil_moisture_pct",
      metricValues.soil_moisture_pct,
    ),
    co2_ppm: evaluateMetric("co2_ppm", metricValues.co2_ppm),
  };

  const warnings: string[] = [];
  for (const k of [
    "temp_f",
    "humidity_pct",
    "vpd_kpa",
    "soil_moisture_pct",
    "co2_ppm",
  ] as SensorMetricKey[]) {
    const d = metricDetails[k];
    if (d.value !== null && (d.warn || !d.valid) && d.reason) {
      warnings.push(`${k}: ${d.reason}`);
    }
  }

  // Required-metric validity: if any present required metric is invalid,
  // the snapshot is invalid. Missing required metrics simply downgrade
  // usability — they never inflate to healthy.
  const requiredPresent = REQUIRED_SNAPSHOT_METRICS.filter(
    (k) => metricValues[k] !== null,
  );
  const requiredInvalid = requiredPresent.some(
    (k) => !metricDetails[k].valid,
  );

  const freshness = classifyFreshness(freshestCapturedAt, now);
  const ageMinutes = freshness.ageMinutes;

  let status: SensorSnapshotStatus;
  if (requiredPresent.length === 0) {
    status = freshness.freshness === "invalid" ? "invalid" : "empty";
  } else if (requiredInvalid || freshness.freshness === "invalid") {
    status = "invalid";
  } else if (freshness.freshness === "stale") {
    status = "stale";
  } else if (isLiveSource(freshestSource)) {
    status = "fresh_live";
  } else {
    status = "fresh_non_live";
  }

  if (freshness.reason) warnings.push(`captured_at: ${freshness.reason}`);

  const badge_label = buildBadgeLabel(status, freshestSource, ageMinutes);

  const usable =
    status !== "invalid" &&
    status !== "empty" &&
    requiredPresent.length > 0 &&
    !requiredInvalid;

  return {
    sensor_snapshot_id: freshestId,
    tent_id: options.tentId ?? null,
    captured_at: freshestCapturedAt,
    age_minutes: ageMinutes,
    source: freshestSource,
    confidence:
      typeof options.confidence === "number" &&
      Number.isFinite(options.confidence)
        ? options.confidence
        : null,
    freshness: freshness.freshness,
    status,
    badge_label,
    metrics: metricValues,
    metricDetails,
    warnings,
    usable,
  };
}

/**
 * Build the `details.sensor` JSON payload Quick Log attaches to a diary
 * entry. Returns null when attach is off or the snapshot is not ready.
 * Never includes raw_payload to avoid leaking vendor strings/secrets.
 */
export function buildSensorSnapshotDetails(
  snapshot: SensorSnapshot | null | undefined,
  attach: boolean,
): {
  sensor_snapshot_id: string | null;
  tent_id: string | null;
  captured_at: string | null;
  age_minutes: number | null;
  source: string | null;
  confidence: number | null;
  freshness: SensorSnapshotFreshness;
  status: SensorSnapshotStatus;
  badge_label: string;
  metrics: Record<SensorMetricKey, number | null>;
  warnings: string[];
} | null {
  if (!attach) return null;
  if (!snapshot) return null;
  if (snapshot.status === "empty" || snapshot.status === "invalid") return null;
  return {
    sensor_snapshot_id: snapshot.sensor_snapshot_id,
    tent_id: snapshot.tent_id,
    captured_at: snapshot.captured_at,
    age_minutes: snapshot.age_minutes,
    source: snapshot.source,
    confidence: snapshot.confidence,
    freshness: snapshot.freshness,
    status: snapshot.status,
    badge_label: snapshot.badge_label,
    metrics: {
      temp_f: snapshot.metrics.temp_f ?? null,
      humidity_pct: snapshot.metrics.humidity_pct ?? null,
      vpd_kpa: snapshot.metrics.vpd_kpa ?? null,
      soil_moisture_pct: snapshot.metrics.soil_moisture_pct ?? null,
      co2_ppm: snapshot.metrics.co2_ppm ?? null,
    },
    warnings: snapshot.warnings,
  };
}
