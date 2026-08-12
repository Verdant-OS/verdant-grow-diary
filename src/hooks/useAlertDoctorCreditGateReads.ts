/**
 * useAlertDoctorCreditGateReads — read-only loader for the tent-alerts
 * doctor-CTA credit gate.
 *
 * Mirrors the authoritative spend contract's ALLOWANCE arm exactly
 * (supabase/migrations/20260728090736_ai_credit_pack_portability.sql):
 * included per-grow allowance usage counts only rows whose
 * `meta->>'funded_by'` IS DISTINCT FROM 'pack' — grant-funded overflow
 * rows never consume the allowance. Selects only `weight` and the
 * `funded_by` marker — never `result`, which can carry AI Doctor analysis
 * payload data unrelated to this lightweight display query.
 *
 * The PACK arm is deliberately NOT mirrored. The server's pack balance is
 * environment-scoped with refund-row environment resolution via a self
 * join — duplicating that here would be a drift magnet. Instead the gate
 * fails open: if the user owns ANY unexpired grant row (any environment,
 * any remaining balance), `hasPackCredits` is true and the caller must not
 * intercept — the server remains the only authority on whether those
 * credits actually cover a spend. The cost is bounded and honest: a
 * pack-owning free grower simply keeps today's behavior.
 *
 * PRESENTATION-ONLY: same doctrine as useMyEntitlements. This never gates
 * AI Doctor access itself — a real spend attempt is still checked
 * authoritatively server-side by ai_credit_spend.
 *
 * Read-only. RLS enforces ownership (ai_credit_spends_select_own,
 * ai_credit_grants_select_own). No writes, no RPC, no AI call.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";

export interface AlertDoctorCreditGateReads {
  /** Allowance-funded spend weight for this user + grow (pack rows excluded). */
  allowanceUsed: number;
  /** True when ANY unexpired grant row exists — the gate must fail open. */
  hasPackCredits: boolean;
}

/**
 * Single source of truth for this query's cache key, so a successful spend
 * elsewhere (see PlantDetailAiDoctorLiveReview's handlePersisted) can
 * invalidate the exact same prefix instead of hand-typing a copy.
 */
export function alertDoctorCreditGateReadsQueryKey(
  userId: string | null | undefined,
  growId: string | null | undefined,
) {
  return ["ai_credit_gate_reads", userId ?? null, growId ?? null] as const;
}

export function useAlertDoctorCreditGateReads(growId: string | null | undefined) {
  const { user } = useAuth();

  return useQuery<AlertDoctorCreditGateReads>({
    queryKey: alertDoctorCreditGateReadsQueryKey(user?.id, growId),
    enabled: !!user && !!growId,
    queryFn: async () => {
      const [spends, grants] = await Promise.all([
        supabase
          .from("ai_credit_spends")
          .select("weight, funded_by:meta->>funded_by")
          .eq("user_id", user!.id)
          .eq("grow_id", growId as string),
        supabase.from("ai_credit_grants").select("credits, expires_at").eq("user_id", user!.id),
      ]);
      if (spends.error) throw spends.error;
      if (grants.error) throw grants.error;

      // Client-side filter mirrors `(meta->>'funded_by') IS DISTINCT FROM
      // 'pack'` including NULL meta — PostgREST `neq` drops NULLs, which
      // would silently exclude legacy rows from the allowance count.
      const allowanceUsed = (spends.data ?? []).reduce((sum, row) => {
        const r = row as { weight: number | null; funded_by: string | null };
        return r.funded_by === "pack" ? sum : sum + (r.weight ?? 0);
      }, 0);

      const now = Date.now();
      const hasPackCredits = (grants.data ?? []).some((row) => {
        const r = row as { credits: number | null; expires_at: string | null };
        if (!r.credits || r.credits <= 0) return false;
        if (!r.expires_at) return true;
        const t = Date.parse(r.expires_at);
        return !Number.isFinite(t) || t > now;
      });

      return { allowanceUsed, hasPackCredits };
    },
  });
}
