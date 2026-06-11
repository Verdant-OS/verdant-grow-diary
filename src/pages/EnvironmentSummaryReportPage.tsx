/**
 * EnvironmentSummaryReportPage — read-only premium environment summary
 * report page. Date range, drilldown, PDF/print export.
 *
 * Read-only. No Supabase writes. No automation. No device control.
 * Consumes existing diary_entries via useDiaryEntries (read-only) and
 * builds the report ViewModel from pure helpers.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Download, FileBarChart } from "lucide-react";
import EnvironmentSummaryReport from "@/components/EnvironmentSummaryReport";
import EnvironmentIssueDrilldown from "@/components/EnvironmentIssueDrilldown";
import { useDiaryEntries } from "@/hooks/use-diary-entries";
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
  buildEnvironmentSummaryPdfFilename,
  buildEnvironmentSummaryPdfPayload,
} from "@/lib/environmentSummaryPdfRules";

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

  // Keep local state in sync with URL changes.
  useEffect(() => {
    if (startParam) setStartDate(startParam);
    if (endParam) setEndDate(endParam);
  }, [startParam, endParam]);

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

  const handleDownloadPdf = () => {
    if (typeof window === "undefined") return;
    // Pure helper produces a deterministic payload + filename.
    const payload = buildEnvironmentSummaryPdfPayload({
      report,
      startDate,
      endDate,
      selectedIssueId: issueParam ?? null,
    });
    const prevTitle = document.title;
    document.title = payload.filename.replace(/\.pdf$/, "");
    try {
      window.print();
    } finally {
      // Restore title after a tick to let the print dialog read it.
      setTimeout(() => {
        document.title = prevTitle;
      }, 0);
    }
  };

  const pdfFilename = buildEnvironmentSummaryPdfFilename(startDate, endDate);

  return (
    <div
      className="container max-w-4xl py-6 space-y-4"
      data-testid="environment-summary-report-page"
    >
      <PageHeader
        title="Environment Summary"
        description="Read-only premium report — aggregated greenhouse rule results over a date range."
        icon={<FileBarChart className="h-5 w-5" />}
        actions={
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
        }
      />

      <div
        className="rounded-xl border border-border/40 bg-card/40 p-3 flex flex-wrap items-end gap-2"
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

      {diaryQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : report.totalChecks === 0 && rangeValid ? (
        <EmptyState
          icon={<FileBarChart className="h-5 w-5" />}
          title="No Environment Check entries"
          description="No environment checks found in this date range."
        />
      ) : (
        <EnvironmentSummaryReport report={report} />
      )}

      {selectedIssue && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {selectedIssue.drilldownLabel}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearIssue}
              data-testid="env-report-clear-issue"
            >
              Clear drilldown
            </Button>
          </div>
          <EnvironmentIssueDrilldown
            issue={selectedIssue}
            relatedChecks={relatedChecks}
          />
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Read-only report. No device control or automation was performed.
      </p>
    </div>
  );
}
