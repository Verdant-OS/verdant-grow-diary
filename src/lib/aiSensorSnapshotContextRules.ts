/**
 * aiSensorSnapshotContextRules — shared, source-aware annotator used by
 * BOTH the ai-coach context builder and the ai-doctor-review request
 * packet builder. It wraps the pure annotator at
 * `supabase/functions/ai-coach/sensorSnapshotContext.ts` (which both
 * paths already import) and re-shapes the result into the
 * `AiSensorSnapshotContext` contract requested for the shared rules
 * layer:
 *
 *   - annotationLine          — single-line model-safe annotation
 *   - valuesForModel          — numeric readings only when trusted
 *   - safetyNotes             — must-show cautions
 *   - missingInformationHints — what the model should ask for
 *   - sourceLabel             — verbatim normalized source
 *   - trustLevel              — low | medium | high
 *   - stale                   — freshness verdict
 *   - isTrustedForAi          — true only when values may be relied on
 *
 * Hard constraints (mirrors the underlying annotator):
 *  - Pure. No I/O, no Supabase, no Deno, no model calls.
 *  - Never re-labels manual/csv as live.
 *  - Never forwards demo / invalid / unknown reading values.
 *  - Never emits device-control language or secrets.
 *  - Deterministic for the same (snapshot, options.now).
 */

import {
  buildAiCoachSensorSnapshotContext,
  type AiCoachSensorSnapshotContext,
  type AiCoachSnapshotSource,
  type AiCoachSnapshotTrust,
  type BuildAiCoachSensorSnapshotContextOptions,
} from "./aiCoachSensorSnapshotContext";

export type AiSensorSnapshotSource = AiCoachSnapshotSource;
export type AiSensorSnapshotTrust = AiCoachSnapshotTrust;
export type BuildAiSensorSnapshotContextOptions =
  BuildAiCoachSensorSnapshotContextOptions;

export interface AiSensorSnapshotContext {
  annotationLine: string;
  valuesForModel: Record<string, number> | null;
  safetyNotes: string[];
  missingInformationHints: string[];
  sourceLabel: AiSensorSnapshotSource;
  trustLevel: AiSensorSnapshotTrust;
  stale: boolean;
  isTrustedForAi: boolean;
}

const READING_KEYS = [
  "temperature_c",
  "temperature_f",
  "humidity",
  "vpd",
  "vpd_kpa",
  "co2",
  "co2_ppm",
  "ppfd",
  "soil_moisture",
  "soil_water_content",
  "soil_ec",
  "soil_temp_c",
  "soil_temp_f",
  "ph",
  "temp_c",
  "temp_f",
] as const;

function extractNumericReadings(
  snapshot: unknown,
): Record<string, number> | null {
  if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return null;
  }
  const obj = snapshot as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const key of READING_KEYS) {
    const v = obj[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      out[key] = v;
    }
  }
  return Object.keys(out).length ? out : null;
}

export function buildAiSensorSnapshotContext(
  snapshot: unknown,
  options: BuildAiSensorSnapshotContextOptions = {},
): AiSensorSnapshotContext {
  const base: AiCoachSensorSnapshotContext =
    buildAiCoachSensorSnapshotContext(snapshot, options);

  const valuesForModel = base.includesValues
    ? extractNumericReadings(snapshot)
    : null;

  // Trusted-for-AI: medium+ trust AND values were included AND not stale.
  const isTrustedForAi =
    base.includesValues &&
    !base.stale &&
    (base.trust === "medium" || base.trust === "high") &&
    (base.source === "live" || base.source === "manual" || base.source === "csv");

  return {
    annotationLine: base.line,
    valuesForModel,
    safetyNotes: [...base.safetyNotes],
    missingInformationHints: [...base.missingInformationHints],
    sourceLabel: base.source,
    trustLevel: base.trust,
    stale: base.stale,
    isTrustedForAi,
  };
}
