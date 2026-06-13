/**
 * sensorReadingVendorLineage — pure helper that extracts CSV vendor
 * lineage from a sensor_readings row's `raw_payload`.
 *
 * Used by display surfaces that need to label imported CSV rows with
 * their vendor (Spider Farmer / Vivosun / AC Infinity) without
 * exposing the full raw_payload to users.
 *
 * Hard constraints:
 *  - Pure. No I/O, no React, no automation, no device control.
 *  - Vendor labels are presentation-only. They NEVER promote a CSV row
 *    to "live" or any other source.
 *  - Unknown / missing vendor → null (caller falls back to canonical
 *    source label).
 *  - Does not return any other raw_payload fields (privacy).
 */

export type CsvSourceApp =
  | "ac_infinity"
  | "spider_farmer"
  | "vivosun";

const VENDOR_DISPLAY: Record<CsvSourceApp, string> = {
  ac_infinity: "AC Infinity",
  spider_farmer: "Spider Farmer",
  vivosun: "Vivosun",
};

export interface VendorLineage {
  sourceApp: CsvSourceApp;
  vendorLabel: string;
  /** Combined CSV-history badge text. */
  badgeLabel: string;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function normalizeSourceApp(v: unknown): CsvSourceApp | null {
  if (typeof v !== "string") return null;
  const k = v.trim().toLowerCase();
  if (k === "ac_infinity" || k === "spider_farmer" || k === "vivosun") {
    return k;
  }
  return null;
}

/**
 * Extract vendor lineage from a sensor row. Returns null when the row
 * is not a CSV import or the vendor cannot be identified.
 *
 * A row qualifies as a CSV import when EITHER:
 *  - `source === "csv"`, OR
 *  - `raw_payload.csv_import === true`
 * AND `raw_payload.source_app` resolves to a known vendor.
 */
export function getCsvVendorLineage(row: {
  source?: string | null;
  raw_payload?: unknown;
}): VendorLineage | null {
  const payload = asRecord(row.raw_payload);
  const isCsvBySource = row.source === "csv";
  const isCsvByFlag = payload?.csv_import === true;
  if (!isCsvBySource && !isCsvByFlag) return null;
  const sourceApp = normalizeSourceApp(payload?.source_app);
  if (!sourceApp) return null;
  const vendorLabel = VENDOR_DISPLAY[sourceApp];
  return {
    sourceApp,
    vendorLabel,
    badgeLabel: `CSV history · ${vendorLabel}`,
  };
}

/** Convenience: just the vendor display label, or null. */
export function getCsvVendorLabel(row: {
  source?: string | null;
  raw_payload?: unknown;
}): string | null {
  return getCsvVendorLineage(row)?.vendorLabel ?? null;
}
