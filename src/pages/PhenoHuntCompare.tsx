/**
 * PhenoHuntCompare — LIVE read-only comparison for one pheno hunt
 * (/pheno-hunts/:id/compare).
 *
 * Reads the hunt's own candidates (RLS-scoped SELECT via usePhenoHuntCandidates)
 * and renders them through the shared PhenoComparisonView in "live" mode. Still
 * read-only: no writes, no AI, no Action Queue, no automation, no device
 * control. Just a real hunt's evidence, side-by-side, honest about gaps.
 */
import { useParams } from "react-router-dom";
import PhenoComparisonView from "@/components/PhenoComparisonView";
import { usePhenoHuntCandidates } from "@/hooks/usePhenoHuntCandidates";

export default function PhenoHuntCompare() {
  const { id } = useParams<{ id: string }>();
  const { status, hunt, candidates, error } = usePhenoHuntCandidates(id);

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

  return <PhenoComparisonView inputs={candidates} mode="live" huntName={hunt?.name ?? null} />;
}
