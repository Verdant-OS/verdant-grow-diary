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

// ---------------------------------------------------------------------------
// Cloud / multi-tent normalization (NEW)
// ---------------------------------------------------------------------------
//
// Pure extension that turns one raw EcoWitt cloud/device response into
// canonical `NormalizedSensorReading` rows, applying:
//   - explicit MAC + channel -> tent_id mapping (no defaults, no fallback),
//   - suspicious-data rules from `evaluateEcowittSuspicion`,
//   - canonical live/stale/invalid classification from
//     `normalizeSensorReading` (single source-of-truth stale window).
//
// Library only:
//   - no fetch, no DB client, no auth, no React, no timers,
//   - no edge-function changes,
//   - does not invent EC for EcoWitt,
//   - does not invent a pressure metric (canonical NormalizedSensorReading
//     has no pressure field; pressure channels are flagged as unmapped
//     rather than silently dropped or silently invented).

import {
  normalizeSensorReading,
  type NormalizedSensorReading,
} from "@/lib/sensorReadingNormalizationRules";
import {
  ECOWITT_MISSING_METRIC_CODES,
  type EcowittMissingMetricCode,
} from "@/constants/ecowittMissingMetricCodes";

export type EcowittCloudUnmappedReason =
  | "no_tent_mapping_for_channel"
  | "unsupported_metric_for_ecowitt";


export interface EcowittCloudUnmappedChannel {
  raw_key: string;
  channel: number | null;
  metric:
    | "temperature_c"
    | "humidity_pct"
    | "soil_moisture_pct"
    | "pressure_hpa";
  value: number | null;
  reason: EcowittCloudUnmappedReason;
  /**
   * Human-facing note. Must avoid: confirmed / certain / synced /
   * connected / imported / guaranteed.
   */
  note: string;
}

export interface EcowittCloudTentChannelMap {
  /** Channel index (1..8) → Verdant tent id for air metrics. */
  air?: Readonly<Record<number, string>>;
  /** Channel index (1..8) → Verdant tent id for soil metrics. */
  soil?: Readonly<Record<number, string>>;
}

export interface EcowittCloudMappingConfig {
  /**
   * Explicit per-MAC mapping. Unmapped MACs/channels are NEVER assigned a
   * default tent — they are returned in `unmapped`.
   */
  byMac: Readonly<Record<string, EcowittCloudTentChannelMap>>;
}

export interface NormalizeEcowittCloudOptions {
  /** Wall clock; inject for deterministic tests. */
  now?: Date;
  /** Stale window override (ms). Defaults to canonical STALE_THRESHOLD_MS. */
  staleThresholdMs?: number;
  /** Recent humidity samples per channel for stuck-extreme detection. */
  recentHumidityPctByChannel?: Readonly<
    Record<number, ReadonlyArray<number | null | undefined>>
  >;
  /** Recent soil moisture samples per channel for stuck-extreme detection. */
  recentSoilMoisturePctByChannel?: Readonly<
    Record<number, ReadonlyArray<number | null | undefined>>
  >;
}

export interface EcowittCloudReadingRow {
  /** Verdant tent id resolved from explicit MAC+channel mapping. */
  tent_id: string;
  /** Plant id is always null for environment readings. */
  plant_id: null;
  /** EcoWitt MAC that produced this reading (uppercased), or "" if absent. */
  device_mac: string;
  /** EcoWitt channel index (1..8). */
  channel: number;
  /** Canonical normalized reading (source = live | stale | invalid). */
  reading: NormalizedSensorReading;
  /** Confidence in [0,1]; reduced when suspicion fired. */
  confidence: number;
  /** Suspicion flag codes that fired for this row. */
  suspicion_codes: string[];
}

export interface EcowittCloudNormalizationResult {
  rows: EcowittCloudReadingRow[];
  unmapped: EcowittCloudUnmappedChannel[];
  warnings: string[];
  /**
   * Closed-vocabulary "missing metric" signals derived at the
   * (mac, channel)-bucket level. Deduped + sorted. ID-free by construction
   * (codes only, no MAC / tent_id / channel index).
   */
  missing_metric_codes: EcowittMissingMetricCode[];
}


const ECOWITT_TEMP_F_RE = /^temp([1-8])f$/i;
const ECOWITT_HUMIDITY_CH_RE = /^humidity([1-8])$/i;
const ECOWITT_SOIL_CH_RE = /^soilmoisture([1-8])$/i;
const ECOWITT_PRESSURE_KEYS = new Set([
  "baromrelin",
  "baromabsin",
  "baromrelhpa",
  "baromabshpa",
]);

function ecowittFToC(f: number): number {
  return ((f - 32) * 5) / 9;
}

function readMac(payload: Record<string, unknown>): string | null {
  const macRaw =
    payload["MAC"] === undefined ? payload["mac"] : payload["MAC"];
  if (typeof macRaw === "string" && macRaw.trim().length > 0) {
    return macRaw.trim().toUpperCase();
  }
  return null;
}

