/**
 * Pure helpers for the Environment Summary Report PDF/print export.
 *
 * No DOM, no I/O, no fetch. Build deterministic filenames + a printable
 * section payload that a presenter can render or pipe into print/PDF flow.
 */
import type {
  EnvironmentSummaryReportViewModel,
  EnvironmentSummaryTopIssue,
} from "./environmentSummaryReportViewModel";

export const PDF_SAFETY_FOOTER =
  "Read-only report. No device control or automation was performed.";

export interface EnvironmentSummaryPdfPayload {
  title: string;
  dateRangeLabel: string;
  generatedAtLabel: string;
  filename: string;
  sections: EnvironmentSummaryPdfSection[];
  selectedIssue: EnvironmentSummaryTopIssue | null;
  safetyFooter: string;
}

export interface EnvironmentSummaryPdfSection {
  heading: string;
  rows: string[];
}

function isValidIsoDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function buildEnvironmentSummaryPdfFilename(
  startDate: string,
  endDate: string,
): string {
  const safeStart = isValidIsoDate(startDate) ? startDate : "unknown";
  const safeEnd = isValidIsoDate(endDate) ? endDate : "unknown";
  return `verdant-environment-summary-${safeStart}-to-${safeEnd}.pdf`;
}

export interface BuildPdfPayloadInput {
  report: EnvironmentSummaryReportViewModel;
  startDate: string;
  endDate: string;
  selectedIssueId?: string | null;
  /** Injected for deterministic tests. Defaults to new Date(). */
  now?: Date;
}

export function buildEnvironmentSummaryPdfPayload(
  input: BuildPdfPayloadInput,
): EnvironmentSummaryPdfPayload {
  const { report, startDate, endDate, selectedIssueId, now } = input;
  const generatedAt = now ?? new Date();
  const sections: EnvironmentSummaryPdfSection[] = [];

  sections.push({
    heading: "Status counts",
    rows: [
      `Valid: ${report.statusCounts.valid}`,
      `Review required: ${report.statusCounts.review_required}`,
      `DST-ambiguous: ${report.statusCounts.dst_ambiguous}`,
      `Invalid: ${report.statusCounts.invalid}`,
    ],
  });

  sections.push({
    heading: "Source counts",
    rows: Object.entries(report.sourceCounts).map(
      ([src, count]) => `${src}: ${count}`,
    ),
  });

  if (report.metricCoverage.length > 0) {
    sections.push({
      heading: "Metric coverage",
      rows: report.metricCoverage.map(
        (m) =>
          `${m.label}: ${m.sampleCount} samples · ${m.invalidCount} invalid · ${m.reviewRequiredCount} review`,
      ),
    });
  }

  if (report.topIssues.length > 0) {
    sections.push({
      heading: "Top issues",
      rows: report.topIssues.map(
        (i) => `${i.label} ×${i.count} (${i.severity}) — ${i.prompt}`,
      ),
    });
  }

  const selectedIssue =
    (selectedIssueId &&
      report.topIssues.find((i) => i.ruleId === selectedIssueId)) ||
    null;

  if (selectedIssue) {
    sections.push({
      heading: `Selected issue: ${selectedIssue.label}`,
      rows: [
        `Count: ${selectedIssue.count}`,
        `Severity: ${selectedIssue.severity}`,
        selectedIssue.prompt,
        `Related entries: ${selectedIssue.relatedEntryIds.length}`,
      ],
    });
  }

  return {
    title: "Verdant — Environment Summary Report",
    dateRangeLabel: report.dateRangeLabel,
    generatedAtLabel: generatedAt.toISOString(),
    filename: buildEnvironmentSummaryPdfFilename(startDate, endDate),
    sections,
    selectedIssue: selectedIssue ?? null,
    safetyFooter: PDF_SAFETY_FOOTER,
  };
}
