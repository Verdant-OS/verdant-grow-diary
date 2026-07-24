/**
 * AI credit grants — static contract for the non-Paddle grant path (referral /
 * bonus credits). Pins the ledger generalization + the service-role-only
 * grant_lovable_credits RPC, in the same style as ai-credit-grants-sql.test.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260721105000_ai_credit_grants_non_paddle_grants.sql",
  ),
  "utf8",
);

describe("ai_credit_grants — non-Paddle grant generalization", () => {
  it("fails closed unless the grant ledger already exists", () => {
    expect(MIGRATION).toContain("to_regclass('public.ai_credit_grants') IS NULL");
  });

  it("relaxes the Paddle-only columns so referral/bonus grants can exist", () => {
    expect(MIGRATION).toContain(
      "ALTER TABLE public.ai_credit_grants ALTER COLUMN paddle_transaction_id DROP NOT NULL",
    );
    expect(MIGRATION).toContain(
      "ALTER TABLE public.ai_credit_grants ALTER COLUMN sku DROP NOT NULL",
    );
  });

  it("adds a source column (default credit_pack — keeps the pack path valid) + grant_ref anchor", () => {
    expect(MIGRATION).toMatch(
      /ADD COLUMN source text NOT NULL DEFAULT 'credit_pack'\s*\n\s*CHECK \(source IN \('credit_pack', 'referral', 'bonus'\)\)/,
    );
    expect(MIGRATION).toContain("ADD COLUMN grant_ref text NULL");
  });

  it("enforces exactly one idempotency anchor per grant (Paddle txn XOR grant_ref)", () => {
    expect(MIGRATION).toContain("ai_credit_grants_idempotency_anchor");
    expect(MIGRATION).toContain(
      "(source = 'credit_pack' AND paddle_transaction_id IS NOT NULL AND grant_ref IS NULL)",
    );
    expect(MIGRATION).toContain(
      "(source IN ('referral', 'bonus') AND grant_ref IS NOT NULL AND paddle_transaction_id IS NULL)",
    );
  });

  it("is idempotent per (source, grant_ref) via a partial unique index", () => {
    expect(MIGRATION).toContain(
      "CREATE UNIQUE INDEX ai_credit_grants_source_ref_uq\n  ON public.ai_credit_grants(source, grant_ref)\n  WHERE grant_ref IS NOT NULL AND kind = 'grant'",
    );
  });
});

describe("grant_lovable_credits RPC", () => {
  it("is a service-role-only, security-definer, search-path-pinned function", () => {
    expect(MIGRATION).toContain("CREATE OR REPLACE FUNCTION public.grant_lovable_credits");
    expect(MIGRATION).toContain("SECURITY DEFINER");
    expect(MIGRATION).toContain("SET search_path = public, pg_temp");
    expect(MIGRATION).toContain(
      "GRANT EXECUTE ON FUNCTION public.grant_lovable_credits(uuid, int, text, text, text) TO service_role",
    );
    expect(MIGRATION).toContain(
      "REVOKE ALL ON FUNCTION public.grant_lovable_credits(uuid, int, text, text, text) FROM authenticated",
    );
    // Clients can never mint themselves referral/bonus credits.
    expect(MIGRATION).not.toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.grant_lovable_credits\([^)]*\)\s+TO\s+(anon|authenticated)/i,
    );
  });

  it("only accepts referral/bonus sources and fails closed on bad input", () => {
    expect(MIGRATION).toContain("p_source NOT IN ('referral', 'bonus')");
    expect(MIGRATION).toContain("p_credits <= 0 OR p_credits > 100000");
    expect(MIGRATION).toContain("'reason', 'invalid_input'");
    // credit_pack must go through the Paddle-keyed RPC, never this one.
    expect(MIGRATION).not.toMatch(/p_source\s+IN\s+\([^)]*'credit_pack'/);
  });

  it("is idempotent per grant_ref under an advisory lock and only inserts grants", () => {
    expect(MIGRATION).toContain(
      "pg_advisory_xact_lock(hashtext('lovable_credit_grant:' || p_source || ':' || p_grant_ref))",
    );
    expect(MIGRATION).toContain(
      "WHERE source = p_source AND grant_ref = p_grant_ref AND kind = 'grant'",
    );
    expect(MIGRATION).toContain("'reason', 'idempotent'");
    expect(MIGRATION).toContain("'reason', 'granted'");
    expect(MIGRATION).toContain("INSERT INTO public.ai_credit_grants");
  });

  it("stays append-only and never writes plan / subscription / spend tables", () => {
    expect(MIGRATION).not.toMatch(/UPDATE\s+public\.ai_credit_grants/i);
    expect(MIGRATION).not.toMatch(/DELETE\s+FROM\s+public\.ai_credit_grants/i);
    for (const forbidden of [
      "INSERT INTO public.subscriptions",
      "UPDATE public.subscriptions",
      "INSERT INTO public.billing_subscriptions",
      "INSERT INTO public.ai_credit_spends",
      "UPDATE public.ai_credit_spends",
      "INSERT INTO public.grows",
    ]) {
      expect(MIGRATION).not.toContain(forbidden);
    }
  });
});
