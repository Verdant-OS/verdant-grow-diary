/**
 * PhenoSamplingWorkspaceTools — rating summary, side-by-side comparison,
 * per-candidate history, and export-to-PDF (browser print) button.
 *
 * All data comes from the in-memory PhenoSamplingProvider — no persistence,
 * no AI, no Action Queue, no automation, no device control, no sensor
 * ingest, no schema writes.
 */
import { useMemo, useState } from "react";
import { usePhenoSampling } from "@/context/PhenoSamplingContext";
import {
  summarizeByCandidate,
  summarizeByTester,
  groupByCandidate,
  historyForCandidate,
  openCandidateReport,
} from "@/lib/pheno/phenoSamplingReport";

export interface PhenoSamplingWorkspaceToolsProps {
  candidates: readonly { candidateId: string; candidateLabel?: string | null }[];
}

const cellClass = "border border-border px-2 py-1 text-left align-top";

export default function PhenoSamplingWorkspaceTools({
  candidates,
}: PhenoSamplingWorkspaceToolsProps) {
  const { submissions } = usePhenoSampling();
  const candidateIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of candidates) set.add(c.candidateId);
    for (const s of submissions) set.add(s.candidateId);
    return Array.from(set).sort();
  }, [candidates, submissions]);
  const [focusCandidate, setFocusCandidate] = useState<string>("");
  const activeCandidate = focusCandidate || candidateIds[0] || "";

  const summary = useMemo(() => summarizeByCandidate(submissions), [submissions]);
  const perTester = useMemo(() => summarizeByTester(submissions), [submissions]);
  const compareRows = useMemo(
    () => (activeCandidate ? groupByCandidate(submissions, activeCandidate) : []),
    [submissions, activeCandidate],
  );
  const history = useMemo(
    () => (activeCandidate ? historyForCandidate(submissions, activeCandidate) : []),
    [submissions, activeCandidate],
  );

  const candidateDescriptorFor = (id: string) =>
    candidates.find((c) => c.candidateId === id) ?? { candidateId: id };

  return (
    <section
      data-testid="pheno-sampling-tools"
      className="space-y-6 rounded-lg border border-border bg-card p-4"
    >
      <header>
        <h2 className="text-lg font-semibold">Sampling reports</h2>
        <p className="text-xs text-muted-foreground">
          Observational summaries of tester feedback. Compare across testers
          before making selections — ash color and oil ring stay observations.
        </p>
      </header>

      {/* 1. Rating summary table */}
      <div data-testid="pheno-sampling-summary">
        <h3 className="text-sm font-semibold">Rating summary by candidate</h3>
        {summary.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            No tester feedback recorded yet.
          </p>
        ) : (
          <table className="mt-2 w-full text-xs">
            <thead>
              <tr>
                <th className={cellClass}>Candidate</th>
                <th className={cellClass}>Submissions</th>
                <th className={cellClass}>Average overall</th>
                <th className={cellClass}>Ratings</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((row) => (
                <tr
                  key={row.candidateId}
                  data-testid={`pheno-summary-row-${row.candidateId}`}
                  data-average={row.averageOverall ?? ""}
                  data-count={row.submissions}
                >
                  <td className={cellClass}>{row.candidateId}</td>
                  <td className={cellClass}>{row.submissions}</td>
                  <td className={cellClass}>
                    {row.averageOverall == null ? "—" : row.averageOverall}
                  </td>
                  <td className={cellClass}>
                    {row.ratings.map((r) => (r == null ? "—" : r)).join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {perTester.length > 0 && (
          <>
            <h3 className="mt-4 text-sm font-semibold">Overall rating by tester</h3>
            <table
              data-testid="pheno-sampling-tester-summary"
              className="mt-2 w-full text-xs"
            >
              <thead>
                <tr>
                  <th className={cellClass}>Tester</th>
                  <th className={cellClass}>Candidate</th>
                  <th className={cellClass}>Overall</th>
                  <th className={cellClass}>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {perTester.map((row, i) => (
                  <tr key={i}>
                    <td className={cellClass}>{row.testerCode}</td>
                    <td className={cellClass}>{row.candidateId}</td>
                    <td className={cellClass}>
                      {row.overall == null ? "—" : row.overall}
                    </td>
                    <td className={cellClass}>{row.submittedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* Candidate picker for comparison + history + PDF */}
      <div>
        <label className="flex items-center gap-2 text-sm">
          <span className="font-medium">Focus candidate</span>
          <select
            data-testid="pheno-sampling-focus-candidate"
            value={activeCandidate}
            onChange={(e) => setFocusCandidate(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1 text-sm"
          >
            <option value="">Select candidate…</option>
            {candidateIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
          {activeCandidate && (
            <button
              type="button"
              data-testid="pheno-sampling-export-pdf"
              onClick={() =>
                openCandidateReport(
                  candidateDescriptorFor(activeCandidate),
                  submissions,
                )
              }
              className="rounded border border-border bg-secondary px-2 py-1 text-xs font-medium"
            >
              Export PDF report
            </button>
          )}
        </label>
      </div>

      {/* 2. Side-by-side comparison */}
      {activeCandidate && (
        <div data-testid="pheno-sampling-comparison" data-candidate={activeCandidate}>
          <h3 className="text-sm font-semibold">
            Side-by-side comparison — {activeCandidate}
          </h3>
          {compareRows.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              No tester feedback recorded for this candidate yet.
            </p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className={cellClass}>Field</th>
                    {compareRows.map((s) => (
                      <th key={s.id} className={cellClass}>
                        {s.testerCode || "(anonymous)"}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Dry hit aroma", "dryHit"],
                    ["Burn quality", "burnQuality"],
                    ["Ash color", "ashColor"],
                    ["Oil ring observation", "oilRing"],
                    ["Effect notes", "effect"],
                    ["Flavor notes", "flavor"],
                    ["Overall rating", "overall"],
                  ].map(([label, key]) => (
                    <tr key={key} data-testid={`pheno-compare-row-${key}`}>
                      <th className={cellClass}>{label}</th>
                      {compareRows.map((s) => {
                        const value = (s as unknown as Record<string, unknown>)[key];
                        return (
                          <td key={s.id} className={cellClass}>
                            {value == null || value === "" ? "—" : String(value)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 4. History panel */}
      {activeCandidate && (
        <div data-testid="pheno-sampling-history" data-candidate={activeCandidate}>
          <h3 className="text-sm font-semibold">
            History — {activeCandidate}
          </h3>
          {history.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">No history yet.</p>
          ) : (
            <ol className="mt-2 space-y-2 text-sm">
              {history.map((s) => (
                <li
                  key={s.id}
                  data-testid={`pheno-history-row-${s.id}`}
                  data-submitted-at={s.submittedAt}
                  className="rounded border border-border/60 bg-background/60 p-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {s.testerCode || "(anonymous)"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {s.submittedAt}
                    </span>
                  </div>
                  <div className="text-xs">
                    Overall: {s.overall == null ? "—" : s.overall}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {[s.dryHit, s.flavor, s.effect, s.notes]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
