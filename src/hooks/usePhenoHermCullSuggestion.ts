/**
 * usePhenoHermCullSuggestion — thin mutation hook for the suggest-only herm →
 * "consider removing" flow. On the grower's confirmation it queues ONE
 * status="pending_approval" Action Queue row (never removes a plant, never
 * targets a device, never auto-approves).
 */
import { useState, useCallback } from "react";
import { queueHermCullSuggestion } from "@/lib/phenoActionQueueService";

export interface UsePhenoHermCullSuggestionState {
  queuing: string | null;
  queuedPlantIds: ReadonlySet<string>;
  error: string | null;
  queueRemoval: (input: {
    observationId: string;
    candidateLabel: string;
    growId: string;
    plantId: string;
    tentId?: string | null;
  }) => Promise<boolean>;
}

export function usePhenoHermCullSuggestion(): UsePhenoHermCullSuggestionState {
  const [queuing, setQueuing] = useState<string | null>(null);
  const [queuedPlantIds, setQueuedPlantIds] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const queueRemoval = useCallback(
    async (input: {
      observationId: string;
      candidateLabel: string;
      growId: string;
      plantId: string;
      tentId?: string | null;
    }) => {
      setQueuing(input.plantId);
      setError(null);
      const res = await queueHermCullSuggestion(input);
      setQueuing(null);
      if (res.ok === true) {
        setQueuedPlantIds((prev) => new Set(prev).add(input.plantId));
        return true;
      }
      setError(res.error);
      return false;
    },
    [],
  );

  return { queuing, queuedPlantIds, error, queueRemoval };
}
