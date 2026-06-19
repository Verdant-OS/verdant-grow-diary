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
}

export function buildSensorIngestAuditReportViewModel(
  input: AuditReportInput,
): SensorIngestAuditReportViewModel {
  return {
    report: buildAuditReport(input),
    availablePageSizes: AUDIT_REPORT_PAGE_SIZES,
  };
}
