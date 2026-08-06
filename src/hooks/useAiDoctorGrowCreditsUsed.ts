/**
 * useAiDoctorGrowCreditsUsed — read-only loader for the Plant Detail
 * "AI Doctor credits used up" marker.
 *
 * Mirrors the server-side per-grow usage check byte-for-byte
 * (`SELECT COALESCE(SUM(weight), 0) FROM ai_credit_spends WHERE user_id = ?
 * AND grow_id = ?` — supabase/migrations/20260620231000_harden_ai_credit_
 * effective_entitlement.sql) so the client-computed "used" figure the
 * teaser gates on can never drift from what actually decides a real spend.
 * Selects only `weight` — never `result`, which can carry AI Doctor
 * analysis payload data unrelated to this lightweight display query.
 *
 * PRESENTATION-ONLY: this is a read for display, same doctrine as
 * useMyEntitlements. It never gates AI Doctor access itself — a real spend
 * attempt is still checked authoritatively server-side by ai_credit_spend.
 *
 * Read-only. RLS enforces ownership (ai_credit_spends_select_own). No
 * writes, no RPC, no AI call.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";

export function useAiDoctorGrowCreditsUsed(growId: string | null | undefined) {
  const { user } = useAuth();

  return useQuery<number>({
    queryKey: ["ai_credit_spends", "grow_used", user?.id ?? null, growId ?? null],
    enabled: !!user && !!growId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_credit_spends")
        .select("weight")
        .eq("user_id", user!.id)
        .eq("grow_id", growId as string);
      if (error) throw error;
      return (data ?? []).reduce(
        (sum, row) => sum + ((row as { weight: number | null }).weight ?? 0),
        0,
      );
    },
  });
}
