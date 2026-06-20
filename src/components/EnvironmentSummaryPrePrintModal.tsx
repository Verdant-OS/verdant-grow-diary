/**
 * EnvironmentSummaryPrePrintModal — pre-print confirmation modal.
 *
 * Presenter-only. No I/O. No fetch. No Supabase. No telemetry SDKs.
 * Audit logging happens only when the consumer confirms via onConfirm —
 * the modal itself records nothing.
 *
 * Built on the shadcn Dialog primitive so Escape close, focus trap,
 * and focus-return-to-trigger are handled by Radix.
 */
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PRINT_SAFETY_FOOTER } from "@/lib/environmentSummaryPrintRules";

export type EnvironmentSummaryPrePrintMode = "full_report" | "drilldown";

export interface EnvironmentSummaryPrePrintModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: EnvironmentSummaryPrePrintMode;
  dateRangeLabel: string;
  generatedAtLabel: string;
  selectedIssueLabel?: string | null;
  selectedIssueRuleId?: string | null;
  relatedCheckCount?: number;
  onConfirm: () => void;
}

const TITLE = "Review before printing";
const FULL_SUMMARY =
  "You are about to print the full Environment Summary Report for this date range.";
const DRILLDOWN_SUMMARY =
  "You are about to print only the selected issue drilldown for this date range.";
const CONFIRM_LABEL = "Open print dialog";
const CANCEL_LABEL = "Cancel";

export default function EnvironmentSummaryPrePrintModal({
  open,
  onOpenChange,
  mode,
  dateRangeLabel,
  generatedAtLabel,
  selectedIssueLabel,
  selectedIssueRuleId,
  relatedCheckCount,
  onConfirm,
}: EnvironmentSummaryPrePrintModalProps) {
  const isDrilldown = mode === "drilldown";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="env-report-pre-print-modal">
        <DialogHeader>
          <DialogTitle data-testid="env-report-pre-print-modal-title">
            {TITLE}
          </DialogTitle>
          <DialogDescription data-testid="env-report-pre-print-modal-summary">
            {isDrilldown ? DRILLDOWN_SUMMARY : FULL_SUMMARY}
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Mode</dt>
          <dd data-testid="env-report-pre-print-modal-mode">
            {isDrilldown ? "Drilldown" : "Full report"}
          </dd>
          <dt className="text-muted-foreground">Date range</dt>
          <dd data-testid="env-report-pre-print-modal-range">{dateRangeLabel}</dd>
          <dt className="text-muted-foreground">Generated</dt>
          <dd data-testid="env-report-pre-print-modal-generated">
            {generatedAtLabel}
          </dd>
          {isDrilldown && (selectedIssueLabel || selectedIssueRuleId) ? (
            <>
              <dt className="text-muted-foreground">Selected issue</dt>
              <dd data-testid="env-report-pre-print-modal-issue">
                {selectedIssueLabel || "Selected issue"}
                {selectedIssueRuleId ? (
                  <span className="text-muted-foreground">
                    {" "}
                    ({selectedIssueRuleId})
                  </span>
                ) : null}
              </dd>
            </>
          ) : null}
          {isDrilldown && typeof relatedCheckCount === "number" ? (
            <>
              <dt className="text-muted-foreground">Related entries</dt>
              <dd data-testid="env-report-pre-print-modal-related-count">
                {relatedCheckCount}
              </dd>
            </>
          ) : null}
        </dl>
        <p
          className="text-xs text-muted-foreground"
          data-testid="env-report-pre-print-modal-safety"
        >
          {PRINT_SAFETY_FOOTER}
        </p>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            data-testid="env-report-pre-print-modal-cancel"
          >
            {CANCEL_LABEL}
          </Button>
          <Button
            onClick={onConfirm}
            data-testid="env-report-pre-print-modal-confirm"
          >
            {CONFIRM_LABEL}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