/**
 * Normalize a raw EcoWitt cloud/custom-upload payload into per-tent
 * `NormalizedSensorReading` rows with explicit MAC+channel routing.
 *
 * Guarantees:
 *  - Unmapped channels are flagged, never dropped, never assigned a default.
 *  - Pressure channels, when present, are surfaced as `unmapped` with reason
 *    `unsupported_metric_for_ecowitt`.
 *  - No EC metric is produced for EcoWitt.
 *  - `source` is `live`, `stale`, or `invalid` — derived by
 *    `normalizeSensorReading` from captured_at + telemetry guards.
 */
export function normalizeEcowittCloudReadings(
  payload: unknown,
  mapping: EcowittCloudMappingConfig,
  options: NormalizeEcowittCloudOptions = {},
): EcowittCloudNormalizationResult {
  const now = options.now ?? new Date();
  const rows: EcowittCloudReadingRow[] = [];
  const unmapped: EcowittCloudUnmappedChannel[] = [];
  const warnings: string[] = [];

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { rows: [], unmapped: [], warnings: ["payload_not_object"], missing_metric_codes: [] };
  }
  const obj = payload as Record<string, unknown>;
  const lower: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) lower[k.toLowerCase()] = v;

  const mac = readMac(obj);
  const perMac = mac ? mapping.byMac[mac] : undefined;

  // captured_at from dateutc (UTC). Never falls back to now().
  const dateRaw = lower["dateutc"];
  let capturedAt: string | null = null;
  if (typeof dateRaw === "string" && dateRaw.trim().length > 0) {
    const s = dateRaw.trim();
    const iso = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(s)
      ? s.replace(" ", "T") + (s.endsWith("Z") ? "" : "Z")
      : s;
    const t = Date.parse(iso);
    if (Number.isFinite(t)) capturedAt = new Date(t).toISOString();
  }
  if (!capturedAt) warnings.push("captured_at_missing_or_unparseable");

  interface ChannelBucket {
    channel: number;
    tempF?: number;
    rhPct?: number;
    soilPct?: number;
  }
  const buckets = new Map<number, ChannelBucket>();
  const pressureKeys: string[] = [];

  for (const [k, v] of Object.entries(lower)) {
    if (ECOWITT_PRESSURE_KEYS.has(k)) {
      pressureKeys.push(k);
      continue;
    }
    const tMatch = ECOWITT_TEMP_F_RE.exec(k);
    const hMatch = ECOWITT_HUMIDITY_CH_RE.exec(k);
    const sMatch = ECOWITT_SOIL_CH_RE.exec(k);
    if (!tMatch && !hMatch && !sMatch) continue;
    const n =
      typeof v === "number" ? v : v === "" || v == null ? NaN : Number(v);
    if (!Number.isFinite(n)) continue;
    if (tMatch) {
      const ch = Number(tMatch[1]);
      const b = buckets.get(ch) ?? { channel: ch };
      b.tempF = n;
      buckets.set(ch, b);
    } else if (hMatch) {
      const ch = Number(hMatch[1]);
      const b = buckets.get(ch) ?? { channel: ch };
      b.rhPct = n;
      buckets.set(ch, b);
    } else if (sMatch) {
      const ch = Number(sMatch[1]);
      const b = buckets.get(ch) ?? { channel: ch };
      b.soilPct = n;
      buckets.set(ch, b);
    }
  }

  // Pressure: present but unsupported in canonical schema.
  for (const k of pressureKeys) {
    unmapped.push({
      raw_key: k,
      channel: null,
      metric: "pressure_hpa",
      value: typeof lower[k] === "number" ? (lower[k] as number) : null,
      reason: "unsupported_metric_for_ecowitt",
      note:
        "Pressure channel was received but Verdant has no pressure metric — value was not stored.",
    });
  }

  // ---- Per-bucket missing-metric detection (closed vocabulary) -------------
  // Codes are bound to bucket existence + mapping so silent / unmapped
  // channels do not generate noise. captured_at_missing is payload-level.
  const missingSet = new Set<EcowittMissingMetricCode>();
  if (!capturedAt) missingSet.add("captured_at_missing");
  for (const bucket of buckets.values()) {
    const airTent = perMac?.air?.[bucket.channel] ?? null;
    const soilTent = perMac?.soil?.[bucket.channel] ?? null;
    const hasAirData = bucket.tempF !== undefined || bucket.rhPct !== undefined;
    const hasAnyData = hasAirData || bucket.soilPct !== undefined;
    if (airTent && hasAirData) {
      if (bucket.tempF === undefined) missingSet.add("air_temperature_missing");
      if (bucket.rhPct === undefined) missingSet.add("air_humidity_missing");
    }
    if (soilTent && hasAnyData && bucket.soilPct === undefined) {
      missingSet.add("soil_moisture_missing");
    }
  }

  for (const bucket of buckets.values()) {

    const airTent = perMac?.air?.[bucket.channel] ?? null;
    const soilTent = perMac?.soil?.[bucket.channel] ?? null;

    if (bucket.tempF !== undefined || bucket.rhPct !== undefined) {
      const tempC = bucket.tempF !== undefined ? ecowittFToC(bucket.tempF) : null;
      const rh = bucket.rhPct ?? null;
      const suspicion = evaluateEcowittSuspicion({
        temperatureC: tempC,
        humidityPct: rh,
        rawTempF: bucket.tempF ?? null,
        recentHumidityPct:
          options.recentHumidityPctByChannel?.[bucket.channel],
      });
      const suspicionCodes = suspicion.flags.map((f) => f.code);
      const confidence = suspicion.hasInvalid
        ? 0.0
        : suspicion.worst === "suspicious"
          ? 0.3
          : 0.5;

      const emit = (
        metric: "temperature_c" | "humidity_pct",
        value: number,
      ) => {
        const rawKey =
          metric === "temperature_c"
            ? `temp${bucket.channel}f`
            : `humidity${bucket.channel}`;
        if (!airTent) {
          unmapped.push({
            raw_key: rawKey,
            channel: bucket.channel,
            metric,
            value,
            reason: "no_tent_mapping_for_channel",
            note: `Channel ${bucket.channel} has no tent mapping for air metrics — reading was not assigned to any tent.`,
          });
          return;
        }
        const stuckRh = suspicionCodes.includes("humidity_stuck_extreme");
        const declared =
          suspicion.hasInvalid || stuckRh || !capturedAt ? "invalid" : "live";

        const reading = normalizeSensorReading(
          {
            captured_at: capturedAt ?? new Date(0).toISOString(),
            source: declared,
            temperature_c: metric === "temperature_c" ? value : null,
            humidity_pct: metric === "humidity_pct" ? value : null,
            raw_payload: {
              vendor: "ecowitt",
              mac,
              channel: bucket.channel,
              raw_key: rawKey,
              suspicion: suspicionCodes,
            },
          },
          now.getTime(),
          options.staleThresholdMs,
        );
        rows.push({
          tent_id: airTent,
          plant_id: null,
          device_mac: mac ?? "",
          channel: bucket.channel,
          reading,
          confidence: stuckRh ? 0.0 : confidence,
          suspicion_codes: suspicionCodes,
        });
      };

      if (tempC !== null) emit("temperature_c", tempC);
      if (rh !== null) emit("humidity_pct", rh);
    }

    if (bucket.soilPct !== undefined) {
      const soilSuspicion = evaluateEcowittSuspicion({
        soilMoisturePct: bucket.soilPct,
        recentSoilMoisturePct:
          options.recentSoilMoisturePctByChannel?.[bucket.channel],
      });
      const soilCodes = soilSuspicion.flags.map((f) => f.code);
      const soilConfidence = soilSuspicion.hasInvalid
        ? 0.0
        : soilSuspicion.worst === "suspicious"
          ? 0.3
          : 0.5;
      const rawKey = `soilmoisture${bucket.channel}`;
      if (!soilTent) {
        unmapped.push({
          raw_key: rawKey,
          channel: bucket.channel,
          metric: "soil_moisture_pct",
          value: bucket.soilPct,
          reason: "no_tent_mapping_for_channel",
          note: `Channel ${bucket.channel} has no tent mapping for soil moisture — reading was not assigned to any tent.`,
        });
      } else {
        // Stuck-at-extreme is "suspicious" in the suspicion rules, but the
        // task contract requires soil moisture stuck at 0 or 100 to be
        // surfaced as `invalid`. Force-invalid when the stuck-extreme flag
        // fires for soil moisture.
        const stuckSoil = soilCodes.includes("soil_moisture_stuck_extreme");
        const declared =
          soilSuspicion.hasInvalid || stuckSoil || !capturedAt
            ? "invalid"
            : "live";
        const reading = normalizeSensorReading(
          {
            captured_at: capturedAt ?? new Date(0).toISOString(),
            source: declared,
            soil_moisture_pct: bucket.soilPct,
            raw_payload: {
              vendor: "ecowitt",
              mac,
              channel: bucket.channel,
              raw_key: rawKey,
              suspicion: soilCodes,
            },
          },
          now.getTime(),
          options.staleThresholdMs,
        );
        rows.push({
          tent_id: soilTent,
          plant_id: null,
          device_mac: mac ?? "",
          channel: bucket.channel,
          reading,
          confidence: stuckSoil ? 0.0 : soilConfidence,
          suspicion_codes: soilCodes,
        });
      }
    }
  }

  rows.sort(
    (a, b) =>
      a.tent_id.localeCompare(b.tent_id) ||
      a.channel - b.channel ||
      a.reading.captured_at.localeCompare(b.reading.captured_at),
  );

  return { rows, unmapped, warnings };
}


