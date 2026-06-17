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
  invalid:
    "Missing, malformed, unknown, or suspicious telemetry. Do not treat as healthy.",
};
