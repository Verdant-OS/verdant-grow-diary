/**
 * AI credit packs — PR1 static contract for the grant ledger + grant RPC.
 *
 * Pins the security-load-bearing SQL of the new `public.ai_credit_grants`
 * append-only table and the service-role-only `grant_lovable_credit_pack` RPC,
 * in the same file-content style as paddle-subscription-update-rpc-static.test.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260721103000_ai_credit_grants.sql"),
  "utf8",
);

describe("ai_credit_grants ledger table", () => {
  it("is an append-only, per-user table keyed to auth.users with cascade delete", () => {
    expect(MIGRATION).toContain("CREATE TABLE public.ai_credit_grants");
    expect(MIGRATION).toContain(
      "user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE",
    );
  });

  it("bounds credits and enforces the grant/clawback sign + parent invariants", () => {
    expect(MIGRATION).toMatch(/credits int NOT NULL CHECK \(credits <> 0[^)]*<= 100000\)/);
    expect(MIGRATION).toContain(
      "kind text NOT NULL DEFAULT 'grant' CHECK (kind IN ('grant', 'clawback'))",
    );
    expect(MIGRATION).toContain("ai_credit_grants_kind_sign");
    expect(MIGRATION).toContain("(kind = 'grant' AND credits > 0)");
    expect(MIGRATION).toContain("(kind = 'clawback' AND credits < 0)");
    expect(MIGRATION).toContain("ai_credit_grants_clawback_has_parent");
  });

  it("keeps balance derivable: nullable expiry + a reverses self-link, no counter column", () => {
    expect(MIGRATION).toContain("expires_at timestamptz NULL");
    expect(MIGRATION).toContain("reverses uuid NULL REFERENCES public.ai_credit_grants(id)");
    // No mutable running-balance column.
    expect(MIGRATION).not.toMatch(/balance\s+int/i);
  });

  it("idempotency: one grant and one clawback per Paddle transaction", () => {
    expect(MIGRATION).toContain(
      "CREATE UNIQUE INDEX ai_credit_grants_grant_txn_uq\n  ON public.ai_credit_grants(paddle_transaction_id) WHERE kind = 'grant'",
    );
    expect(MIGRATION).toContain(
      "CREATE UNIQUE INDEX ai_credit_grants_clawback_txn_uq\n  ON public.ai_credit_grants(paddle_transaction_id) WHERE kind = 'clawback'",
    );
  });

  it("is RLS-protected, select-own, with no client write path (service-role only)", () => {
    expect(MIGRATION).toContain("ALTER TABLE public.ai_credit_grants ENABLE ROW LEVEL SECURITY");
    expect(MIGRATION).toContain('CREATE POLICY "ai_credit_grants_select_own"');
    expect(MIGRATION).toContain("FOR SELECT");
    expect(MIGRATION).toContain("USING (user_id = auth.uid())");
    expect(MIGRATION).toContain("REVOKE ALL ON public.ai_credit_grants FROM anon, authenticated");
    expect(MIGRATION).toContain("GRANT SELECT ON public.ai_credit_grants TO authenticated");
    expect(MIGRATION).toContain("GRANT ALL ON public.ai_credit_grants TO service_role");
    // No INSERT/UPDATE/DELETE policy for clients — writes go through the RPC.
    expect(MIGRATION).not.toMatch(/CREATE POLICY[^;]*FOR\s+(INSERT|UPDATE|DELETE)/i);
  });
});

describe("grant_lovable_credit_pack RPC", () => {
  it("is a service-role-only, security-definer, search-path-pinned function", () => {
    expect(MIGRATION).toContain("CREATE OR REPLACE FUNCTION public.grant_lovable_credit_pack");
    expect(MIGRATION).toContain("SECURITY DEFINER");
    expect(MIGRATION).toContain("SET search_path = public, pg_temp");
    expect(MIGRATION).toContain(
      "GRANT EXECUTE ON FUNCTION public.grant_lovable_credit_pack(uuid, text, int, text, text) TO service_role",
    );
    expect(MIGRATION).toContain(
      "REVOKE ALL ON FUNCTION public.grant_lovable_credit_pack(uuid, text, int, text, text) FROM PUBLIC",
    );
    expect(MIGRATION).toContain(
      "REVOKE ALL ON FUNCTION public.grant_lovable_credit_pack(uuid, text, int, text, text) FROM authenticated",
    );
    // Clients must never be able to grant themselves credits.
    expect(MIGRATION).not.toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.grant_lovable_credit_pack\([^)]*\)\s+TO\s+(anon|authenticated)/i,
    );
  });

  it("validates input and fails closed on a bad payload", () => {
    expect(MIGRATION).toContain("p_environment NOT IN ('sandbox', 'live')");
    expect(MIGRATION).toContain("p_credits <= 0 OR p_credits > 100000");
    expect(MIGRATION).toContain("'reason', 'invalid_input'");
  });

  it("is idempotent per transaction under an advisory lock", () => {
    expect(MIGRATION).toContain("pg_advisory_xact_lock(hashtext('lovable_credit_pack_grant:'");
    expect(MIGRATION).toContain(
      "WHERE paddle_transaction_id = p_paddle_transaction_id AND kind = 'grant'",
    );
    expect(MIGRATION).toContain("'reason', 'idempotent'");
    expect(MIGRATION).toContain("'reason', 'granted'");
    // Only ever inserts a positive 'grant' row.
    expect(MIGRATION).toContain("INSERT INTO public.ai_credit_grants");
    expect(MIGRATION).toContain("'grant', p_sku, p_paddle_transaction_id, p_environment");
  });

  it("touches only the grants ledger — never grow/sensor/plant/action data or the plan tables", () => {
    for (const forbidden of [
      "INSERT INTO public.grows",
      "UPDATE public.grows",
      "INSERT INTO public.plants",
      "UPDATE public.plants",
      "INSERT INTO public.sensor_readings",
      "INSERT INTO public.action_queue",
      "INSERT INTO public.subscriptions",
      "UPDATE public.subscriptions",
      "INSERT INTO public.billing_subscriptions",
      "UPDATE public.billing_subscriptions",
      // A pack grant never writes the spend ledger (only its own grants table).
      "INSERT INTO public.ai_credit_spends",
      "UPDATE INTO public.ai_credit_spends",
      "UPDATE public.ai_credit_spends",
    ]) {
      expect(MIGRATION).not.toContain(forbidden);
    }
  });
});
