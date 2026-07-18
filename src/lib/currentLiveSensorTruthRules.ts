/**
 * The single promotion rule for a current Live sensor claim.
 *
 * Provenance, validation, and age are independent axes. A caller may retain
 * the raw values for an explicitly labeled diagnostic view, but it may only
 * render or forward them as current Live telemetry when all three factors
 * pass. This module deliberately reuses the canonical source vocabulary and
 * does not create a second source enum.
 *
 * Pure. No I/O, React, Supabase, timers, or device-control behavior.
 */
import {
  assertCanonicalSensorSource,
  type CanonicalSensorSource,
} from "../constants/sensorIngestProvenance";

export interface CurrentLiveSensorTruthInput {
  source?: unknown;
  quality?: unknown;
  freshness?: unknown;
}

export interface CurrentLiveSensorTruthResult {
  canonicalSource: CanonicalSensorSource | null;
  normalizedQuality: string | null;
  sourceIsLive: boolean;
  qualityIsOk: boolean;
  freshnessIsFresh: boolean;
  isCurrentLive: boolean;
}

export function evaluateCurrentLiveSensorTruth(
  input: CurrentLiveSensorTruthInput,
): CurrentLiveSensorTruthResult {
  // Canonical source and quality values are intentionally exact. Whitespace,
  // aliases, vendor names, and casing variants are untrusted input, not a
  // reason to promote telemetry.
  const canonicalSource = assertCanonicalSensorSource(input.source);
  const normalizedQuality =
    typeof input.quality === "string" ? input.quality.trim().toLowerCase() || null : null;
  const sourceIsLive = canonicalSource === "live";
  const qualityIsOk = input.quality === "ok";
  const freshnessIsFresh = input.freshness === "fresh";

  return {
    canonicalSource,
    normalizedQuality,
    sourceIsLive,
    qualityIsOk,
    freshnessIsFresh,
    isCurrentLive: sourceIsLive && qualityIsOk && freshnessIsFresh,
  };
}
