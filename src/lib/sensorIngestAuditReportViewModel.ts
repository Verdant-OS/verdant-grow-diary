/**
 * Pure view-model wrapper for the audit report. No I/O. No React.
 */
import {
  buildAuditReport,
  CANONICAL_SOURCES,
  type AuditReport,
  type AuditReportInput,
  type AuditReportPageSize,
  type AuditReportFilters,
  type CanonicalSource,
  AUDIT_REPORT_PAGE_SIZES,
} from "@/lib/sensorIngestAuditReportRules";

export interface SensorIngestAuditOperatorSummary {
  /** Rows shown in the current filtered/last-N window. */
  shownRows: number;
  /** Rows matching filters before last-N slicing. */
  filteredRows: number;
  /** Accepted persisted readings visible in the current window. */
  acceptedPersistedRows: number;
  /** Rejected rows visible in the current window, if a caller ever supplies them. */
  rejectedVisibleRows: number;
  /** Rejected ingest attempts are intentionally omitted because they are not persisted. */
  rejectedAttemptsOmitted: boolean;
  /** Raw payloads are omitted from CSV/export surfaces by default. */
  rawPayloadsOmittedFromCsv: number;
  bySource: Record<CanonicalSource | "unknown", number>;
}

export interface SensorIngestAuditReportViewModel {
  report: AuditReport;
  availablePageSizes: ReadonlyArray<AuditReportPageSize>;
  availableProviders: string[];
  filteredTotal: number;
  isEmptyInput: boolean;
  isEmptyAfterFilters: boolean;
  operatorSummary: SensorIngestAuditOperatorSummary;
}

function buildEmptySourceCounts(): Record<CanonicalSource | "unknown", number> {
  const out = Object.fromEntries(
    [...CANONICAL_SOURCES, "unknown"].map((source) => [source, 0]),
  ) as Record<CanonicalSource | "unknown", number>;
  return out;
}

export function buildSensorIngestAuditOperatorSummary(
  report: AuditReport,
): SensorIngestAuditOperatorSummary {
  const bySource = buildEmptySourceCounts();
  let acceptedPersistedRows = 0;
  let rejectedVisibleRows = 0;

  for (const row of report.rows) {
    bySource[row.source] = (bySource[row.source] ?? 0) + 1;
    if (row.accepted) acceptedPersistedRows += 1;
    else rejectedVisibleRows += 1;
  }

  return {
    shownRows: report.rows.length,
    filteredRows: report.filteredTotal,
    acceptedPersistedRows,
    rejectedVisibleRows,
    rejectedAttemptsOmitted: true,
    rawPayloadsOmittedFromCsv: report.rows.length,
    bySource,
  };
}

export function buildSensorIngestAuditReportViewModel(
  input: AuditReportInput,
): SensorIngestAuditReportViewModel {
  const report = buildAuditReport(input);
  const isEmptyInput = input.rows.length === 0;
  const isEmptyAfterFilters = !isEmptyInput && report.rows.length === 0;
  return {
    report,
    availablePageSizes: AUDIT_REPORT_PAGE_SIZES,
    availableProviders: report.availableProviders,
    filteredTotal: report.filteredTotal,
    isEmptyInput,
    isEmptyAfterFilters,
    operatorSummary: buildSensorIngestAuditOperatorSummary(report),
  };
}

export const AUDIT_REPORT_EMPTY_NO_READINGS =
  "No EcoWitt readings found yet." as const;
export const AUDIT_REPORT_EMPTY_HINT =
  "Run the dry-run command first, then send one webhook reading." as const;
export const AUDIT_REPORT_EMPTY_FILTERS =
  "No readings match the current filters." as const;
