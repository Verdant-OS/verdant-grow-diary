/**
 * OneTentLiveProofReport — print-friendly, sanitized report presenter.
 *
 * Read-only. Renders the structured report built by
 * `buildOneTentLiveProofReport`. Contains no write controls and never
 * exposes internal ids, raw payloads, or secrets.
 *
 * Hidden from regular layout by default; shown for `@media print`.
 * Also rendered with `data-testid` so tests can assert content.
 */
import type { ProofReport } from "@/lib/oneTentLiveProofViewModel";

export default function OneTentLiveProofReport({
  report,
  visible = false,
}: {
  report: ProofReport;
  visible?: boolean;
}) {
  return (
    <section
      data-testid="one-tent-live-proof-report"
      className={
        visible
          ? "rounded-md border border-border p-3 space-y-2 text-sm"
          : "sr-only print:not-sr-only print:block print:p-4 print:text-sm"
      }
      aria-label="One-Tent Live Proof Report"
    >
      <header className="space-y-0.5">
        <h2 className="text-base font-semibold">{report.title}</h2>
        <p
          className="text-xs text-muted-foreground"
          data-testid="one-tent-live-proof-report-generated"
        >
          Generated: {report.generatedAtLabel}
        </p>
      </header>

      <div>
        <p className="text-xs font-medium">Context</p>
        <ul className="text-xs list-disc pl-5">
          {report.contextLines.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      </div>

      <div>
        <p className="text-xs font-medium">Safety notes</p>
        <ul className="text-xs list-disc pl-5">
          {report.safetyNotes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </div>

      <div>
        <p className="text-xs font-medium">Checklist</p>
        <ol className="space-y-1">
          {report.steps.map((s) => (
            <li
              key={s.id}
              className="text-xs"
              data-testid={`one-tent-live-proof-report-step-${s.id}`}
            >
              <div>
                <span className="font-medium">
                  {s.id}. {s.label}
                </span>{" "}
                — {s.statusLabel}
              </div>
              {s.evidenceSummary ? (
                <div className="text-muted-foreground">
                  Evidence: {s.evidenceSummary}
                </div>
              ) : null}
              {s.missingEvidence ? (
                <div className="text-amber-700 dark:text-amber-300">
                  {s.missingEvidence}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      </div>

      {report.closingLine ? (
        <p
          className="text-xs font-semibold"
          data-testid="one-tent-live-proof-report-closing"
        >
          {report.closingLine}
        </p>
      ) : null}
    </section>
  );
}
