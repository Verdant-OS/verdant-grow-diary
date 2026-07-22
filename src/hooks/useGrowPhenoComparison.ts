/**
 * useGrowPhenoComparison — loads a real grow's most recent pheno hunt and its
 * tagged candidate plants, then builds a PhenoComparisonInput for the shared
 * Pheno Comparison presenter.
 *
 * Read-only. RLS scopes every query to the signed-in owner. No writes, no AI,
 * no device control. Pure mapping lives in phenoComparisonRealInput.ts; this
 * hook only fetches and assembles.
 *
 * Data sources:
 *   - pheno_hunts            — the most recent hunt for the grow.
 *   - plants (pheno_hunt_id) — candidate plants + candidate_label.
 *   - grows / tents          — display names for context.
 *   - grow_events            — recent activity per candidate (kind + note).
 *
 * Structured phenotype / post-cure / photo / sensor enrichment is deliberately
 * out of scope for now; the comparability engine surfaces those as honest
 * evidence gaps.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import {
  buildRealPhenoComparisonInput,
  type RealPhenoActivityRow,
  type RealPhenoCandidatePlant,
} from "@/lib/phenoComparisonRealInput";
import type { PhenoComparisonInput } from "@/lib/phenoComparisonViewModel";

const ACTIVITY_PER_CANDIDATE = 5;

export interface GrowPhenoComparisonResult {
  /** Null until a hunt is found. */
  huntId: string | null;
  huntName: string | null;
  candidateCount: number;
  /** Built comparison input (candidates: [] when no hunt / no candidates). */
  input: PhenoComparisonInput;
}

const EMPTY_RESULT: GrowPhenoComparisonResult = {
  huntId: null,
  huntName: null,
  candidateCount: 0,
  input: { huntName: null, isDemo: false, candidates: [] },
};

export function useGrowPhenoComparison(growId: string | null | undefined) {
  const { user } = useAuth();

  return useQuery<GrowPhenoComparisonResult>({
    queryKey: ["grow_pheno_comparison", growId ?? null, user?.id ?? null],
    enabled: !!growId && !!user,
    queryFn: async (): Promise<GrowPhenoComparisonResult> => {
      if (!growId || !user) return EMPTY_RESULT;

      // Most recent hunt for this grow. RLS enforces ownership.
      const { data: huntRows, error: huntErr } = await supabase
        .from("pheno_hunts")
        .select("id,name,grow_id")
        .eq("grow_id", growId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (huntErr) throw huntErr;
      const hunt = huntRows?.[0];
      if (!hunt) return EMPTY_RESULT;

      // Candidate plants tagged into this hunt.
      const { data: plantRows, error: plantErr } = await supabase
        .from("plants")
        .select("id,candidate_label,name,strain,stage,grow_id,tent_id")
        .eq("pheno_hunt_id", hunt.id)
        .eq("is_archived", false);
      if (plantErr) throw plantErr;
      const candidates = (plantRows ?? []) as RealPhenoCandidatePlant[];
      if (candidates.length === 0) {
        return {
          huntId: hunt.id,
          huntName: (hunt as { name: string | null }).name ?? null,
          candidateCount: 0,
          input: {
            huntName: (hunt as { name: string | null }).name ?? null,
            isDemo: false,
            candidates: [],
          },
        };
      }

      const plantIds = candidates.map((c) => c.id);
      const tentIds = Array.from(
        new Set(candidates.map((c) => c.tent_id).filter((t): t is string => !!t)),
      );

      // Grow name + tent names + recent activity, in parallel.
      const [growRes, tentRes, eventRes] = await Promise.all([
        supabase.from("grows").select("id,name").eq("id", growId).maybeSingle(),
        tentIds.length > 0
          ? supabase.from("tents").select("id,name").in("id", tentIds)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from("grow_events")
          .select("id,plant_id,event_type,occurred_at,note,is_deleted")
          .in("plant_id", plantIds)
          .eq("is_deleted", false)
          .order("occurred_at", { ascending: false })
          .limit(plantIds.length * ACTIVITY_PER_CANDIDATE * 2),
      ]);
      if (growRes.error) throw growRes.error;
      if (tentRes.error) throw tentRes.error;
      if (eventRes.error) throw eventRes.error;

      const tentNameById: Record<string, string> = {};
      for (const t of (tentRes.data ?? []) as Array<{ id: string; name: string | null }>) {
        if (t.name) tentNameById[t.id] = t.name;
      }

      // Bucket recent activity per candidate (already newest-first from the query).
      const activityByPlant: Record<string, RealPhenoActivityRow[]> = {};
      for (const id of plantIds) activityByPlant[id] = [];
      for (const e of (eventRes.data ?? []) as Array<{
        id: string;
        plant_id: string | null;
        event_type: string | null;
        occurred_at: string | null;
        note: string | null;
      }>) {
        if (!e.plant_id || !activityByPlant[e.plant_id]) continue;
        const bucket = activityByPlant[e.plant_id];
        if (bucket.length >= ACTIVITY_PER_CANDIDATE) continue;
        bucket.push({
          id: e.id,
          at: e.occurred_at,
          kind: e.event_type,
          note: e.note,
        });
      }

      const huntName = (hunt as { name: string | null }).name ?? null;
      const input = buildRealPhenoComparisonInput({
        huntName,
        growName: (growRes.data as { name: string | null } | null)?.name ?? null,
        tentNameById,
        candidates,
        activityByPlant,
        maxActivityPerCandidate: ACTIVITY_PER_CANDIDATE,
      });

      return {
        huntId: hunt.id,
        huntName,
        candidateCount: candidates.length,
        input,
      };
    },
  });
}
