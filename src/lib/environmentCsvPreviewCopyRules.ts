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

export type CsvImportFailureReason = "unverified_duplicate";

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
  failureReason?: CsvImportFailureReason,
): string {
  if (failureReason === "unverified_duplicate") {
    const saved =
      insertedCount > 0
        ? `${insertedCount} CSV reading${insertedCount === 1 ? "" : "s"} confirmed saved. `
        : unconfirmedWrite
          ? "Import stopped. "
          : partialWrite
            ? "Import stopped. Earlier CSV readings may already have been saved. "
            : "No new CSV readings were saved in this attempt. ";
    const uncertain = unconfirmedWrite
      ? `We couldn't confirm whether ${insertedCount > 0 ? "the remaining" : "any"} CSV readings were saved. `
      : "";
    return `${saved}${uncertain}Matching CSV history was detected, but we couldn't verify all matching readings in your current history view. Older readings may be outside that view. Review imported history before retrying; retrying the same file may encounter the same conflict. No live sensor data was created.`;
  }
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
  parts.push(previewTemperature(row));
  parts.push(row.humidity_pct != null ? `${row.humidity_pct.toFixed(0)}%` : "—");
  if (row.vpd_kpa != null) parts.push(`${row.vpd_kpa.toFixed(2)} kPa VPD`);
  if (row.co2_ppm != null) parts.push(`${row.co2_ppm.toFixed(0)} ppm CO₂`);
  if (row.ppfd != null) parts.push(`${row.ppfd.toFixed(0)} PPFD`);
  return parts.join(" · ");
}

/** File unit when the parser kept it; canonical Celsius only when the file unit is unknown. */
function previewTemperature(row: ParsedEnvironmentRow): string {
  if (row.raw_temp_unit === "F" && row.raw_temperature != null) {
    return `${row.raw_temperature.toFixed(1)}°F`;
  }
  if (row.raw_temp_unit === "C" && row.raw_temperature != null) {
    return `${row.raw_temperature.toFixed(1)}°C`;
  }
  return row.temperature_c != null ? `${row.temperature_c.toFixed(1)}°C` : "—";
}

// ---------- source time zone ----------

export const CSV_TIME_ZONE_PROMPT = "Which time zone was this file recorded in?";
export const CSV_TIME_ZONE_HELP =
  "This file lists clock times without a time zone. Choose the zone the controller or its app was set to, so each reading lands at the moment it was taken. Verdant won’t guess.";
export const CSV_TIME_ZONE_SELECT_LABEL = "Source time zone";
export const CSV_TIME_ZONE_PLACEHOLDER = "Choose a time zone";
export const CSV_TIME_ZONE_CONTINUE_LABEL = "Use this time zone";
export const CSV_TIME_ZONE_CHANGE_LABEL = "Change time zone";
export const CSV_TIME_FROM_FILE_NOTE = "Times use the UTC offsets written in the file.";

export function csvTimeZoneNote(zone: string): string {
  return `Clock times are read as ${zone}. Each reading below shows the file’s time, the offset used and the saved UTC instant.`;
}

/**
 * Blocking copy for daylight-saving folds and gaps. These rows are never
 * guessed, so the whole file stays unsaved until a later workflow handles them.
 */
export function buildCsvUnresolvedTimeMessage(
  zone: string | null,
  ambiguousCount: number,
  nonexistentCount: number,
): string {
  const where = zone ? ` in ${zone}` : "";
  const parts: string[] = [];
  if (ambiguousCount > 0) {
    parts.push(
      `${ambiguousCount} row${ambiguousCount === 1 ? " has a time" : "s have times"} that happened twice${where} when clocks fell back`,
    );
  }
  if (nonexistentCount > 0) {
    parts.push(
      `${nonexistentCount} row${nonexistentCount === 1 ? " has a time" : "s have times"} that never happened${where} when clocks sprang forward`,
    );
  }
  return `Import is blocked. ${parts.join(", and ")}. The file doesn’t say which moment is meant, so Verdant won’t guess. Nothing has been saved.`;
}

/**
 * Preview disclosure for recognized columns this importer does not read
 * (today: soil). Shown before Confirm so a partly supported file never looks
 * fully imported. Saved rows keep the original cells in their raw record.
 */
export function csvUnsupportedColumnsNote(columns: readonly string[]): string | null {
  if (columns.length === 0) return null;
  return `Not imported: ${columns.join(", ")}. This importer doesn’t read soil temperature, soil moisture or soil EC yet. Each saved reading keeps the file’s original row, including these cells, in its raw record.`;
}
