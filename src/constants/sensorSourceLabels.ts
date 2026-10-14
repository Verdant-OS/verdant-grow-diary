/**
 * Centralized labels and human descriptions for the canonical Verdant
 * sensor sources. Pure constants. No I/O. No React.
 *
 * Used by:
 *   - SensorSourceSummaryWidget
 *   - SensorSourceLegendTooltip
 *   - Timeline source filter labels
 */
import type { TimelineSensorSourceKind } from "@/lib/timelineSensorSourceBadgeRules";

export const SENSOR_SOURCE_KINDS: readonly TimelineSensorSourceKind[] = [
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
];

/**
 * Timeline filter chips shown to the grower. `demo` stays in the canonical
 * kind list, and is omitted from the chips unless demo rows are loaded, the
 * caller is in demo mode, or demo is already selected (so a stuck filter
 * stays reachable).
 */
export function timelineSensorSourceFilterKinds(input: {
  demoDataPresent: boolean;
  demoMode?: boolean;
  selected?: readonly string[] | null;
}): readonly TimelineSensorSourceKind[] {
  const selectedDemo = Array.isArray(input.selected) && input.selected.includes("demo");
  if (input.demoMode === true || input.demoDataPresent === true || selectedDemo) {
    return SENSOR_SOURCE_KINDS;
  }
  return SENSOR_SOURCE_KINDS.filter((kind) => kind !== "demo");
}

export const SENSOR_SOURCE_SHORT_LABEL: Record<TimelineSensorSourceKind, string> = {
  live: "Live",
  manual: "Manual",
  csv: "CSV",
  demo: "Demo",
  stale: "Stale",
  invalid: "Invalid",
};

export const SENSOR_SOURCE_LEGEND: Record<TimelineSensorSourceKind, string> = {
  live: "Connected sensor ingest received from an active source.",
  manual: "Grower-entered reading or snapshot.",
  csv: "Explicitly labeled historical CSV context. Not live data.",
  demo: "Sample/demo data shown only in demo mode.",
  stale: "Previously valid reading that is too old to treat as current.",
  invalid: "Missing, malformed, unknown, or suspicious telemetry. Do not treat as healthy.",
};
