/**
 * sensorSourceDisplayLabel — pure helper that builds the user-facing
 * source badge text for a sensor snapshot/reading.
 *
 * Behavior:
 *   - source === "csv" + known vendor   → "CSV history · Spider Farmer"
 *   - source === "csv" + multiple CSV vendors → "CSV history · Multiple sources"
 *   - source === "csv" + unknown vendor → "CSV history"
 *   - any other source                  → SOURCE_LABEL[source]
 *
 * Hard constraints:
 *   - Pure. No I/O, no React, no automation, no device control.
 *   - Vendor lineage NEVER promotes a reading to "live" — vendor suffix
 *     is only ever appended to "CSV history".
 *   - Stale indicators are the caller's responsibility; this helper
 *     never replaces a stale warning.
 *   - Never returns or references raw_payload internals.
 */
import { SOURCE_LABEL, type SnapshotSource } from "@/lib/sensorSnapshot";
import {
  getCsvVendorLineage,
  type CsvSourceApp,
} from "@/lib/sensorReadingVendorLineage";

export type CsvVendorSummary = CsvSourceApp | "multiple" | null;

export interface SensorSourceDisplayInput {
  source: SnapshotSource | string | null | undefined;
  csvVendor?: CsvVendorSummary;
}

const VENDOR_DISPLAY: Record<CsvSourceApp, string> = {
  ac_infinity: "AC Infinity",
  spider_farmer: "Spider Farmer",
  vivosun: "Vivosun",
};

export function buildSensorSourceDisplayLabel(
  input: SensorSourceDisplayInput,
): string {
  const source = input.source;
  if (source === "csv") {
    if (input.csvVendor === "multiple") {
      return "CSV history · Multiple sources";
    }
    if (input.csvVendor && input.csvVendor in VENDOR_DISPLAY) {
      return `CSV history · ${VENDOR_DISPLAY[input.csvVendor as CsvSourceApp]}`;
    }
    return SOURCE_LABEL.csv;
  }
  if (source && source in SOURCE_LABEL) {
    return SOURCE_LABEL[source as SnapshotSource];
  }
  return "Unknown";
}

/**
 * Summarise CSV vendor lineage across a batch of rows. Used by snapshot
 * builders to collapse multi-vendor CSV imports into a single,
 * conservative display hint.
 */
export function summarizeCsvVendor(
  rows: ReadonlyArray<{ source?: string | null; raw_payload?: unknown }>,
): CsvVendorSummary {
  const seen = new Set<CsvSourceApp>();
  for (const row of rows) {
    if (row.source !== "csv") continue;
    const lineage = getCsvVendorLineage(row);
    if (lineage) seen.add(lineage.sourceApp);
  }
  if (seen.size === 0) return null;
  if (seen.size === 1) return [...seen][0];
  return "multiple";
}
