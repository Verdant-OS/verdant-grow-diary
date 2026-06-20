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

/**
 * Strip unsafe filename characters and lowercase. Empty/invalid → "".
 * Replaces any non [a-z0-9._-] run with a single "-", trims edge "-".
 */
export function sanitizePrintFilenamePart(value: unknown): string {
  if (typeof value !== "string") return "";
  const lowered = value.toLowerCase();
  const cleaned = lowered
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return cleaned;
}

export function buildEnvironmentSummaryDrilldownPrintFilename(
  startDate: string,
  endDate: string,
  ruleId: unknown,
): string {
  const s = safeIsoDate(startDate);
  const e = safeIsoDate(endDate);
  const safeId = sanitizePrintFilenamePart(ruleId) || "selected-issue";
  return `verdant-environment-drilldown-${s}-to-${e}-${safeId}.pdf`;
}

export function buildEnvironmentSummaryDrilldownPrintTitle(
  startDate: string,
  endDate: string,
  issueLabel: unknown,
): string {
  const s = safeIsoDate(startDate);
  const e = safeIsoDate(endDate);
  const label =
    typeof issueLabel === "string" && issueLabel.trim().length > 0
      ? issueLabel.trim()
      : "Selected issue";
  return `Verdant — Environment Drilldown — ${label} — ${s} to ${e}`;
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
