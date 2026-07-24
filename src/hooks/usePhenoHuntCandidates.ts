/**
 * usePhenoHuntCandidates — read-only hook that loads a real pheno hunt's
 * candidates for the comparison surface. RLS enforces ownership. No writes.
 */
import { useCallback, useEffect, useState } from "react";
import { loadPhenoHuntCandidates, type PhenoHuntSummary } from "@/lib/phenoHuntCandidatesService";
import type { PhenoCandidateInput } from "@/lib/phenoComparisonViewModel";

export type PhenoHuntCandidatesStatus = "idle" | "loading" | "ok" | "error";

export interface UsePhenoHuntCandidatesState {
  status: PhenoHuntCandidatesStatus;
  hunt: PhenoHuntSummary | null;
  candidates: PhenoCandidateInput[];
  error: string | null;
  /** Re-run the read (retry affordance for the error state). Still read-only. */
  reload: () => void;
}

export function usePhenoHuntCandidates(
  huntId: string | null | undefined,
): UsePhenoHuntCandidatesState {
  const [status, setStatus] = useState<PhenoHuntCandidatesStatus>("idle");
  const [hunt, setHunt] = useState<PhenoHuntSummary | null>(null);
  const [candidates, setCandidates] = useState<PhenoCandidateInput[]>([]);
  const [error, setError] = useState<string | null>(null);

  const id = typeof huntId === "string" && huntId.trim().length > 0 ? huntId.trim() : null;

  // Bumping the token re-runs the load effect with identical inputs.
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    if (!id) {
      setStatus("idle");
      setHunt(null);
      setCandidates([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setStatus("loading");
    setError(null);
    loadPhenoHuntCandidates(id)
      .then((result) => {
        if (cancelled) return;
        if (result.ok === true) {
          setHunt(result.hunt);
          setCandidates(result.candidates);
          setStatus("ok");
          return;
        }
        setHunt(null);
        setCandidates([]);
        setError(result.error);
        setStatus("error");
      })
      .catch(() => {
        if (cancelled) return;
        setHunt(null);
        setCandidates([]);
        setError("Could not load this pheno hunt.");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [id, reloadToken]);

  return { status, hunt, candidates, error, reload };
}
