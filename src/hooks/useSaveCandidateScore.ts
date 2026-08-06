/**
 * useSaveCandidateScore — upsert a grower's 1-5 trait ratings for one hunt
 * candidate into pheno_candidate_scores.
 *
 * RLS enforces ownership + hunt/plant consistency server-side (the caller must
 * own the hunt and the plant must be a candidate of it). On success it
 * invalidates the grow_pheno_comparison query so the new scores flow into the
 * side-by-side immediately.
 *
 * Single table, single upsert. No RPC, no AI, no device control.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import {
  buildScoreTraitsPayload,
  type PhenoScoreTraits,
} from "@/lib/phenoScorecardRules";

export interface SaveCandidateScoreArgs {
  huntId: string;
  plantId: string;
  traits: PhenoScoreTraits;
  note?: string | null;
}

export function useSaveCandidateScore() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ huntId, plantId, traits, note }: SaveCandidateScoreArgs) => {
      if (!user) throw new Error("not_authenticated");
      const payload = {
        user_id: user.id,
        hunt_id: huntId,
        plant_id: plantId,
        traits: buildScoreTraitsPayload(traits),
        note: note && note.trim().length > 0 ? note.trim() : null,
      };
      const { error } = await supabase
        .from("pheno_candidate_scores")
        .upsert(payload as never, { onConflict: "hunt_id,plant_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      // Prefix-invalidate so every scoped grow_pheno_comparison refetches.
      qc.invalidateQueries({ queryKey: ["grow_pheno_comparison"] });
    },
  });
}
