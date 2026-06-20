/**
 * Pure view model that wraps buildTroubleshootingReport for presenter use.
 * No I/O, no React.
 */
import {
  buildTroubleshootingReport,
  type TroubleshootingInput,
  type TroubleshootingReport,
  type TroubleshootingStatus,
} from "@/lib/ecowittBridgeTroubleshootingRules";

const STATUS_LABEL: Record<TroubleshootingStatus, string> = {
  ok: "OK",
  warn: "Review",
  error: "Action required",
  unknown: "Needs verification",
};

export interface TroubleshootingPanelViewModel {
  report: TroubleshootingReport;
  overallLabel: string;
}

export function buildTroubleshootingPanelViewModel(
  input: TroubleshootingInput,
): TroubleshootingPanelViewModel {
  const report = buildTroubleshootingReport(input);
  return { report, overallLabel: STATUS_LABEL[report.overall] };
}

export { STATUS_LABEL as TROUBLESHOOTING_STATUS_LABEL };
