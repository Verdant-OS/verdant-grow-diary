/**
 * Pure helpers for the local browser print/export-to-PDF flow on the
 * Environment Summary Report. No DOM, no I/O, no fetch.
 *
 * Deterministic, null-safe. The page uses these to set document.title
 * before window.print() so the browser-suggested filename is sensible
 * when the grower picks "Save as PDF".
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function safeIsoDate(s: unknown): string {
  return typeof s === "string" && ISO_DATE_RE.test(s) ? s : "unknown";
}

export const PRINT_SAFETY_FOOTER =
  "Read-only report. No device control, automation, alerts, or action queue changes were performed.";

export function buildEnvironmentSummaryPrintTitle(
  startDate: string,
  endDate: string,
): string {
  const s = safeIsoDate(startDate);
  const e = safeIsoDate(endDate);
  return `Verdant — Environment Summary — ${s} to ${e}`;
}

export function buildEnvironmentSummaryPrintFilename(
  startDate: string,
  endDate: string,
): string {
  const s = safeIsoDate(startDate);
  const e = safeIsoDate(endDate);
  return `verdant-environment-summary-${s}-to-${e}.pdf`;
}

export interface EnvironmentSummaryPrintMetadataInput {
  startDate: string;
  endDate: string;
  generatedAt?: Date | string;
}

export interface EnvironmentSummaryPrintMetadata {
  title: string;
  filename: string;
  startDate: string;
  endDate: string;
  dateRangeLabel: string;
  generatedAtLabel: string;
  safetyFooter: string;
}

export function buildEnvironmentSummaryPrintMetadata(
  input: EnvironmentSummaryPrintMetadataInput,
): EnvironmentSummaryPrintMetadata {
  const start = safeIsoDate(input.startDate);
  const end = safeIsoDate(input.endDate);
  const generated =
    input.generatedAt instanceof Date
      ? input.generatedAt
      : typeof input.generatedAt === "string"
        ? new Date(input.generatedAt)
        : new Date();
  const generatedLabel = Number.isFinite(generated.getTime())
    ? generated.toISOString()
    : "unknown";

  return {
    title: buildEnvironmentSummaryPrintTitle(start, end),
    filename: buildEnvironmentSummaryPrintFilename(start, end),
    startDate: start,
    endDate: end,
    dateRangeLabel: `${start} — ${end}`,
    generatedAtLabel: generatedLabel,
    safetyFooter: PRINT_SAFETY_FOOTER,
  };
}
