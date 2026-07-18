/**
 * Pure sensor-evidence gate for onboarding activation.
 *
 * The onboarding checklist only needs a count, but the raw provenance must
 * remain available until diagnostic packets are classified. No raw payload,
 * reading value, device detail, or grow detail leaves this helper.
 */
import {
  isCanonicalSensorSource,
  type CanonicalSensorSource,
} from "@/constants/sensorIngestProvenance";
import { isDiagnosticSensorProvenanceRow } from "@/lib/sensorProvenanceFenceRules";

export interface OnboardingSensorActivationRow {
  source?: unknown;
  raw_payload?: unknown;
}

const ACTIVATING_SOURCES: ReadonlySet<CanonicalSensorSource> = new Set(["live", "manual", "csv"]);

/**
 * Count only source-labeled, non-diagnostic sensor evidence.
 *
 * Demo, stale, invalid, missing, and unknown sources fail closed. A physical
 * EcoWitt gateway row using the historical Windows listener vendor remains
 * eligible through the shared provenance fence's physical-proof exception.
 */
export function countActivatingSensorReadings(
  rows: readonly OnboardingSensorActivationRow[] | null | undefined,
): number {
  if (!Array.isArray(rows)) return 0;

  let count = 0;
  for (const row of rows) {
    const normalizedSource =
      typeof row.source === "string" ? row.source.trim().toLowerCase() : null;
    if (
      isDiagnosticSensorProvenanceRow({
        source: normalizedSource,
        raw_payload: row.raw_payload,
      })
    ) {
      continue;
    }
    if (isCanonicalSensorSource(normalizedSource) && ACTIVATING_SOURCES.has(normalizedSource)) {
      count += 1;
    }
  }
  return count;
}
