/**
 * EnvironmentSummaryPrintCoverPage — presenter-only.
 *
 * Renders a printable cover page included inside the report's print
 * section. Visible at all times on screen above the report; the print
 * stylesheet forces a page break after the cover page when printing.
 *
 * No I/O. No data fetching. No private internal IDs are rendered.
 */
import type { EnvironmentSummaryReportViewModel } from "@/lib/environmentSummaryReportViewModel";
import { PRINT_SAFETY_FOOTER } from "@/lib/environmentSummaryPrintRules";

export interface EnvironmentSummaryPrintCoverPageProps {
  growerName?: string | null;
  greenhouseName?: string | null;
  dateRangeLabel: string;
  generatedAtLabel: string;
  report: EnvironmentSummaryReportViewModel;
  mode?: "full_report" | "drilldown";
  selectedIssueLabel?: string | null;
  "data-testid"?: string;
}

const GROWER_FALLBACK = "Grower not specified";
const GREENHOUSE_FALLBACK = "Greenhouse not specified";

export default function EnvironmentSummaryPrintCoverPage({
  growerName,
  greenhouseName,
  dateRangeLabel,
  generatedAtLabel,
  report,
  mode = "full_report",
  selectedIssueLabel,
  ...rest
}: EnvironmentSummaryPrintCoverPageProps) {
  const testId = rest["data-testid"] ?? "env-report-print-cover-page";
  const grower =
    typeof growerName === "string" && growerName.trim().length > 0
      ? growerName.trim()
      : GROWER_FALLBACK;
  const greenhouse =
    typeof greenhouseName === "string" && greenhouseName.trim().length > 0
      ? greenhouseName.trim()
      : GREENHOUSE_FALLBACK;
  const top3 = report.topIssues.slice(0, 3);

  return (
    <section
      data-testid={testId}
      data-print-card="cover"
      className="print-cover-page rounded-xl border border-border/40 bg-card/40 p-5 space-y-4"
    >
      <header className="print-cover-section space-y-1">
        <h2 className="print-cover-title font-display text-2xl font-semibold tracking-tight">
          Environment Summary Report
        </h2>
        <p className="print-cover-subtitle text-sm text-muted-foreground">
          {mode === "drilldown"
            ? "Read-only grow review — selected issue drilldown"
            : "Read-only grow review"}
        </p>
      </header>

      <dl className="print-cover-meta print-cover-section grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Grower</dt>
        <dd data-testid={`${testId}-grower`}>{grower}</dd>
        <dt className="text-muted-foreground">Greenhouse</dt>
        <dd data-testid={`${testId}-greenhouse`}>{greenhouse}</dd>
        <dt className="text-muted-foreground">Date range</dt>
        <dd data-testid={`${testId}-range`}>{dateRangeLabel}</dd>
        <dt className="text-muted-foreground">Generated</dt>
        <dd data-testid={`${testId}-generated`}>{generatedAtLabel}</dd>
        {mode === "drilldown" && selectedIssueLabel ? (
          <>
            <dt className="text-muted-foreground">Selected issue</dt>
            <dd data-testid={`${testId}-issue`}>{selectedIssueLabel}</dd>
          </>
        ) : null}
      </dl>

      <div className="print-cover-summary print-cover-section text-xs space-y-1">
        <p className="font-medium">Status counts</p>
        <ul
          className="grid grid-cols-2 gap-x-3 gap-y-0.5"
          data-testid={`${testId}-status-counts`}
        >
          <li>Valid: {report.statusCounts.valid}</li>
          <li>Review required: {report.statusCounts.review_required}</li>
          <li>DST-ambiguous: {report.statusCounts.dst_ambiguous}</li>
          <li>Invalid: {report.statusCounts.invalid}</li>
        </ul>
      </div>

      {top3.length > 0 ? (
        <div className="print-cover-summary print-cover-section text-xs space-y-1">
          <p className="font-medium">Top issues</p>
          <ul
            className="space-y-0.5"
            data-testid={`${testId}-top-issues`}
          >
            {top3.map((i) => (
              <li key={i.ruleId}>
                {i.label} ×{i.count} ({i.severity})
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p
        className="print-cover-safety print-cover-section text-[11px] text-muted-foreground"
        data-testid={`${testId}-safety`}
      >
        {PRINT_SAFETY_FOOTER}
      </p>
    </section>
  );
}
