/**
 * usePhenoGenerationProgress — loads a hunt's generation chain and reduces it
 * to the pure cross-generation progress model.
 *
 * Best-effort and non-blocking: the workspace renders fully whether or not
 * this resolves, and a hunt with no linked parent simply yields a
 * single-generation model the presenter reports honestly.
 */
import { useEffect, useMemo, useState } from "react";
import { loadGenerationChain } from "@/lib/phenoGenerationProgressService";
import {
  buildGenerationChain,
  buildGenerationProgress,
  type GenerationHuntInput,
  type GenerationProgressModel,
} from "@/lib/phenoObjectiveGenerationRules";

const EMPTY_MODEL: GenerationProgressModel = Object.freeze({
  generations: [],
  trends: [],
  comparable: false,
});

export function usePhenoGenerationProgress(
  huntId: string | null | undefined,
): GenerationProgressModel {
  const id = typeof huntId === "string" && huntId.trim() !== "" ? huntId.trim() : null;
  const [huntsById, setHuntsById] = useState<Record<string, GenerationHuntInput>>({});

  useEffect(() => {
    if (!id) {
      setHuntsById({});
      return;
    }
    let cancelled = false;
    loadGenerationChain(id)
      .then((chain) => {
        if (!cancelled) setHuntsById(chain);
      })
      .catch(() => {
        if (!cancelled) setHuntsById({});
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return useMemo(() => {
    if (!id) return EMPTY_MODEL;
    const chain = buildGenerationChain(id, huntsById);
    if (chain.length === 0) return EMPTY_MODEL;
    return buildGenerationProgress(chain);
  }, [id, huntsById]);
}
