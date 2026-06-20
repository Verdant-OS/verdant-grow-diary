// Pure, read-only EcoWitt → Vegetation Tent normalizer.
//
// Safety: no Supabase writes, no Edge calls, no automation, no device control.
// Missing / stale / invalid telemetry is degraded — never reported as live.

import {
  CanonicalEcowittTentSnapshot,
  DEFAULT_MAX_AGE_MS,
  ECOWITT_PROVIDER,
  EcowittNormalizeOptions,
  EcowittSnapshotSource,
  inRangeOrNull,
  RootZoneConfidence,
  toNumberOrNull,
} from "./ecowittTentSnapshot";

export const VEGETATION_TENT_LABEL = "Vegetation Tent" as const;

export const VEGETATION_TENT_CHANNEL_MAP = {
  air_temp_f: "temp3f",
  humidity_pct: "humidity3",
  soil_moisture_pct_primary: "soilmoisture1",
} as const;

export type VegetationTentChannelMap = typeof VEGETATION_TENT_CHANNEL_MAP;

export function normalizeEcowittVegetationTentPayload(
  rawPayload: Readonly<Record<string, unknown>> | null | undefined,
  options: EcowittNormalizeOptions = {},
): CanonicalEcowittTentSnapshot {
  const payload: Readonly<Record<string, unknown>> = rawPayload ?? {};
  const degraded: string[] = [];
  const invalid: string[] = [];

  const airRaw = toNumberOrNull(payload[VEGETATION_TENT_CHANNEL_MAP.air_temp_f]);
  const humRaw = toNumberOrNull(payload[VEGETATION_TENT_CHANNEL_MAP.humidity_pct]);
  const sm1Raw = toNumberOrNull(
    payload[VEGETATION_TENT_CHANNEL_MAP.soil_moisture_pct_primary],
  );

  const air = inRangeOrNull(airRaw, -40, 200);
  const hum = inRangeOrNull(humRaw, 0, 100);
  const sm1 = inRangeOrNull(sm1Raw, 0, 100);

  if (airRaw === null) degraded.push("missing:air_temp_f");
  if (humRaw === null) degraded.push("missing:humidity_pct");
  if (airRaw !== null && air === null) invalid.push("invalid:air_temp_f");
  if (humRaw !== null && hum === null) invalid.push("invalid:humidity_pct");
  if (sm1Raw !== null && sm1 === null) {
    invalid.push("invalid:soil_moisture_pct_primary");
    degraded.push("root_zone:invalid_soil_moisture");
  }

  const capturedAt = options.captured_at_ms ?? null;
  const nowMs = (options.now ?? new Date()).getTime();
  const maxAge = options.max_age_ms ?? DEFAULT_MAX_AGE_MS;
  if (capturedAt !== null && Number.isFinite(capturedAt)) {
    if (nowMs - capturedAt > maxAge) degraded.push("stale:captured_at");
  }

  // No root-zone temperature mapped for Veg in this slice.
  const root_zone_confidence: RootZoneConfidence = sm1 !== null ? "partial" : "missing";

  const requiredOk = air !== null && hum !== null;
  let source: EcowittSnapshotSource;
  if (invalid.length > 0 && !requiredOk) source = "invalid";
  else if (invalid.some((r) => r.endsWith(":air_temp_f") || r.endsWith(":humidity_pct")))
    source = "invalid";
  else if (!requiredOk || degraded.length > 0) source = "degraded";
  else source = "live";

  const captured_at_iso =
    capturedAt !== null && Number.isFinite(capturedAt)
      ? new Date(capturedAt).toISOString()
      : null;

  return {
    source,
    provider: ECOWITT_PROVIDER,
    tent_label: VEGETATION_TENT_LABEL,
    captured_at: captured_at_iso,
    metrics: {
      air_temp_f: air,
      humidity_pct: hum,
      soil_temp_f: null,
      soil_moisture_pct_primary: sm1,
      soil_moisture_pct_secondary: null,
    },
    channel_map: VEGETATION_TENT_CHANNEL_MAP,
    root_zone_confidence,
    degraded_reasons: Object.freeze([...degraded]),
    invalid_reasons: Object.freeze([...invalid]),
    raw_payload: payload,
    raw_payload_preserved: true,
  };
}
