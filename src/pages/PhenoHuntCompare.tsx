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
import { Link, useParams, useSearchParams } from "react-router-dom";
import PhenoComparisonView from "@/components/PhenoComparisonView";
import { usePhenoHuntCandidates } from "@/hooks/usePhenoHuntCandidates";
import { derivePhenoCompareReadinessFromCandidates } from "@/lib/phenoComparisonActionState";
import {
  PHENO_COMPARISON_READY_DEFINITION,
  PHENO_STATUS_LABELS,
} from "@/constants/phenoOnboardingCopy";
import { readCohortFromSearch, restrictCohortToHunt } from "@/lib/phenoComparisonCohort";
import PhenoCandidateEvidenceCoverage from "@/components/PhenoCandidateEvidenceCoverage";
import { usePhenoEvidencePackets } from "@/hooks/usePhenoEvidencePackets";
import { phenoCandidateDisplayLabel } from "@/lib/phenoCandidateIdentity";

export default function PhenoHuntCompare() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { status, hunt, candidates, error } = usePhenoHuntCandidates(id);

  // Grower-selected cohort (deep-linked from the workspace). Hunt isolation:
  // requested ids are intersected with THIS hunt's own candidates, so an id
  // from another hunt can never enter the comparison. With no (valid) cohort
  // param the full hunt is shown — the existing behaviour.
  const requestedCohort = useMemo(() => readCohortFromSearch(searchParams), [searchParams]);
  const cohortActive = requestedCohort.length >= 2;

  // Manual evidence packets for the COMPARED candidates only (cohort or the
  // hunt's loaded candidates). Read-only coverage; separate from readiness.
  const comparedIdsForPackets = useMemo(() => {
    if (!cohortActive) return candidates.map((c) => c.candidateId);
    const ids = new Set(
      restrictCohortToHunt(
        requestedCohort,
        candidates.map((c) => c.candidateId),
      ),
    );
    return candidates.filter((c) => ids.has(c.candidateId)).map((c) => c.candidateId);
  }, [cohortActive, requestedCohort, candidates]);
  const evidencePackets = usePhenoEvidencePackets({
    huntId: id ?? null,
    plantIds: comparedIdsForPackets,
    configuredGoals: hunt?.evidenceGoals ?? [],
  });
  const comparedCandidates = useMemo(() => {
    if (!cohortActive) return candidates;
    const ids = new Set(
      restrictCohortToHunt(
        requestedCohort,
        candidates.map((c) => c.candidateId),
      ),
    );
    return candidates.filter((c) => ids.has(c.candidateId));
  }, [cohortActive, requestedCohort, candidates]);

  const readiness = useMemo(
    () => derivePhenoCompareReadinessFromCandidates(id, comparedCandidates),
    [id, comparedCandidates],
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
      {cohortActive ? (
        <section
          data-testid="pheno-hunt-compare-cohort-banner"
          className="container mx-auto max-w-6xl px-4 pt-6"
        >
          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            Comparing your selected {comparedCandidates.length} of {candidates.length} candidates.{" "}
            {id ? (
              <Link
                to={`/pheno-hunts/${id}/compare`}
                data-testid="pheno-hunt-compare-cohort-show-all"
                className="underline underline-offset-2"
              >
                Compare the whole hunt instead
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}
      {notReady ? (
        <section
          data-testid="pheno-hunt-compare-readiness-warning"
          data-readiness={readiness.readiness}
          role="alert"
          aria-label="Not comparison-ready yet"
          className="container mx-auto max-w-6xl px-4 pt-6"
        >
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300 space-y-2">
            <p className="font-semibold">{PHENO_STATUS_LABELS.notComparisonReadyYet}</p>
            <p className="text-xs">
              This hunt is missing evidence needed for an honest candidate comparison.
            </p>
            <p className="text-xs opacity-90">{PHENO_COMPARISON_READY_DEFINITION}</p>
            {readiness.reason ? (
              <p className="text-xs" data-testid="pheno-hunt-compare-readiness-warning-reason">
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
      {comparedCandidates.length > 0 ? (
        <section
          data-testid="pheno-hunt-compare-evidence-coverage"
          aria-label="Manual evidence coverage for compared candidates"
          className="container mx-auto max-w-6xl px-4 pt-4 space-y-2"
        >
          <h2 className="text-sm font-semibold">Manual evidence coverage</h2>
          <p className="text-xs text-muted-foreground">
            Configured-goal receipts from Quick Log. This is coverage of what you recorded — it is
            separate from readiness and does not compare or pick candidates.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {comparedCandidates.map((c) => (
              <div key={c.candidateId} className="space-y-1">
                <p className="text-xs font-medium">{phenoCandidateDisplayLabel(c)}</p>
                <PhenoCandidateEvidenceCoverage
                  packet={evidencePackets.packets.get(c.candidateId) ?? null}
                  status={evidencePackets.status}
                  allowRecordActions={false}
                  data-testid={`compare-evidence-coverage-${c.candidateId}`}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <PhenoComparisonView
        inputs={comparedCandidates}
        mode="live"
        huntName={hunt?.name ?? null}
        allowConclusions={!notReady}
      />
    </>
  );
}
