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

export function formatCsvPreviewRow(row: ParsedEnvironmentRow): string {
  const parts = [new Date(row.captured_at).toLocaleString()];
  parts.push(row.temperature_c != null ? `${row.temperature_c.toFixed(1)}°C` : "—");
  parts.push(row.humidity_pct != null ? `${row.humidity_pct.toFixed(0)}%` : "—");
  if (row.vpd_kpa != null) parts.push(`${row.vpd_kpa.toFixed(2)} kPa VPD`);
  if (row.co2_ppm != null) parts.push(`${row.co2_ppm.toFixed(0)} ppm CO₂`);
  if (row.ppfd != null) parts.push(`${row.ppfd.toFixed(0)} PPFD`);
  return parts.join(" · ");
}
