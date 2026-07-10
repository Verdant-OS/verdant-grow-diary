/**
 * PhenoHuntCompare — LIVE read-only comparison for one pheno hunt
 * (/pheno-hunts/:id/compare).
 *
 * Reads the hunt's own candidates (RLS-scoped SELECT via usePhenoHuntCandidates)
 * and renders them through the shared PhenoComparisonView in "live" mode. Still
 * read-only: no writes, no AI, no Action Queue, no automation, no device
 * control. Just a real hunt's evidence, side-by-side, honest about gaps.
 *
 * Direct URL access must remain honest: even if the workspace's Compare
 * button is disabled, someone can type this URL. When the hunt is not
 * comparison-ready we render a warning banner and never present the page
 * as a valid ranking / keeper-picking surface.
 */
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import PhenoComparisonView from "@/components/PhenoComparisonView";
import { usePhenoHuntCandidates } from "@/hooks/usePhenoHuntCandidates";
import { derivePhenoCompareReadinessFromCandidates } from "@/lib/phenoComparisonActionState";
import {
  PHENO_COMPARISON_READY_DEFINITION,
  PHENO_STATUS_LABELS,
} from "@/constants/phenoOnboardingCopy";

export default function PhenoHuntCompare() {
  const { id } = useParams<{ id: string }>();
  const { status, hunt, candidates, error } = usePhenoHuntCandidates(id);

  const readiness = useMemo(
    () => derivePhenoCompareReadinessFromCandidates(id, candidates),
    [id, candidates],
  );

  if (status === "loading" || status === "idle") {
    return (
      <main
        data-testid="pheno-hunt-compare-loading"
        className="container mx-auto max-w-6xl px-4 py-6"
      >
        <p className="text-sm text-muted-foreground">Loading this pheno hunt…</p>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main
        data-testid="pheno-hunt-compare-error"
        role="alert"
        className="container mx-auto max-w-6xl px-4 py-6"
      >
        <p className="text-sm text-muted-foreground">
          {error ?? "Could not load this pheno hunt."}
        </p>
      </main>
    );
  }

  const notReady = readiness.readiness !== "comparison_ready";
  const workspaceHref = id ? `/pheno-hunts/${id}/workspace` : null;

  return (
    <>
      {notReady ? (
        <section
          data-testid="pheno-hunt-compare-readiness-warning"
          data-readiness={readiness.readiness}
          role="alert"
          aria-label="Not comparison-ready yet"
          className="container mx-auto max-w-6xl px-4 pt-6"
        >
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300 space-y-2">
            <p className="font-semibold">
              {PHENO_STATUS_LABELS.notComparisonReadyYet}
            </p>
            <p className="text-xs">
              This hunt is missing evidence needed for an honest candidate comparison.
            </p>
            <p className="text-xs opacity-90">
              {PHENO_COMPARISON_READY_DEFINITION}
            </p>
            {readiness.reason ? (
              <p
                className="text-xs"
                data-testid="pheno-hunt-compare-readiness-warning-reason"
              >
                {readiness.reason}
              </p>
            ) : null}
            {readiness.missingEvidenceItems.length > 0 ? (
              <ul
                className="list-disc pl-4 text-xs space-y-0.5"
                data-testid="pheno-hunt-compare-readiness-warning-missing"
              >
                {readiness.missingEvidenceItems.map((m) => (
                  <li key={m.id} data-missing-id={m.id}>
                    <span>{m.message}</span>
                    {m.nextStepTarget && m.nextStepLabel ? (
                      <>
                        {" — "}
                        <Link
                          to={m.nextStepTarget}
                          className="underline underline-offset-2"
                          data-testid={`pheno-hunt-compare-readiness-warning-next-step-${m.id}`}
                        >
                          {m.nextStepLabel}
                        </Link>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {workspaceHref ? (
              <p className="text-xs">
                <Link
                  to={workspaceHref}
                  className="underline underline-offset-2"
                  data-testid="pheno-hunt-compare-readiness-warning-workspace-link"
                >
                  Back to hunt workspace
                </Link>
              </p>
            ) : null}
          </div>
        </section>
      ) : null}
      <PhenoComparisonView inputs={candidates} mode="live" huntName={hunt?.name ?? null} />
    </>
  );
}
