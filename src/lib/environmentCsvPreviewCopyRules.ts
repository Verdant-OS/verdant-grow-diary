/**
 * environmentCsvPreviewCopyRules — pure presenter copy for historical CSV import.
 *
 * Keeps CSV import copy hardware-neutral while preserving source truth:
 * CSV data is historical context, not current telemetry.
 */
import type { ParsedEnvironmentRow } from "@/lib/csvParser";

export const CSV_IMPORT_DESCRIPTION =
  "Bring in your Spider Farmer, AC Infinity, or other environment CSV. Verdant will source-tag it as historical CSV context.";

export const CSV_IMPORT_READING_COPY = "Reading your environment export…";

/** Confirm intent only. The modal stays open until persistence completes. */
export const CSV_IMPORT_CONFIRM_LABEL = "Import CSV history";

/**
 * Post-import completion note. Rendered verbatim: imported rows are
 * historical background, never live telemetry, and AI Doctor still
 * wants a fresh reading for current conditions.
 */
export const CSV_IMPORT_HISTORICAL_CONTEXT_NOTE =
  "Imported readings are historical background, not live telemetry. Add a fresh reading before using AI Doctor for current conditions.";

/** Post-import handoff CTA label. Navigation only — never runs AI. */
export const CSV_IMPORT_VIEW_HISTORY_LABEL = "View imported history";
export const CSV_IMPORT_ADD_CURRENT_READING_LABEL = "Add current reading";

export interface CsvImportFailureReceipt {
  insertedCount: number;
  partialWrite?: boolean;
  unconfirmedWrite?: boolean;
}

/** A failed retry cannot disprove an earlier unconfirmed or acknowledged write. */
export function mergeCsvImportFailureReceipts(
  previous: CsvImportFailureReceipt | null,
  current: CsvImportFailureReceipt,
): CsvImportFailureReceipt {
  const insertedCount = (previous?.insertedCount ?? 0) + current.insertedCount;
  return {
    insertedCount,
    partialWrite: insertedCount > 0 || current.partialWrite === true,
    unconfirmedWrite: previous?.unconfirmedWrite === true || current.unconfirmedWrite === true,
  };
}

export function buildCsvImportFailureMessage(
  insertedCount: number,
  partialWrite: boolean,
  unconfirmedWrite = false,
): string {
  if (unconfirmedWrite) {
    const confirmed =
      insertedCount > 0
        ? `${insertedCount} CSV reading${insertedCount === 1 ? "" : "s"} confirmed saved. `
        : "Import could not be completed. ";
    return `${confirmed}We couldn't confirm whether ${insertedCount > 0 ? "the remaining" : "any"} CSV readings were saved. Review imported history before retrying; readings already present will be skipped safely. No live sensor data was created.`;
  }
  if (partialWrite && insertedCount > 0) {
    const verb = insertedCount === 1 ? "was" : "were";
    return `Import stopped after ${insertedCount} CSV reading${insertedCount === 1 ? "" : "s"} ${verb} saved. Review imported history before retrying; readings already present will be skipped safely. No live sensor data was created.`;
  }
  return "Import could not be completed. No CSV readings were saved. Try again. No live sensor data was created.";
}

export function formatCsvPreviewRow(row: ParsedEnvironmentRow): string {
  const parts = [new Date(row.captured_at).toLocaleString()];
  parts.push(row.temperature_c != null ? `${row.temperature_c.toFixed(1)}°C` : "—");
  parts.push(row.humidity_pct != null ? `${row.humidity_pct.toFixed(0)}%` : "—");
  if (row.vpd_kpa != null) parts.push(`${row.vpd_kpa.toFixed(2)} kPa VPD`);
  if (row.co2_ppm != null) parts.push(`${row.co2_ppm.toFixed(0)} ppm CO₂`);
  if (row.ppfd != null) parts.push(`${row.ppfd.toFixed(0)} PPFD`);
  return parts.join(" · ");
}
