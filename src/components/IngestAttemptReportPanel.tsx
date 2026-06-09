/**
 * IngestAttemptReportPanel — developer/operator-only presenter for the
 * result of a single ingest attempt against the validated
 * `sensor-ingest-webhook` Edge Function.
 *
 * Hard rules:
 *  - Read-only. Never writes to the DB. Never calls the Edge Function.
 *  - Never displays the raw bridge token; only the redacted preview.
 *  - Stale/invalid/rejected attempts are never described as "live"
 *    or "healthy" — copy comes from `ingestAttemptReportRules`.
 *  - Clipboard copy uses the redacted JSON only.
 */

import { useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  buildRedactedReportForClipboard,
  type IngestAttemptReport,
} from "@/lib/ingestAttemptReportRules";

interface Props {
  report: IngestAttemptReport;
  /** Optional override for testing; defaults to navigator clipboard. */
  onCopy?: (json: string) => void;
}

const STATUS_VARIANT: Record<
  IngestAttemptReport["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  accepted: "default",
  dry_run: "secondary",
  rejected: "destructive",
  network_error: "destructive",
  unknown_response: "outline",
};

const STATUS_ROLE: Record<IngestAttemptReport["status"], "status" | "alert"> = {
  accepted: "status",
  dry_run: "status",
  rejected: "alert",
  network_error: "alert",
  unknown_response: "status",
};

export default function IngestAttemptReportPanel({ report, onCopy }: Props) {
  const handleCopy = useCallback(() => {
    const payload = JSON.stringify(buildRedactedReportForClipboard(report), null, 2);
    if (onCopy) {
      onCopy(payload);
      return;
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(payload);
    }
  }, [report, onCopy]);

  return (
    <section
      data-testid="ingest-attempt-report-panel"
      data-status={report.status}
      data-classification={report.classification}
      aria-label="Ingest attempt report"
      className="rounded-lg border border-border/60 bg-card p-4 space-y-3"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-tight">{report.title}</h3>
          <p
            role={STATUS_ROLE[report.status]}
            aria-live="polite"
            className="text-xs text-muted-foreground mt-1"
          >
            {report.description}
          </p>
        </div>
        <Badge
          variant={STATUS_VARIANT[report.status]}
          data-testid="ingest-attempt-status-badge"
        >
          {report.status.replace(/_/g, " ")}
        </Badge>
      </header>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        {report.httpStatus !== null && (
          <div>
            <dt className="text-muted-foreground">HTTP status</dt>
            <dd data-testid="ingest-attempt-http">{report.httpStatus}</dd>
          </div>
        )}
        <div>
          <dt className="text-muted-foreground">Classification</dt>
          <dd data-testid="ingest-attempt-classification">{report.classification}</dd>
        </div>
        {report.url && (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Ingest URL</dt>
            <dd className="break-all" data-testid="ingest-attempt-url">{report.url}</dd>
          </div>
        )}
        {report.tentId && (
          <div>
            <dt className="text-muted-foreground">Tent</dt>
            <dd data-testid="ingest-attempt-tent">{report.tentId}</dd>
          </div>
        )}
        {report.plantId && (
          <div>
            <dt className="text-muted-foreground">Plant</dt>
            <dd>{report.plantId}</dd>
          </div>
        )}
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Authorization</dt>
          <dd data-testid="ingest-attempt-auth">{report.authPreview}</dd>
        </div>
        {report.metricKeys.length > 0 && (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Metric keys</dt>
            <dd data-testid="ingest-attempt-metrics">
              {report.metricKeys.join(", ")}
            </dd>
          </div>
        )}
      </dl>

      {report.reasons.length > 0 && (
        <div data-testid="ingest-attempt-reasons" className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Why rejected</p>
          <ul className="flex flex-wrap gap-1">
            {report.reasons.map((r) => (
              <li key={r}>
                <Badge variant="outline" className="text-[10px]">
                  {r.replace(/_/g, " ")}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      <footer className="flex items-center justify-between gap-2 pt-2 border-t border-border/40">
        <p className="text-[11px] text-muted-foreground" data-testid="ingest-attempt-storage-notice">
          {report.storageNotice}
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={handleCopy}
          data-testid="ingest-attempt-copy"
        >
          Copy redacted report
        </Button>
      </footer>
    </section>
  );
}
