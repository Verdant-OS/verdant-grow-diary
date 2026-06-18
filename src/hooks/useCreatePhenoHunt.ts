/**
 * useCreatePhenoHunt — persistence helper for Pheno Hunt v1.
 *
 * Inserts the hunt row, then inserts candidate rows. If candidate insert
 * fails after the hunt insert succeeded, attempts a best-effort rollback
 * delete of the just-created hunt. Returns a structured result.
 *
 * No AI. No alerts. No Action Queue. No device control. No elevated keys.
 */
import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type {
  PhenoHuntDraft,
  CandidateSelection,
} from "@/lib/phenoHuntStartPageRules";

export type CreatePhenoHuntStatus = "idle" | "saving" | "saved" | "error";

export interface CreatePhenoHuntInput {
  userId: string;
  draft: PhenoHuntDraft;
  selections: readonly CandidateSelection[];
}

export interface CreatePhenoHuntResult {
  ok: boolean;
  huntId?: string;
  errorCode?:
    | "not_authenticated"
    | "hunt_insert_failed"
    | "candidate_insert_failed"
    | "validation_failed";
  errorMessage?: string;
}

export function useCreatePhenoHunt(
  client: typeof supabase = supabase,
) {
  const [status, setStatus] = useState<CreatePhenoHuntStatus>("idle");
  const [lastResult, setLastResult] = useState<CreatePhenoHuntResult | null>(
    null,
  );

  const create = useCallback(
    async (input: CreatePhenoHuntInput): Promise<CreatePhenoHuntResult> => {
      setStatus("saving");
      const { userId, draft, selections } = input;

      if (!userId) {
        const res: CreatePhenoHuntResult = {
          ok: false,
          errorCode: "not_authenticated",
          errorMessage: "Sign in to create a pheno hunt.",
        };
        setStatus("error");
        setLastResult(res);
        return res;
      }

      const huntRow = {
        user_id: userId,
        grow_id: draft.growId,
        tent_id: draft.tentId ?? null,
        hunt_name: draft.huntName.trim(),
        cultivar: draft.cultivar.trim(),
        project_goal: draft.projectGoal as string,
        start_date: draft.startDate,
        generation: draft.generation?.trim() || null,
        lineage: draft.lineage?.trim() || null,
        breeder_seed_source: draft.breederSeedSource?.trim() || null,
        propagation_type: draft.propagationType ?? null,
        germination_method: draft.germinationMethod?.trim() || null,
        medium: draft.medium?.trim() || null,
        grow_style: draft.growStyle ?? null,
        candidate_count: selections.length,
        notes: draft.notes?.trim() || null,
      };

      const { data: hunt, error: huntErr } = await client
        .from("pheno_hunts")
        .insert(huntRow)
        .select("id")
        .single();

      if (huntErr || !hunt) {
        const res: CreatePhenoHuntResult = {
          ok: false,
          errorCode: "hunt_insert_failed",
          errorMessage: huntErr?.message ?? "Could not save pheno hunt.",
        };
        setStatus("error");
        setLastResult(res);
        return res;
      }

      const huntId = hunt.id as string;

      // Deduplicate by plant_id (defense in depth alongside DB unique).
      const seen = new Set<string>();
      const candidateRows = selections
        .filter((s) => {
          if (seen.has(s.plantId)) return false;
          seen.add(s.plantId);
          return true;
        })
        .map((s) => ({
          hunt_id: huntId,
          plant_id: s.plantId,
          label: s.label.trim(),
        }));

      const { error: candErr } = await client
        .from("pheno_hunt_candidates")
        .insert(candidateRows);

      if (candErr) {
        // Best-effort rollback. RLS allows owner delete.
        await client.from("pheno_hunts").delete().eq("id", huntId);
        const res: CreatePhenoHuntResult = {
          ok: false,
          errorCode: "candidate_insert_failed",
          errorMessage: candErr.message,
        };
        setStatus("error");
        setLastResult(res);
        return res;
      }

      const res: CreatePhenoHuntResult = { ok: true, huntId };
      setStatus("saved");
      setLastResult(res);
      return res;
    },
    [client],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setLastResult(null);
  }, []);

  return { status, lastResult, create, reset };
}
