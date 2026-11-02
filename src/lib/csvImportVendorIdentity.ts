/**
 * Presentation-only vendor identity for historical CSV imports.
 * The stored sensor source stays "csv".
 */
import { getCsvVendorLineage, type CsvSourceApp } from "@/lib/sensorReadingVendorLineage";

const VENDOR_LABEL: Record<CsvSourceApp, string> = {
  ac_infinity: "AC Infinity",
  spider_farmer: "Spider Farmer",
  vivosun: "Vivosun",
};

export class CsvImportVendorIdentity {
  static detect(
    fileName: string | null | undefined,
    headers: readonly string[],
  ): CsvSourceApp | null {
    const haystack = `${fileName ?? ""}\n${headers.join("\n")}`.toLowerCase();
    if (/ac[\s._-]*infinity/.test(haystack)) return "ac_infinity";
    if (/spider[\s._-]*farmer/.test(haystack)) return "spider_farmer";
    if (/\bvivosun\b/.test(haystack)) return "vivosun";
    return null;
  }

  static label(sourceApp: CsvSourceApp | null | undefined): string | null {
    if (!sourceApp) return null;
    return VENDOR_LABEL[sourceApp] ?? null;
  }

  /** "CSV" or "CSV · AC Infinity". Never replaces the stored source value. */
  static sourceBadge(vendorLabel: string | null | undefined): string {
    return vendorLabel ? `CSV · ${vendorLabel}` : "CSV";
  }

  static fromStoredRow(row: { source?: string | null; raw_payload?: unknown }): string | null {
    const lineage = getCsvVendorLineage(row);
    if (lineage) return lineage.vendorLabel;
    const payload =
      row.raw_payload && typeof row.raw_payload === "object" && !Array.isArray(row.raw_payload)
        ? (row.raw_payload as Record<string, unknown>)
        : null;
    const fileName =
      typeof payload?.import_file_name === "string" ? payload.import_file_name : null;
    const rawRow = payload?.raw_row;
    const headers =
      rawRow && typeof rawRow === "object" && !Array.isArray(rawRow)
        ? Object.keys(rawRow as Record<string, unknown>)
        : [];
    return CsvImportVendorIdentity.label(CsvImportVendorIdentity.detect(fileName, headers));
  }

  static badgeForRows(
    rows: ReadonlyArray<{ source?: string | null; raw_payload?: unknown }>,
  ): string {
    const labels = new Set<string>();
    for (const row of rows) {
      if ((row.source ?? "").toLowerCase() !== "csv") continue;
      const label = CsvImportVendorIdentity.fromStoredRow(row);
      if (label) labels.add(label);
    }
    if (labels.size === 1) return CsvImportVendorIdentity.sourceBadge([...labels][0]);
    if (labels.size > 1) return "CSV · Multiple sources";
    return "CSV";
  }
}
