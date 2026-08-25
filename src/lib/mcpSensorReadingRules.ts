/**
 * mcpSensorReadingRules — publication-boundary helpers for MCP sensor rows.
 *
 * Pure. No I/O. No React. Deterministic.
 *
 * Closes the #885 / agent-integrations gaps at the MCP read path:
 *   - constitution `source` is already normalized via `normalizeSensorSource`
 *   - `confidence` is derived (never a DB column)
 *
 * Transport/vendor tokens are never confidence inputs — only the six
 * allowed Sensor Truth sources plus response-time freshness/quality.
 */

import type { SensorSource } from "./sensor/sensorSourceRules";

/** Confidence scale used by MCP readings: closed interval [0, 1]. */
export type McpSensorConfidence = number;

export interface McpSensorConfidenceInput {
  /** Constitution source only (live|manual|csv|demo|stale|invalid). */
  source: SensorSource;
  /** Response-time freshness already derived for the reading. */
  freshness: "fresh" | "stale" | "invalid";
  /** Stored quality label (ok/degraded/stale/invalid/…). */
  quality: string;
  /**
   * True when the metric value is finite and inside the MCP plausibility
   * gate (temp/RH/soil/etc.). Invalid numbers never inherit high confidence.
   */
  plausible: boolean;
}

const CONFIDENCE = {
  none: 0,
  low: 0.35,
  medium: 0.55,
  high: 0.9,
} as const;

function normalizedQuality(quality: unknown): string {
  return typeof quality === "string" ? quality.trim().toLowerCase() : "invalid";
}

/**
 * Derive MCP `confidence` from constitution source + freshness + quality.
 *
 * Mapping (product 0–1 scale, aligned with existing Grow Walk bands):
 *   invalid / implausible / quality invalid → 0
 *   stale or demo (or aged live)            → low (0.35)
 *   manual or csv                           → medium (0.55)
 *   live + fresh + ok + plausible           → high (0.9)
 *
 * Freshness alone never promotes an unrecognized/vendor token — callers
 * must pass a constitution source from `normalizeSensorSource` first.
 */
export function deriveMcpSensorReadingConfidence(
  input: McpSensorConfidenceInput,
): McpSensorConfidence {
  const quality = normalizedQuality(input.quality);
  if (
    input.source === "invalid" ||
    input.freshness === "invalid" ||
    quality === "invalid" ||
    !input.plausible
  ) {
    return CONFIDENCE.none;
  }

  if (input.source === "stale" || input.source === "demo" || input.freshness === "stale") {
    return CONFIDENCE.low;
  }

  if (input.source === "manual" || input.source === "csv") {
    return CONFIDENCE.medium;
  }

  if (
    input.source === "live" &&
    input.freshness === "fresh" &&
    quality === "ok"
  ) {
    return CONFIDENCE.high;
  }

  // Degraded live / unexpected combinations stay low, never healthy-high.
  return CONFIDENCE.low;
}
