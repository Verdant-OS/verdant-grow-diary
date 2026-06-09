/**
 * Ecowitt Bridge Status — operator-only read-only diagnostics page.
 *
 * Shows local (browser-only) Ecowitt bridge ingest attempts that the
 * operator has pasted in from the local runner's redacted output.
 *
 * Strict rules:
 *  - Reads / writes only `localStorage`. No Supabase. No Edge Functions.
 *  - Never shows raw bridge tokens. Imports defensively redact.
 *  - Stale / invalid / unknown attempts never render as "live".
 *  - Provider/transport identity is shown separately from trust.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import EcowittSnapshotTrustExamples from "@/components/EcowittSnapshotTrustExamples";
import IngestAttemptReportDrawer from "@/components/IngestAttemptReportDrawer";
import {
  buildIngestAttemptReport,
  buildRedactedReportForClipboard,
} from "@/lib/ingestAttemptReportRules";
import {
  importRunnerReport,
  persistAttempts,
  readAttemptsFromStorage,
  summarizeAttempts,
  type LocalIngestAttempt,
} from "@/lib/ingestAttemptLocalDiagnosticsRules";

export default function EcowittBridgeStatus() {
  const { toast } = useToast();
  const [attempts, setAttempts] = useState<LocalIngestAttempt[]>([]);
  const [pasted, setPasted] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setAttempts(readAttemptsFromStorage(window.localStorage));
    }
  }, []);

  const summary = useMemo(() => summarizeAttempts(attempts), [attempts]);

  const latestReport = useMemo(() => {
    const latest = summary.latest;
    if (!latest) return null;
    return buildIngestAttemptReport({
      url: latest.url,
      token: null,
      tentId: latest.tentId,
      plantId: latest.plantId,
      metricKeys: latest.metricKeys,
      response:
        latest.httpStatus !== null ? { status: latest.httpStatus, body: "" } : null,
      dryRun: latest.status === "dry_run",
      normalizerReasons: latest.reasons.length > 0 ? latest.reasons : undefined,
    });
  }, [summary.latest]);

  const handleImport = useCallback(() => {
    const result = importRunnerReport(pasted);
    if (result.ok !== true) {
      const reason: string = (result as { ok: false; reason: string }).reason;
      toast({
        title: "Could not import report",
        description:
          reason === "invalid_json"
            ? "Pasted text is not valid JSON."
            : reason === "token_leak_blocked"
              ? "Report contained token-shaped values; blocked for safety."
              : "Report shape is invalid.",
        variant: "destructive",
      });
      return;
    }
    const attempt = result.attempt;
    setAttempts((prev) => {
      const next = [attempt, ...prev];
      if (typeof window !== "undefined") {
        persistAttempts(window.localStorage, next);
      }
      return next;
    });
    setPasted("");
    toast({ title: "Report imported", description: "Stored locally only." });
  }, [pasted, toast]);

  const handleClear = useCallback(() => {
    setAttempts([]);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(
        "verdant.operator.ecowitt-bridge-attempts.v1",
      );
    }
  }, []);

  const handleCopyLatest = useCallback(() => {
    if (!latestReport) return;
    const json = JSON.stringify(
      buildRedactedReportForClipboard(latestReport),
      null,
      2,
    );
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(json);
      toast({ title: "Copied redacted report" });
    }
  }, [latestReport, toast]);

  return (
    <div
      className="container mx-auto max-w-3xl space-y-6 p-4 md:p-6"
      data-testid="ecowitt-bridge-status-page"
    >
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Ecowitt Bridge Status</h1>
        <p className="text-sm text-muted-foreground">
          Read-only operator diagnostics for local Ecowitt bridge attempts.
          Diagnostics are local/redacted. Bridge tokens are never shown.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Summary</CardTitle>
        </CardHeader>
        <CardContent>
          {summary.total === 0 ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="ecowitt-bridge-status-empty"
            >
              No Ecowitt bridge attempts recorded in this browser yet.
            </p>
          ) : (
            <dl
              className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs"
              data-testid="ecowitt-bridge-status-summary"
            >
              <Stat label="Total" value={summary.total} />
              <Stat label="Accepted" value={summary.accepted} testid="stat-accepted" />
              <Stat label="Rejected" value={summary.rejected} testid="stat-rejected" />
              <Stat label="Dry-run" value={summary.dryRun} testid="stat-dry-run" />
              <Stat label="Network err" value={summary.networkError} testid="stat-network-error" />
              <Stat label="Unknown" value={summary.unknown} />
              <Stat
                label="Last classification"
                value={summary.lastClassification ?? "—"}
                testid="stat-last-classification"
              />
              <Stat
                label="Last reason"
                value={summary.lastRejectionReason ?? "—"}
              />
              <Stat label="Provider" value={summary.lastProvider ?? "—"} />
              <Stat label="Transport" value={summary.lastTransport ?? "—"} />
              <Stat label="Topic" value={summary.lastTopic ?? "—"} />
              <Stat
                label="Metric keys"
                value={
                  summary.lastMetricKeys.length > 0
                    ? summary.lastMetricKeys.join(", ")
                    : "—"
                }
              />
            </dl>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDrawerOpen(true)}
              disabled={!latestReport}
              data-testid="ecowitt-bridge-view-latest"
            >
              View latest report
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopyLatest}
              disabled={!latestReport}
              data-testid="ecowitt-bridge-copy-latest"
            >
              Copy redacted report
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleClear}
              disabled={summary.total === 0}
              data-testid="ecowitt-bridge-clear"
            >
              Clear local diagnostics
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Paste redacted report JSON</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={6}
            placeholder='{"status":"dry_run","classification":"dry_run", ...}'
            data-testid="ecowitt-bridge-paste-input"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleImport}
              disabled={pasted.trim().length === 0}
              data-testid="ecowitt-bridge-import"
            >
              Import report
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Reports are stored only in this browser. Bridge tokens are
            re-redacted on import and never persisted.
          </p>
        </CardContent>
      </Card>

      <EcowittSnapshotTrustExamples />

      <IngestAttemptReportDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        report={latestReport}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  testid,
}: {
  label: string;
  value: number | string;
  testid?: string;
}) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium" data-testid={testid}>
        {value}
      </dd>
    </div>
  );
}
