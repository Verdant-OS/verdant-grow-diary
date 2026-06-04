/**
 * ecowittPayloadRules — thin presentation-oriented wrapper around the
 * existing `ecowittPayloadAdapter`.
 *
 * Boundaries (stop-ship if violated):
 *  - Pure function. No I/O, no React, no timers, no auth.
 *  - Never trusts caller-supplied source as "live". The vendor lineage
 *    tag ("ecowitt") is presentation-only and does NOT promote a stale
 *    or invalid reading to live in the source label resolver.
 *  - Does not duplicate intake validation (range checks, stuck-at-extreme,
 *    Celsius-as-Fahrenheit suspicion) — those live in
 *    `sensorBridgeIntakeRules` and are exercised via the adapter.
 *  - Does not duplicate VPD formula — `derivedVpd` reuses
 *    `computeVpdKpa` from `sensorReadingManualEntryRules`.
 *  - Read-only: never writes to alerts, action_queue, or device control.
 */
import {
  adaptEcoWittPayloadToBridgeInput,
  type EcoWittAdapterOptions,
  type EcoWittAdapterResult,
} from "@/lib/ecowittPayloadAdapter";
import { computeVpdKpa } from "@/lib/sensorReadingManualEntryRules";
import { SENSOR_SOURCE_STALE_MINUTES } from "@/lib/sensorSourceHealthRules";
import {
  evaluateEcowittSuspicion,
  type EcowittSuspicionFlag,
  type EcowittSuspicionResult,
} from "@/lib/ecowittSuspiciousReadingRules";

export type EcowittFreshness = "fresh" | "stale" | "missing";

export type EcowittNormalizedMetric =
  | "temperature_c"
  | "humidity_pct"
  | "soil_moisture_pct"
  | "co2_ppm";

export interface EcowittNormalizedReading {
  metric: EcowittNormalizedMetric;
  value: number;
  unit: string;
}

export interface EcowittNormalizedSnapshot {
  ok: boolean;
  vendor: "ecowitt";
  capturedAt: string | null;
  freshness: EcowittFreshness;
  ageMinutes: number | null;
  readings: EcowittNormalizedReading[];
  /** Pure-derived VPD (kPa) from temperature_c + humidity_pct, or null. */
  derivedVpdKpa: number | null;
  warnings: EcoWittAdapterResult["warnings"];
  reasons: EcoWittAdapterResult["reasons"];
  rawPayload: unknown;
  /** Suspicious-data flags (empty when reading is clean). */
  suspicion: EcowittSuspicionFlag[];
  /** Highest suspicion severity, or null when clean. */
  suspicionSeverity: EcowittSuspicionResult["worst"];
  /**
   * True when at least one suspicion flag is `invalid` and the snapshot
   * should be rendered as "Invalid / Unavailable" instead of healthy.
   */
  invalid: boolean;
}

export interface NormalizeEcowittOptions extends EcoWittAdapterOptions {
  /** Current wall-clock — injected for determinism in tests. */
  now?: Date;
  /** Recent humidity samples for stuck-at-extreme detection. */
  recentHumidityPct?: ReadonlyArray<number | null | undefined>;
  /** Recent soil-moisture samples for stuck-at-extreme detection. */
  recentSoilMoisturePct?: ReadonlyArray<number | null | undefined>;
}


const ALLOWED_METRICS = new Set<EcowittNormalizedMetric>([
  "temperature_c",
  "humidity_pct",
  "soil_moisture_pct",
  "co2_ppm",
]);

function freshnessFromAge(
  ageMinutes: number | null,
): EcowittFreshness {
  if (ageMinutes == null) return "missing";
  if (ageMinutes < 0) return "fresh"; // future-dated guard
  return ageMinutes <= SENSOR_SOURCE_STALE_MINUTES ? "fresh" : "stale";
}

function ageMinutesBetween(
  capturedAt: string | null,
  now: Date,
): number | null {
  if (!capturedAt) return null;
  const t = Date.parse(capturedAt);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((now.getTime() - t) / 60_000));
}

/**
 * Normalize a raw EcoWitt payload into a deterministic display snapshot.
 *
 * Returns `ok: false` with an empty reading list when the payload is not
 * a plain object, contains no mappable metrics, or only contains
 * implausible values (the adapter records those as warnings / reasons).
 */
export function normalizeEcowittPayload(
  payload: unknown,
  options: NormalizeEcowittOptions = {},
): EcowittNormalizedSnapshot {
  const now = options.now ?? new Date();
  const adapter = adaptEcoWittPayloadToBridgeInput(payload, options);

  const readings: EcowittNormalizedReading[] = [];
  const adapterReadings = Array.isArray(adapter.input.readings)
    ? (adapter.input.readings as ReadonlyArray<{
        metric?: unknown;
        value?: unknown;
        unit?: unknown;
      }>)
    : [];
  for (const r of adapterReadings) {
    const metric = r?.metric;
    if (typeof metric !== "string") continue;
    if (!ALLOWED_METRICS.has(metric as EcowittNormalizedMetric)) continue;
    const value = r?.value;
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const unit = typeof r?.unit === "string" ? r.unit : "";
    readings.push({
      metric: metric as EcowittNormalizedMetric,
      value,
      unit,
    });
  }

  const capturedAtRaw = adapter.input.captured_at;
  const capturedAt =
    typeof capturedAtRaw === "string" && capturedAtRaw.length > 0
      ? capturedAtRaw
      : null;
  const ageMinutes = ageMinutesBetween(capturedAt, now);
  const freshness = capturedAt ? freshnessFromAge(ageMinutes) : "missing";

  const tempC = readings.find((r) => r.metric === "temperature_c")?.value;
  const rhPct = readings.find((r) => r.metric === "humidity_pct")?.value;
  const soilPct = readings.find((r) => r.metric === "soil_moisture_pct")?.value;
  const rawTempF = readPayloadTempF(payload);

  const suspicion = evaluateEcowittSuspicion({
    temperatureC: typeof tempC === "number" ? tempC : null,
    humidityPct: typeof rhPct === "number" ? rhPct : null,
    soilMoisturePct: typeof soilPct === "number" ? soilPct : null,
    rawTempF,
    recentHumidityPct: options.recentHumidityPct,
    recentSoilMoisturePct: options.recentSoilMoisturePct,
  });

  // Derived VPD must refuse to compute against invalid temp/RH so the UI
  // does not display a confidently-wrong derived value.
  const rhValidForVpd =
    typeof rhPct === "number" && rhPct >= 0 && rhPct <= 100;
  const tempValidForVpd =
    typeof tempC === "number" && tempC > -20 && tempC < 60;
  const derivedVpdKpa =
    rhValidForVpd && tempValidForVpd && !suspicion.hasInvalid
      ? computeVpdKpa(tempC as number, rhPct as number)
      : null;

  return {
    ok: adapter.ok && readings.length > 0 && !suspicion.hasInvalid,
    vendor: "ecowitt",
    capturedAt,
    freshness,
    ageMinutes,
    readings,
    derivedVpdKpa,
    warnings: adapter.warnings,
    reasons: adapter.reasons,
    rawPayload: payload,
    suspicion: suspicion.flags,
    suspicionSeverity: suspicion.worst,
    invalid: suspicion.hasInvalid,
  };
}

function readPayloadTempF(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (/^temp([1-8]?)f$/i.test(key) || key.toLowerCase() === "tempinf") {
      const raw = obj[key];
      const n = typeof raw === "number" ? raw : Number(raw);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

