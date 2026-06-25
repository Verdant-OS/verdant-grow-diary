// Pure, read-only normalizer that converts a raw EcoWitt MQTT payload into a
// canonical Verdant Flower Tent sensor snapshot.
//
// Safety:
// - No Supabase writes.
// - No Edge Function calls.
// - No automation / device control.
// - Missing / stale / invalid telemetry is degraded, NEVER reported as healthy.
// - Seedling / Vegetation channels are intentionally not consumed here.

export const FLOWER_TENT_LABEL = "Flower Tent" as const;
export const ECOWITT_PROVIDER = "ecowitt" as const;

/** Canonical EcoWitt channel map for the Flower Tent. */
export const FLOWER_TENT_CHANNEL_MAP = {
  air_temp_f: "temp1f",
  humidity_pct: "humidity1",
  soil_temp_f: "tf_ch1",
  soil_moisture_pct_primary: "soilmoisture3",
  soil_moisture_pct_secondary: "soilmoisture2",
} as const;

export type FlowerTentChannelMap = typeof FLOWER_TENT_CHANNEL_MAP;
export type FlowerTentMetricKey = keyof FlowerTentChannelMap;

/** Channels that must NOT be mixed into the Flower Tent snapshot. */
export const NON_FLOWER_TENT_CHANNELS: readonly string[] = [
  // Seedling Tent
  "tempinf",
  "humidityin",
  "tf_ch2",
  "soilmoisture1",
  // Vegetation Tent
  "temp2f",
  "humidity2",
  "tf_ch3",
  "soilmoisture4",
];

export type FlowerTentSnapshotSource = "live" | "degraded" | "invalid";

export interface FlowerTentMetrics {
  air_temp_f: number | null;
  humidity_pct: number | null;
  soil_temp_f: number | null;
  soil_moisture_pct_primary: number | null;
  soil_moisture_pct_secondary: number | null;
}

export interface FlowerTentSnapshot {
  source: FlowerTentSnapshotSource;
  provider: typeof ECOWITT_PROVIDER;
  tent_label: typeof FLOWER_TENT_LABEL;
  metrics: FlowerTentMetrics;
  channel_map: FlowerTentChannelMap;
  raw_payload_preserved: true;
  raw_payload: Readonly<Record<string, unknown>>;
  /** Reasons the snapshot was degraded or invalid. Empty when source === "live". */
  degraded_reasons: readonly string[];
  /** Confidence for the root-zone (soil) block. */
  root_zone_confidence: "ok" | "partial" | "missing";
}

export interface NormalizeOptions {
  /** Now timestamp, injectable for deterministic tests. */
  now?: Date;
  /** Captured-at timestamp from the payload (ms epoch) if known. */
  captured_at_ms?: number | null;
  /** Max age in ms before payload is considered stale. Default 10 minutes. */
  max_age_ms?: number;
}

const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000;

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}

function inRange(n: number | null, min: number, max: number): number | null {
  if (n === null) return null;
  return n >= min && n <= max ? n : null;
}

/**
 * Normalize a raw EcoWitt MQTT payload to a Flower Tent snapshot.
 * Pure function. Deterministic given the same payload + options.
 */
export function normalizeEcowittFlowerTentPayload(
  rawPayload: Readonly<Record<string, unknown>> | null | undefined,
  options: NormalizeOptions = {},
): FlowerTentSnapshot {
  const payload: Readonly<Record<string, unknown>> = rawPayload ?? {};
  const degraded: string[] = [];

  // Raw numeric reads from canonical Flower Tent channels only.
  const airRaw = toNumber(payload[FLOWER_TENT_CHANNEL_MAP.air_temp_f]);
  const humRaw = toNumber(payload[FLOWER_TENT_CHANNEL_MAP.humidity_pct]);
  const soilTempRaw = toNumber(payload[FLOWER_TENT_CHANNEL_MAP.soil_temp_f]);
  const sm1Raw = toNumber(payload[FLOWER_TENT_CHANNEL_MAP.soil_moisture_pct_primary]);
  const sm2Raw = toNumber(payload[FLOWER_TENT_CHANNEL_MAP.soil_moisture_pct_secondary]);

  // Validate plausible ranges. Out-of-range values are dropped, not coerced.
  const air = inRange(airRaw, -40, 200);
  const hum = inRange(humRaw, 0, 100);
  const soilTemp = inRange(soilTempRaw, -40, 200);
  const sm1 = inRange(sm1Raw, 0, 100);
  const sm2 = inRange(sm2Raw, 0, 100);

  if (airRaw === null) degraded.push("missing:air_temp_f");
  if (humRaw === null) degraded.push("missing:humidity_pct");
  if (airRaw !== null && air === null) degraded.push("invalid:air_temp_f");
  if (humRaw !== null && hum === null) degraded.push("invalid:humidity_pct");
  if (soilTempRaw !== null && soilTemp === null) degraded.push("invalid:soil_temp_f");
  if (sm1Raw !== null && sm1 === null) degraded.push("invalid:soil_moisture_pct_primary");
  if (sm2Raw !== null && sm2 === null) degraded.push("invalid:soil_moisture_pct_secondary");

  // Freshness.
  const capturedAt = options.captured_at_ms ?? null;
  const nowMs = (options.now ?? new Date()).getTime();
  const maxAge = options.max_age_ms ?? DEFAULT_MAX_AGE_MS;
  if (capturedAt !== null && Number.isFinite(capturedAt)) {
    if (nowMs - capturedAt > maxAge) degraded.push("stale:captured_at");
  }

  // Root-zone confidence is independent of air/RH gating.
  const soilPresent = [soilTemp, sm1, sm2].filter((v) => v !== null).length;
  const root_zone_confidence: FlowerTentSnapshot["root_zone_confidence"] =
    soilPresent === 3 ? "ok" : soilPresent === 0 ? "missing" : "partial";

  // Source classification: live only when required mapped fields are valid AND fresh.
  const requiredOk = air !== null && hum !== null;
  let source: FlowerTentSnapshotSource;
  if (!requiredOk) {
    source = degraded.some((r) => r.startsWith("invalid:")) ? "invalid" : "degraded";
  } else if (degraded.length > 0) {
    source = "degraded";
  } else {
    source = "live";
  }

  return {
    source,
    provider: ECOWITT_PROVIDER,
    tent_label: FLOWER_TENT_LABEL,
    metrics: {
      air_temp_f: air,
      humidity_pct: hum,
      soil_temp_f: soilTemp,
      soil_moisture_pct_primary: sm1,
      soil_moisture_pct_secondary: sm2,
    },
    channel_map: FLOWER_TENT_CHANNEL_MAP,
    raw_payload_preserved: true,
    raw_payload: payload,
    degraded_reasons: Object.freeze([...degraded]),
    root_zone_confidence,
  };
}
