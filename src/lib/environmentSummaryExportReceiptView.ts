/**
 * EnvironmentSummaryExportReceiptView — pure presenter helpers.
 *
 * Formats an audit event into a read-only receipt view model and plain-text
 * summary. No side effects. No network. No React.
 */

import type { EnvironmentSummaryExportAuditEvent } from "./environmentSummaryExportAuditRules";
import { assertExportSafe } from "./exportRedactionRules";

export interface ExportReceiptViewModel {
  eventId: string;
  eventTypeLabel: string;
  reportModeLabel: string;
  occurredAtFormatted: string;
  dateRangeFormatted: string;
  startDate: string;
  endDate: string;
  issueLabel: string | null;
  issueRuleId: string | null;
  sourceLabel: string;
}

function formatEventTypeLabel(
  t: EnvironmentSummaryExportAuditEvent["eventType"],
): string {
  return t === "drilldown_print_opened" ? "Drilldown PDF" : "Full report PDF";
}

function formatReportModeLabel(
  m: EnvironmentSummaryExportAuditEvent["reportMode"],
): string {
  return m === "drilldown" ? "Drilldown" : "Full report";
}

function formatOccurredAt(iso: string): string {
  if (typeof iso !== "string" || iso.length < 16) return "Unknown";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "Unknown";
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}-${mo}-${da} ${h}:${mi}:${s}Z`;
}

export function buildExportReceiptViewModel(
  event: EnvironmentSummaryExportAuditEvent,
): ExportReceiptViewModel {
  return {
    eventId: event.id,
    eventTypeLabel: formatEventTypeLabel(event.eventType),
    reportModeLabel: formatReportModeLabel(event.reportMode),
    occurredAtFormatted: formatOccurredAt(event.occurredAt),
    dateRangeFormatted: `${event.dateRange.startDate} → ${event.dateRange.endDate}`,
    startDate: event.dateRange.startDate,
    endDate: event.dateRange.endDate,
    issueLabel: event.issueLabel ?? null,
    issueRuleId: event.issueRuleId ?? null,
    sourceLabel: event.source,
  };
}

export function formatReceiptPlainText(vm: ExportReceiptViewModel): string {
  const lines = [
    `Verdant Environment Summary Export Receipt`,
    `------------------------------------------`,
    `Event ID:       ${vm.eventId}`,
    `Exported at:    ${vm.occurredAtFormatted}`,
    `Report mode:    ${vm.reportModeLabel}`,
    `Date range:     ${vm.dateRangeFormatted}`,
  ];
  if (vm.issueLabel) {
    lines.push(`Issue filter:   ${vm.issueLabel}`);
  }
  if (vm.issueRuleId) {
    lines.push(`Issue rule ID:  ${vm.issueRuleId}`);
  }
  lines.push(`Source:         ${vm.sourceLabel}`);
  lines.push(`------------------------------------------`);
  lines.push(`This receipt is stored locally in your browser only.`);
  const text = lines.join("\n");
  assertExportSafe(text, "environment-summary-export-receipt");
  return text;
}
