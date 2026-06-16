// Pure EcoWitt tent normalizer router.
//
// Selects the right per-tent normalizer and adapts every result to the
// shared CanonicalEcowittTentSnapshot shape. Read-only.
//
// SAFETY: this file MUST NOT import Supabase clients, Edge Function helpers,
// alert helpers, AI helpers, Action Queue helpers, or device-control helpers.

import {
  CanonicalEcowittTentSnapshot,
  ECOWITT_PROVIDER,
  EcowittNormalizeOptions,
} from "./ecowittTentSnapshot";
import {
  FLOWER_TENT_CHANNEL_MAP,
  FLOWER_TENT_LABEL,
  normalizeEcowittFlowerTentPayload,
} from "./ecowittFlowerTentNormalizer";
import { normalizeEcowittSeedlingTentPayload } from "./ecowittSeedlingTentNormalizer";
import { normalizeEcowittVegetationTentPayload } from "./ecowittVegetationTentNormalizer";

export type EcowittTentKey = "flower" | "seedling" | "vegetation";

export const SUPPORTED_TENT_KEYS: readonly EcowittTentKey[] = [
  "flower",
  "seedling",
  "vegetation",
];

function flowerRootZoneToCanonical(
  v: "ok" | "partial" | "missing",
): "complete" | "partial" | "missing" {
  return v === "ok" ? "complete" : v;
}

/**
 * Normalize a raw EcoWitt payload for the given tent key.
 * Unknown keys return a safe "invalid" snapshot instead of throwing.
 */
export function normalizeEcowittTentPayload(
  rawPayload: Readonly<Record<string, unknown>> | null | undefined,
  tentKey: string,
  options: EcowittNormalizeOptions = {},
): CanonicalEcowittTentSnapshot {
  const payload: Readonly<Record<string, unknown>> = rawPayload ?? {};
  const capturedAt = options.captured_at_ms ?? null;
  const captured_at_iso =
    capturedAt !== null && Number.isFinite(capturedAt)
      ? new Date(capturedAt).toISOString()
      : null;

  switch (tentKey as EcowittTentKey) {
    case "seedling":
      return normalizeEcowittSeedlingTentPayload(payload, options);
    case "vegetation":
      return normalizeEcowittVegetationTentPayload(payload, options);
    case "flower": {
      const f = normalizeEcowittFlowerTentPayload(payload, options);
      // Adapt the older Flower snapshot shape to the canonical shape.
      const degraded = [...f.degraded_reasons].filter(
        (r) => !r.startsWith("invalid:"),
      );
      const invalid = [...f.degraded_reasons].filter((r) =>
        r.startsWith("invalid:"),
      );
      return {
        source: f.source,
        provider: ECOWITT_PROVIDER,
        tent_label: FLOWER_TENT_LABEL,
        captured_at: captured_at_iso,
        metrics: f.metrics,
        channel_map: FLOWER_TENT_CHANNEL_MAP,
        root_zone_confidence: flowerRootZoneToCanonical(f.root_zone_confidence),
        degraded_reasons: Object.freeze(degraded),
        invalid_reasons: Object.freeze(invalid),
        raw_payload: f.raw_payload,
        raw_payload_preserved: true,
      };
    }
    default: {
      return {
        source: "invalid",
        provider: ECOWITT_PROVIDER,
        tent_label: `Unknown Tent (${tentKey})`,
        captured_at: captured_at_iso,
        metrics: {
          air_temp_f: null,
          humidity_pct: null,
          soil_temp_f: null,
          soil_moisture_pct_primary: null,
          soil_moisture_pct_secondary: null,
        },
        channel_map: {},
        root_zone_confidence: "missing",
        degraded_reasons: Object.freeze([]),
        invalid_reasons: Object.freeze([`unknown_tent_key:${tentKey}`]),
        raw_payload: payload,
        raw_payload_preserved: true,
      };
    }
  }
}
