/**
 * Pure view-model wrapper for the audit report. No I/O. No React.
 */
import {
  buildAuditReport,
  type AuditReport,
  type AuditReportInput,
  type AuditReportPageSize,
  AUDIT_REPORT_PAGE_SIZES,
} from "@/lib/sensorIngestAuditReportRules";

export interface SensorIngestAuditReportViewModel {
  report: AuditReport;
  availablePageSizes: ReadonlyArray<AuditReportPageSize>;
  availableProviders: string[];
  filteredTotal: number;
  isEmptyInput: boolean;
  isEmptyAfterFilters: boolean;
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
  };
}

export const AUDIT_REPORT_EMPTY_NO_READINGS =
  "No EcoWitt readings found yet." as const;
export const AUDIT_REPORT_EMPTY_HINT =
  "Run the dry-run command first, then send one webhook reading." as const;
export const AUDIT_REPORT_EMPTY_FILTERS =
  "No readings match the current filters." as const;
