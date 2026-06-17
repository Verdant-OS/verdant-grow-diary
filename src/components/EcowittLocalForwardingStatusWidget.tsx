/**
 * EcoWitt Local Forwarding Status Widget — operator-only, read-only.
 *
 * Polls the LOCAL listener (http://localhost:8787) for sanitized
 * forwarding health and exposes a copy-button for the sanitized error
 * report. Never contacts Verdant, Supabase, Edge Functions, or any
 * remote service. No tokens, no Authorization headers, no raw payloads.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  LOCAL_FORWARDING_ERROR_REPORT_URL,
  fetchLocalForwardingErrorReportText,
  fetchLocalForwardingStatus,
  sanitizeReportText,
  sanitizeReportValue,
  type LocalForwardingFetchState,
} from "@/lib/ecowittLocalForwardingStatus";
import {
  buildForwardingStatusViewModel,
  type ForwardingStatusRow,
} from "@/lib/ecowittLocalForwardingStatusViewModel";
import {
  buildSanitizedForwardingReport,
  serializeSanitizedForwardingReport,
  type ForwardingErrorReportLike,
} from "@/lib/ecowittForwardingReportExport";

export interface EcowittLocalForwardingStatusWidgetProps {
  /** Test seam: skip the initial auto-fetch (use a manual refresh). */
  autoFetch?: boolean;
}

export default function EcowittLocalForwardingStatusWidget({
  autoFetch = true,
}: EcowittLocalForwardingStatusWidgetProps) {
  const { toast } = useToast();
  const [fetchState, setFetchState] = useState<LocalForwardingFetchState>({
    state: "loading",
  });
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    setFetchState({ state: "loading" });
    const next = await fetchLocalForwardingStatus();
    setFetchState(next);
    setBusy(false);
    if (next.state === "offline") {
      toast({
        title: "EcoWitt local bridge not reachable",
        description:
          "Start the listener on localhost:8787, then refresh. No data was sent.",
      });
    }
  }, [toast]);

  useEffect(() => {
    if (autoFetch) {
      void refresh();
    }
  }, [autoFetch, refresh]);

  const handleCopyReport = useCallback(async () => {
    // Re-fetch BOTH the live status and the error report so the copied
    // payload reflects "right now" even if rows are stale.
    const [statusNext, reportText] = await Promise.all([
      fetchLocalForwardingStatus(),
      fetchLocalForwardingErrorReportText(),
    ]);

    if (statusNext.state !== "ready") {
      toast({
        title: "Could not copy report",
        description:
          "EcoWitt local bridge is not reachable. Start the listener first.",
        variant: "destructive",
      });
      return;
    }

    let errorReport: ForwardingErrorReportLike | null = null;
    if (reportText.ok === true) {
      try {
        const parsed = JSON.parse(reportText.json) as unknown;
        errorReport = sanitizeReportValue(parsed) as ForwardingErrorReportLike;
      } catch {
        errorReport = null;
      }
    }

    const report = buildSanitizedForwardingReport({
      status: statusNext.status,
      errorReport,
    });
    // Belt-and-braces: re-scrub the serialized string before clipboard write.
    const safeJson = sanitizeReportText(serializeSanitizedForwardingReport(report));
    setFetchState(statusNext);

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(safeJson);
        toast({
          title: "Sanitized forwarding report copied",
          description:
            "Safe to share with a developer. Never paste your bridge token.",
        });
      } else {
        toast({
          title: "Clipboard not available",
          description: `Open ${LOCAL_FORWARDING_ERROR_REPORT_URL} in your browser to view the report.`,
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Clipboard write failed",
        description: `Open ${LOCAL_FORWARDING_ERROR_REPORT_URL} manually.`,
        variant: "destructive",
      });
    }
  }, [toast]);

  const vm = buildForwardingStatusViewModel(fetchState);

  return (
    <Card data-testid="ecowitt-local-forwarding-widget">
      <CardHeader>
        <CardTitle className="text-base">
          EcoWitt Local Bridge — Forwarding Health
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <p
            className="text-sm font-medium"
            data-testid="ecowitt-local-forwarding-headline"
          >
            {vm.headline}
          </p>
          {vm.subheadline ? (
            <p className="text-xs text-muted-foreground">{vm.subheadline}</p>
          ) : null}
        </div>

        {vm.banner.show ? (
          <div
            role="alert"
            data-testid="ecowitt-local-forwarding-banner"
            className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-1 text-xs"
          >
            <p
              className="text-sm font-semibold text-destructive"
              data-testid="ecowitt-local-forwarding-banner-title"
            >
              {vm.banner.title}
            </p>
            <p data-testid="ecowitt-local-forwarding-banner-status">
              <span className="text-muted-foreground">Status: </span>
              <span className="font-medium">{vm.banner.status}</span>
            </p>
            <p data-testid="ecowitt-local-forwarding-banner-classification">
              <span className="text-muted-foreground">Classification: </span>
              <span className="font-medium">{vm.banner.classification}</span>
            </p>
            <p data-testid="ecowitt-local-forwarding-banner-reason">
              <span className="text-muted-foreground">Reason: </span>
              <span className="font-medium">{vm.banner.reason}</span>
            </p>
            <p
              data-testid="ecowitt-local-forwarding-banner-next-step"
              className="pt-1"
            >
              <span className="text-muted-foreground">Next step: </span>
              <span className="font-medium">
                {vm.banner.recommendedNextStep}
              </span>
            </p>
            <a
              className="inline-block pt-1 underline text-[11px]"
              href={LOCAL_FORWARDING_ERROR_REPORT_URL}
              target="_blank"
              rel="noreferrer"
              data-testid="ecowitt-local-forwarding-banner-report-link"
            >
              View sanitized forwarding error report
            </a>
          </div>
        ) : null}

        {vm.state === "ready" && vm.rows.length > 0 ? (
          <dl
            className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs"
            data-testid="ecowitt-local-forwarding-rows"
          >
            {vm.rows.map((row) => (
              <Row key={row.key} row={row} />
            ))}
          </dl>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void refresh()}
            disabled={busy}
            data-testid="ecowitt-local-forwarding-refresh"
          >
            Refresh
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleCopyReport()}
            data-testid="ecowitt-local-forwarding-copy-report"
          >
            Copy sanitized forwarding error report
          </Button>
          <a
            className="text-[11px] text-muted-foreground underline"
            href={LOCAL_FORWARDING_ERROR_REPORT_URL}
            target="_blank"
            rel="noreferrer"
            data-testid="ecowitt-local-forwarding-report-link"
          >
            {LOCAL_FORWARDING_ERROR_REPORT_URL}
          </a>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Widget reads only the local listener on localhost:8787. No tokens,
          Authorization headers, raw payloads, or .env values are fetched,
          shown, or copied.
        </p>
      </CardContent>
    </Card>
  );
}

function Row({ row }: { row: ForwardingStatusRow }) {
  const tone =
    row.tone === "ok"
      ? "text-emerald-600 dark:text-emerald-400"
      : row.tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : row.tone === "error"
          ? "text-destructive"
          : "";
  return (
    <div>
      <dt className="text-muted-foreground">{row.label}</dt>
      <dd
        className={`font-medium ${tone}`}
        data-testid={`ecowitt-local-forwarding-row-${row.key}`}
      >
        {row.value}
      </dd>
    </div>
  );
}
