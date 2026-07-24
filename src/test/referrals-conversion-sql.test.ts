/**
 * Referral conversion engine — static contract. Pins the anti-abuse guards and
 * the idempotent dual "give 10 / get 10" grant on the referrals table +
 * convert_referral RPC.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260721106000_referrals_conversion.sql"),
  "utf8",
);

describe("referrals table", () => {
  it("fails closed unless the non-Paddle grant RPC exists first", () => {
    expect(MIGRATION).toContain(
      "to_regprocedure('public.grant_lovable_credits(uuid,int,text,text,text)') IS NULL",
    );
  });

  it("blocks self-referral and binds each referee to at most one referral", () => {
    expect(MIGRATION).toContain(
      "CONSTRAINT referrals_no_self_referral CHECK (referrer_user_id <> referee_user_id)",
    );
    expect(MIGRATION).toContain(
      "CREATE UNIQUE INDEX referrals_referee_uq ON public.referrals(referee_user_id)",
    );
  });

  it("is RLS-protected: a referrer reads only their own referrals, no client writes", () => {
    expect(MIGRATION).toContain("ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY");
    expect(MIGRATION).toContain('CREATE POLICY "referrals_select_own_referrer"');
    expect(MIGRATION).toContain("USING (referrer_user_id = auth.uid())");
    expect(MIGRATION).toContain("REVOKE ALL ON public.referrals FROM anon, authenticated");
    expect(MIGRATION).toContain("GRANT SELECT ON public.referrals TO authenticated");
    expect(MIGRATION).not.toMatch(/CREATE POLICY[^;]*FOR\s+(INSERT|UPDATE|DELETE)/i);
  });
});

describe("convert_referral RPC", () => {
  it("is service-role-only, security-definer, search-path pinned", () => {
    expect(MIGRATION).toContain("CREATE OR REPLACE FUNCTION public.convert_referral");
    expect(MIGRATION).toContain("SECURITY DEFINER");
    expect(MIGRATION).toContain("SET search_path = public, pg_temp");
    expect(MIGRATION).toContain(
      "GRANT EXECUTE ON FUNCTION public.convert_referral(uuid, uuid, text, text, boolean) TO service_role",
    );
    expect(MIGRATION).toContain(
      "REVOKE ALL ON FUNCTION public.convert_referral(uuid, uuid, text, text, boolean) FROM authenticated",
    );
    expect(MIGRATION).not.toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.convert_referral\([^)]*\)\s+TO\s+(anon|authenticated)/i,
    );
  });

  it("enforces the anti-abuse guards (self-referral, single-referrer binding)", () => {
    expect(MIGRATION).toContain("'reason', 'self_referral'");
    expect(MIGRATION).toContain("'reason', 'referee_already_referred'");
    expect(MIGRATION).toContain("pg_advisory_xact_lock(hashtext('referral_convert:'");
  });

  it("grants give 10 / get 10 to both sides, each idempotent on its own grant_ref", () => {
    expect(MIGRATION).toContain("v_give_referrer int := 10;");
    expect(MIGRATION).toContain("v_give_referee  int := 10;");
    // Two distinct referral grants (referrer + referee), via the non-Paddle RPC.
    expect(MIGRATION).toContain("'referral_' || v_referral_id::text || '_referrer'");
    expect(MIGRATION).toContain("'referral_' || v_referral_id::text || '_referee'");
    expect((MIGRATION.match(/PERFORM public\.grant_lovable_credits\(/g) ?? []).length).toBe(2);
  });

  it("separates pending attribution from the verified grant (fraud gate is a param)", () => {
    expect(MIGRATION).toContain("IF p_verified IS NOT TRUE THEN");
    expect(MIGRATION).toContain("'reason', 'pending'");
    expect(MIGRATION).toContain("'reason', 'converted'");
    expect(MIGRATION).toContain("'reason', 'idempotent'");
  });

  it("never touches plan / subscription / spend tables (credits flow only via the grant RPC)", () => {
    for (const forbidden of [
      "INSERT INTO public.subscriptions",
      "UPDATE public.subscriptions",
      "INSERT INTO public.billing_subscriptions",
      "INSERT INTO public.ai_credit_spends",
      "UPDATE public.ai_credit_spends",
      "INSERT INTO public.ai_credit_grants", // grants go through grant_lovable_credits, never a raw insert
    ]) {
      expect(MIGRATION).not.toContain(forbidden);
    }
    expect(MIGRATION).not.toMatch(/DELETE\s+FROM\s+public\.referrals/i);
  });
});
