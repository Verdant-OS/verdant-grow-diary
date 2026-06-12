/**
 * EnvironmentSummaryReportPage — read-only premium environment summary
 * report page. Date range, drilldown, local print/save-as-PDF export.
 *
 * Read-only. No Supabase writes. No automation. No device control.
 * Premium-gated: non-premium users see an upgrade prompt instead of the
 * report. Audit logging is local-only (browser localStorage) — no
 * network, no Supabase, no analytics SDK.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Download, FileBarChart } from "lucide-react";
import EnvironmentSummaryReport from "@/components/EnvironmentSummaryReport";
import EnvironmentIssueDrilldown from "@/components/EnvironmentIssueDrilldown";
import EnvironmentSummaryPrintCoverPage from "@/components/EnvironmentSummaryPrintCoverPage";
import PaywallCta from "@/components/PaywallCta";
import { useDiaryEntries } from "@/hooks/use-diary-entries";
import { useMyEntitlements } from "@/hooks/useMyEntitlements";
import { buildPaywallCtaViewModel } from "@/lib/paywallCtaViewModel";
import {
  buildEnvironmentCheckDiaryViewModel,
  isEnvironmentCheckKind,
  type EnvironmentCheckDiaryViewModel,
} from "@/lib/environmentCheckViewModel";
import { buildEnvironmentSummaryReportViewModel } from "@/lib/environmentSummaryReportViewModel";
import {
  defaultEnvironmentSummaryRange,
  isValidEnvironmentSummaryRange,
} from "@/lib/environmentSummaryNavigationRules";
import {
  buildEnvironmentSummaryDrilldownPrintFilename,
  buildEnvironmentSummaryPrintFilename,
  buildEnvironmentSummaryPrintMetadata,
  PRINT_SAFETY_FOOTER,
} from "@/lib/environmentSummaryPrintRules";
import {
  readEnvironmentSummaryExportAuditEvents,
  recordEnvironmentSummaryExportAuditEvent,
} from "@/lib/environmentSummaryExportAuditRules";
import EnvironmentSummaryPrePrintModal from "@/components/EnvironmentSummaryPrePrintModal";
import EnvironmentSummaryExportHistoryPanel from "@/components/EnvironmentSummaryExportHistoryPanel";


type PrintMode = "full_report" | "drilldown";

function toViewModel(entry: any): EnvironmentCheckDiaryViewModel | null {
  if (!isEnvironmentCheckKind(entry?.kind)) return null;
  return buildEnvironmentCheckDiaryViewModel({
    entryId: entry.id ?? entry.entryId ?? String(entry.entry_at ?? ""),
    occurredAt: entry.entry_at ?? entry.occurredAt ?? new Date(0).toISOString(),
    kind: entry.kind ?? "environment",
    snapshot: entry.snapshot ?? entry.payload?.snapshot ?? null,
  });
}

export default function EnvironmentSummaryReportPage() {
  const [params, setParams] = useSearchParams();
  const defaults = useMemo(() => defaultEnvironmentSummaryRange(), []);
  const startParam = params.get("start");
  const endParam = params.get("end");
  const issueParam = params.get("issue");

  const [startDate, setStartDate] = useState(startParam ?? defaults.startDate);
  const [endDate, setEndDate] = useState(endParam ?? defaults.endDate);
  const [printMode, setPrintMode] = useState<PrintMode>("full_report");
  const [pendingPrintMode, setPendingPrintMode] = useState<PrintMode | null>(
    null,
  );
  const [exportHistoryRefreshKey, setExportHistoryRefreshKey] = useState(0);


  useEffect(() => {
    if (startParam) setStartDate(startParam);
    if (endParam) setEndDate(endParam);
  }, [startParam, endParam]);

  const { entitlement, loading: entitlementLoading } = useMyEntitlements();
  const isPremium = entitlement.capabilities.advancedExports === true;

  const diaryQuery = useDiaryEntries();
  const entries = diaryQuery.data ?? [];

  const rangeValid = isValidEnvironmentSummaryRange(startDate, endDate);

  const checksInRange = useMemo(() => {
    if (!rangeValid) return [];
    const startIso = `${startDate}T00:00:00.000Z`;
    const endIso = `${endDate}T23:59:59.999Z`;
    const out: EnvironmentCheckDiaryViewModel[] = [];
    for (const e of entries) {
      const ts = e?.entry_at;
      if (typeof ts !== "string") continue;
      if (ts < startIso || ts > endIso) continue;
      const vm = toViewModel(e);
      if (vm) out.push(vm);
    }
    return out;
  }, [entries, startDate, endDate, rangeValid]);

  const report = useMemo(
    () =>
      buildEnvironmentSummaryReportViewModel({
        startDate: rangeValid ? startDate : defaults.startDate,
        endDate: rangeValid ? endDate : defaults.endDate,
        checks: checksInRange,
        selectedIssueId: issueParam,
      }),
    [checksInRange, startDate, endDate, defaults, rangeValid, issueParam],
  );

  const selectedIssue =
    (issueParam && report.topIssues.find((i) => i.ruleId === issueParam)) ||
    null;

  const relatedChecks = useMemo(() => {
    if (!selectedIssue) return [];
    const ids = new Set(selectedIssue.relatedEntryIds);
    return checksInRange.filter((c) => ids.has(c.entryId));
  }, [checksInRange, selectedIssue]);

  const applyRange = () => {
    const next = new URLSearchParams(params);
    next.set("start", startDate);
    next.set("end", endDate);
    setParams(next, { replace: true });
  };

  const clearIssue = () => {
    const next = new URLSearchParams(params);
    next.delete("issue");
    setParams(next, { replace: true });
  };

  const printMeta = useMemo(
    () =>
      buildEnvironmentSummaryPrintMetadata({
        startDate,
        endDate,
        generatedAt: new Date(),
      }),
    [startDate, endDate],
  );
  const pdfFilename = buildEnvironmentSummaryPrintFilename(startDate, endDate);

  function triggerPrint(filename: string, mode: PrintMode) {
    if (typeof window === "undefined") return;
    setPrintMode(mode);
    if (typeof document !== "undefined") {
      try {
        document.body.dataset.environmentSummaryPrintMode = mode;
      } catch {
        // ignore
      }
    }
    const prevTitle = document.title;
    document.title = filename.replace(/\.pdf$/, "");
    try {
      window.print();
    } finally {
      setTimeout(() => {
        document.title = prevTitle;
        setPrintMode("full_report");
        try {
          if (typeof document !== "undefined") {
            document.body.dataset.environmentSummaryPrintMode = "full_report";
          }
        } catch {
          // ignore
        }
      }, 0);
    }
  }

  const handleDownloadPdf = () => {
    setPendingPrintMode("full_report");
  };

  const handleDownloadDrilldownPdf = () => {
    if (!selectedIssue) return;
    setPendingPrintMode("drilldown");
  };

  const handleConfirmPrint = () => {
    if (pendingPrintMode === "full_report") {
      recordEnvironmentSummaryExportAuditEvent({
        eventType: "full_report_print_opened",
        reportMode: "full_report",
        startDate,
        endDate,
      });
      setPendingPrintMode(null);
      setExportHistoryRefreshKey((k) => k + 1);
      triggerPrint(printMeta.filename, "full_report");
      return;
    }
    if (pendingPrintMode === "drilldown" && selectedIssue) {
      recordEnvironmentSummaryExportAuditEvent({
        eventType: "drilldown_print_opened",
        reportMode: "drilldown",
        startDate,
        endDate,
        issueRuleId: selectedIssue.ruleId,
        issueLabel: selectedIssue.label,
      });
      const filename = buildEnvironmentSummaryDrilldownPrintFilename(
        startDate,
        endDate,
        selectedIssue.ruleId,
      );
      setPendingPrintMode(null);
      setExportHistoryRefreshKey((k) => k + 1);
      triggerPrint(filename, "drilldown");
    }
  };

  const exportHistoryEvents = useMemo(
    () => readEnvironmentSummaryExportAuditEvents(),
    // refresh key bumps when we record a new event
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exportHistoryRefreshKey],
  );

  const handleReopenFromHistory = (input: {
    startDate: string;
    endDate: string;
    issueRuleId?: string | null;
  }) => {
    setStartDate(input.startDate);
    setEndDate(input.endDate);
    const next = new URLSearchParams(params);
    next.set("start", input.startDate);
    next.set("end", input.endDate);
    if (input.issueRuleId) {
      next.set("issue", input.issueRuleId);
    } else {
      next.delete("issue");
    }
    setParams(next, { replace: true });
  };


  const drilldownPdfFilename = selectedIssue
    ? buildEnvironmentSummaryDrilldownPrintFilename(
        startDate,
        endDate,
        selectedIssue.ruleId,
      )
    : null;

  // ----- Non-premium upgrade prompt -----
  if (!entitlementLoading && !isPremium) {
    const vm = buildPaywallCtaViewModel({
      featureTitle: "Unlock Environment Summary Reports",
      requiredPlanLabel: "Pro",
      unlockBullets: [
        "Aggregated environment checks across a date range",
        "Source labels for live, manual, CSV, demo, stale, and invalid readings",
        "Top greenhouse-rule issues with safe drilldown",
        "Visible DST-ambiguous and invalid windows",
        "Local print and save-as-PDF for grow review",
      ],
      secondaryCopy:
        "Reports are read-only. Verdant does not control equipment or automate changes.",
    });
    return (
      <div
        className="container max-w-3xl py-6 space-y-4"
        data-testid="environment-summary-report-page-locked"
      >
        <PageHeader
          title="Environment Summary"
          description="Premium report — aggregated greenhouse rule results over a date range."
          icon={<FileBarChart className="h-5 w-5" />}
        />
        <PaywallCta vm={vm} data-testid="env-report-paywall" />
      </div>
    );
  }

  return (
    <div
      className="container max-w-4xl py-6 space-y-4"
      data-testid="environment-summary-report-page"
      data-print-mode={printMode}
    >
      <PageHeader
        title="Environment Summary"
        description="Read-only premium report — aggregated greenhouse rule results over a date range."
        icon={<FileBarChart className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap gap-2 print-hidden">
            <Button
              onClick={handleDownloadPdf}
              variant="outline"
              size="sm"
              data-testid="env-report-download-pdf"
              aria-label="Download environment summary report PDF"
              data-filename={pdfFilename}
            >
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
            {selectedIssue && drilldownPdfFilename ? (
              <Button
                onClick={handleDownloadDrilldownPdf}
                variant="outline"
                size="sm"
                data-testid="env-report-download-drilldown-pdf"
                aria-label="Download current environment issue drilldown PDF"
                data-filename={drilldownPdfFilename}
              >
                <Download className="h-4 w-4" />
                Download drilldown PDF
              </Button>
            ) : null}
          </div>
        }
      />

      <div
        className="rounded-xl border border-border/40 bg-card/40 p-3 flex flex-wrap items-end gap-2 print-hidden"
        data-testid="env-report-range-controls"
      >
        <label className="text-xs space-y-1">
          <span className="block text-muted-foreground">Start date</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            data-testid="env-report-start-date"
            className="px-2 py-1 rounded-md border border-border/50 bg-background text-sm"
          />
        </label>
        <label className="text-xs space-y-1">
          <span className="block text-muted-foreground">End date</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            data-testid="env-report-end-date"
            className="px-2 py-1 rounded-md border border-border/50 bg-background text-sm"
          />
        </label>
        <Button
          variant="secondary"
          size="sm"
          onClick={applyRange}
          data-testid="env-report-apply-range"
        >
          Apply
        </Button>
        {!rangeValid && (
          <p
            data-testid="env-report-range-error"
            className="text-xs text-amber-300"
          >
            Start date must be on or before end date.
          </p>
        )}
      </div>

      <div
        data-print-section="environment-summary-report"
        data-print-mode={printMode}
        data-testid="env-report-print-section"
        className="space-y-4"
      >
        <EnvironmentSummaryPrintCoverPage
          dateRangeLabel={printMeta.dateRangeLabel}
          generatedAtLabel={printMeta.generatedAtLabel}
          report={report}
          mode={printMode}
          selectedIssueLabel={selectedIssue?.label ?? null}
        />

        <div
          data-print-full-report-only
          data-testid="env-report-full-section"
          className="space-y-4"
        >
          {diaryQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : report.totalChecks === 0 && rangeValid ? (
            <EmptyState
              icon={<FileBarChart className="h-5 w-5" />}
              title="No Environment Check entries"
              description="No environment checks found in this date range."
            />
          ) : (
            <div data-print-card="full-report">
              <EnvironmentSummaryReport report={report} />
            </div>
          )}
        </div>

        {selectedIssue && (
          <div
            className="space-y-2"
            data-print-drilldown-section
            data-testid="env-report-drilldown-section"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground">
                  {selectedIssue.drilldownLabel}
                </p>
                <span
                  className="print-page-indicator print-only text-[10px] uppercase tracking-wider text-muted-foreground"
                  data-testid="env-report-drilldown-page-indicator"
                  aria-hidden
                >
                  Page · of total
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearIssue}
                data-testid="env-report-clear-issue"
                className="print-hidden"
              >
                Clear drilldown
              </Button>
            </div>

            <div data-print-issue-card="selected">
              <EnvironmentIssueDrilldown
                issue={selectedIssue}
                relatedChecks={relatedChecks}
              />
            </div>
          </div>
        )}

        <p
          className="text-[11px] text-muted-foreground"
          data-testid="env-report-safety-footer"
        >
          {PRINT_SAFETY_FOOTER}
        </p>
      </div>

      <EnvironmentSummaryPrePrintModal
        open={pendingPrintMode !== null}
        onOpenChange={(o) => {
          if (!o) setPendingPrintMode(null);
        }}
        mode={pendingPrintMode ?? "full_report"}
        dateRangeLabel={printMeta.dateRangeLabel}
        generatedAtLabel={printMeta.generatedAtLabel}
        selectedIssueLabel={selectedIssue?.label ?? null}
        selectedIssueRuleId={selectedIssue?.ruleId ?? null}
        relatedCheckCount={
          pendingPrintMode === "drilldown" ? relatedChecks.length : undefined
        }
        onConfirm={handleConfirmPrint}
      />
    </div>
  );
}
