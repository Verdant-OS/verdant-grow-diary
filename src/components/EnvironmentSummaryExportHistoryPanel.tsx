/**
 * EnvironmentSummaryExportHistoryPanel — presenter-only.
 *
 * Renders the last few local-only Environment Summary Report export
 * audit events (browser localStorage). Lets the grower reopen the same
 * date range view via a callback and view a read-only receipt for each
 * export.
 *
 * Read-only. No network. No Supabase. No writes here — events are
 * recorded by the report page when a print is confirmed.
 */
import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { History, RotateCcw, FileText, Copy, Check } from "lucide-react";
import type { EnvironmentSummaryExportAuditEvent } from "@/lib/environmentSummaryExportAuditRules";
import {
  buildExportReceiptViewModel,
  formatReceiptPlainText,
  type ExportReceiptViewModel,
} from "@/lib/environmentSummaryExportReceiptView";

export interface EnvironmentSummaryExportHistoryPanelProps {
  events: EnvironmentSummaryExportAuditEvent[];
  /** Max number of recent events to show. Defaults to 5. */
  limit?: number;
  onReopen: (input: {
    startDate: string;
    endDate: string;
    issueRuleId?: string | null;
  }) => void;
  "data-testid"?: string;
}

function formatEventType(t: EnvironmentSummaryExportAuditEvent["eventType"]) {
  return t === "drilldown_print_opened" ? "Drilldown PDF" : "Full report PDF";
}

function formatOccurredAt(iso: string): string {
  // Stable, locale-free for deterministic UI: "YYYY-MM-DD HH:mmZ".
  if (typeof iso !== "string" || iso.length < 16) return "unknown";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "unknown";
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${y}-${mo}-${da} ${h}:${mi}Z`;
}

export default function EnvironmentSummaryExportHistoryPanel({
  events,
  limit = 5,
  onReopen,
  ...rest
}: EnvironmentSummaryExportHistoryPanelProps) {
  const testId = rest["data-testid"] ?? "env-report-export-history";
  const [selectedReceipt, setSelectedReceipt] =
    useState<ExportReceiptViewModel | null>(null);
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Most recent first.
  const recent = [...events].reverse().slice(0, Math.max(1, limit));

  const openReceipt = useCallback((evt: EnvironmentSummaryExportAuditEvent) => {
    setSelectedReceipt(buildExportReceiptViewModel(evt));
    setCopyFallback(null);
    setCopied(false);
  }, []);

  const closeReceipt = useCallback(() => {
    setSelectedReceipt(null);
    setCopyFallback(null);
    setCopied(false);
  }, []);

  const handleCopy = useCallback(async () => {
    if (!selectedReceipt) return;
    const text = formatReceiptPlainText(selectedReceipt);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setCopyFallback(null);
        window.setTimeout(() => setCopied(false), 2000);
      } else {
        throw new Error("Clipboard API unavailable");
      }
    } catch {
      setCopyFallback(
        "Copy unavailable. Select and copy the receipt text manually.",
      );
      setCopied(false);
    }
  }, [selectedReceipt]);

  return (
    <section
      data-testid={testId}
      className="print-hidden rounded-xl border border-border/40 bg-card/40 p-3 space-y-2"
      aria-label="Recent environment summary exports"
    >
      <header className="flex items-center gap-2 text-sm font-medium">
        <History className="h-4 w-4 text-muted-foreground" aria-hidden />
        <span>Recent exports</span>
        <span
          className="text-xs text-muted-foreground"
          data-testid={`${testId}-count`}
        >
          ({events.length})
        </span>
      </header>

      {recent.length === 0 ? (
        <p
          className="text-xs text-muted-foreground"
          data-testid={`${testId}-empty`}
        >
          No exports yet. Your last few print/save-as-PDF actions will appear
          here so you can reopen the same date range.
        </p>
      ) : (
        <ul className="space-y-1 text-xs" data-testid={`${testId}-list`}>
          {recent.map((evt) => {
            const label = formatEventType(evt.eventType);
            const when = formatOccurredAt(evt.occurredAt);
            const range = `${evt.dateRange.startDate} → ${evt.dateRange.endDate}`;
            const issueSuffix =
              evt.reportMode === "drilldown" && evt.issueLabel
                ? ` · ${evt.issueLabel}`
                : "";
            return (
              <li
                key={evt.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border/30 px-2 py-1"
                data-testid={`${testId}-item`}
                data-event-id={evt.id}
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="truncate">
                    <span className="font-medium">{label}</span>
                    <span className="text-muted-foreground"> · {range}</span>
                    {issueSuffix ? (
                      <span className="text-muted-foreground">
                        {issueSuffix}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{when}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openReceipt(evt)}
                    data-testid={`${testId}-details`}
                    aria-label={`View receipt for ${range}`}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Details
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      onReopen({
                        startDate: evt.dateRange.startDate,
                        endDate: evt.dateRange.endDate,
                        issueRuleId:
                          evt.reportMode === "drilldown"
                            ? (evt.issueRuleId ?? null)
                            : null,
                      })
                    }
                    data-testid={`${testId}-reopen`}
                    aria-label={`Reopen ${range}`}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reopen
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[10px] text-muted-foreground">
        Stored locally in your browser only. No data is sent to the server.
      </p>

      {/* Receipt Detail Dialog */}
      <Dialog open={!!selectedReceipt} onOpenChange={(open) => !open && closeReceipt()}>
        <DialogContent className="print-hidden max-w-md" data-testid="env-report-receipt-dialog">
          <DialogHeader>
            <DialogTitle>Export Receipt</DialogTitle>
            <DialogDescription>
              Details for this browser-local export.
            </DialogDescription>
          </DialogHeader>

          {selectedReceipt && (
            <div className="space-y-3 text-sm" data-testid="env-report-receipt-content">
              <div className="rounded-md border border-border/40 bg-muted/30 p-3 space-y-2">
                <ReceiptRow label="Event ID" value={selectedReceipt.eventId} testid="receipt-event-id" />
                <ReceiptRow label="Exported at" value={selectedReceipt.occurredAtFormatted} testid="receipt-occurred-at" />
                <ReceiptRow label="Report mode" value={selectedReceipt.reportModeLabel} testid="receipt-mode" />
                <ReceiptRow label="Date range" value={selectedReceipt.dateRangeFormatted} testid="receipt-range" />
                {selectedReceipt.issueLabel && (
                  <ReceiptRow label="Issue filter" value={selectedReceipt.issueLabel} testid="receipt-issue-label" />
                )}
                {selectedReceipt.issueRuleId && (
                  <ReceiptRow label="Issue rule ID" value={selectedReceipt.issueRuleId} testid="receipt-issue-rule-id" />
                )}
                <ReceiptRow label="Source" value={selectedReceipt.sourceLabel} testid="receipt-source" />
              </div>

              <p className="text-xs text-muted-foreground">
                This export receipt is stored locally in this browser.
              </p>

              {copyFallback && (
                <p
                  className="text-xs text-amber-600"
                  data-testid="env-report-receipt-copy-fallback"
                  role="status"
                >
                  {copyFallback}
                </p>
              )}

              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopy}
                  data-testid="env-report-receipt-copy-btn"
                  disabled={copied}
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 mr-1" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 mr-1" />
                      Copy receipt summary
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ReceiptRow({
  label,
  value,
  testid,
}: {
  label: string;
  value: string;
  testid: string;
}) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground text-xs shrink-0">{label}</span>
      <span
        className="font-mono text-xs text-right break-all"
        data-testid={testid}
      >
        {value}
      </span>
    </div>
  );
}
