/**
 * Compact sensor source legend view model.
 *
 * Pure presentation data so the Sensor Data page can render a calm,
 * non-alarming legend that clarifies what each source label means.
 *
 * No React. No I/O. No side effects.
 */

export type SensorLegendKind =
  | "live"
  | "manual"
  | "csv"
  | "demo"
  | "derived"
  | "stale"
  | "invalid"
  | "not_connected";

export interface SensorLegendEntry {
  kind: SensorLegendKind;
  label: string;
  description: string;
  tone: "calm" | "caution";
}

export const SENSOR_SOURCE_LEGEND: readonly SensorLegendEntry[] = [
  {
    kind: "live",
    label: "Live",
    description: "connected sensor reading",
    tone: "calm",
  },
  {
    kind: "manual",
    label: "Manual",
    description: "entered by grower",
    tone: "calm",
  },
  {
    kind: "csv",
    label: "CSV",
    description: "imported reading",
    tone: "calm",
  },
  {
    kind: "demo",
    label: "Demo",
    description: "sample data",
    tone: "calm",
  },
  {
    kind: "derived",
    label: "Derived",
    description: "calculated from other readings",
    tone: "calm",
  },
  {
    kind: "stale",
    label: "Stale",
    description: "old reading",
    tone: "caution",
  },
  {
    kind: "invalid",
    label: "Invalid",
    description: "suspicious or impossible reading",
    tone: "caution",
  },
  {
    kind: "not_connected",
    label: "Not connected",
    description: "optional source not set up",
    tone: "calm",
  },
] as const;

export function getSensorSourceLegend(): readonly SensorLegendEntry[] {
  return SENSOR_SOURCE_LEGEND;
}
