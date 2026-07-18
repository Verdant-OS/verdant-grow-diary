import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

function readSource(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const MIGRATION = readSource(
  "supabase/migrations/20260620231000_harden_ai_credit_effective_entitlement.sql",
);

/**
 * FINAL-STATE guard. The 20260620231000 assertions below pin history, but a
 * later CREATE OR REPLACE can (and once did — 20260709015647) silently undo
 * the hardening while this file stays green. So also resolve the LATEST
 * migration that REDEFINES ai_credit_spend and pin the invariants there.
 * Mentions don't count — only a CREATE OR REPLACE of the function body.
 */
function latestMigrationDefining(fnSignature: string): string {
  const dir = resolve(process.cwd(), "supabase", "migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (let i = files.length - 1; i >= 0; i -= 1) {
    const body = readFileSync(join(dir, files[i]), "utf8");
    if (body.includes(`CREATE OR REPLACE FUNCTION ${fnSignature}`)) return body;
  }
  throw new Error(`No migration defines ${fnSignature}`);
}

const FINAL = latestMigrationDefining("public.ai_credit_spend");

describe("AI credit SQL effective entitlement hardening", () => {
  it("adds a deterministic SQL helper for effective credit plan resolution", () => {
    expect(MIGRATION).toContain(
      "CREATE OR REPLACE FUNCTION public.ai_credit_effective_credit_plan_id",
    );
    expect(MIGRATION).toContain("p_plan_id text");
    expect(MIGRATION).toContain("p_status text");
    expect(MIGRATION).toContain("p_current_period_end timestamptz");
    expect(MIGRATION).toContain("p_now timestamptz");
    expect(MIGRATION).toContain("LANGUAGE sql");
    expect(MIGRATION).toContain("IMMUTABLE");
  });

  it("degrades inactive, unknown, null, and elapsed billing rows to free", () => {
    expect(MIGRATION).toContain(
      "p_plan_id IS NULL OR p_plan_id NOT IN ('free','pro_monthly','pro_annual','founder_lifetime') THEN 'free'",
    );
    expect(MIGRATION).toContain("p_status IS DISTINCT FROM 'active' THEN 'free'");
    expect(MIGRATION).toContain(
      "p_current_period_end IS NOT NULL AND p_current_period_end <= p_now THEN 'free'",
    );
  });

  it("rewires ai_credit_spend to read status and period, not raw plan alone", () => {
    expect(MIGRATION).toContain("CREATE OR REPLACE FUNCTION public.ai_credit_spend");
    expect(MIGRATION).toContain("SELECT plan_id, status, current_period_end");
    expect(MIGRATION).toContain("INTO v_billing_plan_id, v_billing_status, v_current_period_end");
    expect(MIGRATION).not.toMatch(/SELECT\s+plan_id\s+INTO\s+v_plan_id/i);
  });

  it("calculates allowance from the effective plan id", () => {
    expect(MIGRATION).toContain("v_effective_plan_id := public.ai_credit_effective_credit_plan_id");
    expect(MIGRATION).toContain("FROM public.ai_credit_allowance(v_effective_plan_id)");
    expect(MIGRATION).not.toContain("FROM public.ai_credit_allowance(v_billing_plan_id)");
  });

  it("preserves append-only credit ledger semantics and idempotency", () => {
    expect(MIGRATION).toContain("Idempotent replay");
    expect(MIGRATION).toContain("WHERE user_id = v_uid AND idempotency_key = p_idempotency_key");
    expect(MIGRATION).toContain("pg_advisory_xact_lock");
    expect(MIGRATION).toContain("INSERT INTO public.ai_credit_spends");
    expect(MIGRATION).not.toMatch(/UPDATE\s+public\.ai_credit_spends/i);
    expect(MIGRATION).not.toMatch(/DELETE\s+FROM\s+public\.ai_credit_spends/i);
  });

  it("returns effective plan diagnostics without trusting client-supplied entitlement claims", () => {
    expect(MIGRATION).toContain("'plan_id', v_effective_plan_id");
    expect(MIGRATION).toContain("'billing_plan_id', v_billing_plan_id");
    expect(MIGRATION).toContain("'billing_status', v_billing_status");
    expect(MIGRATION).not.toContain("client_plan_id");
    expect(MIGRATION).not.toContain("client_status");
    expect(MIGRATION).not.toContain("founder_number");
  });

  it("stays tightly scoped to AI credit SQL hardening", () => {
    expect(MIGRATION).not.toContain("CREATE TABLE");
    expect(MIGRATION).not.toContain("CREATE POLICY");
    expect(MIGRATION).not.toContain("DROP POLICY");
    expect(MIGRATION).not.toMatch(/ALTER\s+TABLE\s+public\.billing_subscriptions/i);
    expect(MIGRATION).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.(?!ai_credit_)/i);
    expect(MIGRATION).not.toMatch(/\.insert\(/);
    expect(MIGRATION).not.toMatch(/\.update\(/);
    expect(MIGRATION).not.toMatch(/\.delete\(/);
    expect(MIGRATION).not.toMatch(/fetch\(/);
  });
});

describe("ai_credit_spend FINAL migration state (regression-proof)", () => {
  it("reads plan only from the canonical Lovable subscriptions table (BYO branch retired 2026-07-16)", () => {
    // Canonical lane: BYO billing_subscriptions is no longer a plan source in
    // the LATEST ai_credit_spend definition. Any prior entitling BYO row was
    // backfilled into public.subscriptions in the narrowing migration.
    expect(FINAL).toMatch(/FROM\s+public\.subscriptions/i);
    expect(FINAL).toContain("s.environment = 'live'");
    expect(FINAL).toContain("p_billing_environment = 'sandbox' AND s.environment = 'sandbox'");
    // Function body must not read billing_subscriptions.
    const bodyMatch = FINAL.match(
      /CREATE OR REPLACE FUNCTION public\.ai_credit_spend[\s\S]*?LANGUAGE plpgsql[\s\S]*?\$function\$;/,
    );
    expect(bodyMatch).not.toBeNull();
    expect(bodyMatch![0]).not.toMatch(/FROM\s+public\.billing_subscriptions/i);
  });

  it("keeps the Lovable-source status/period policy aligned with dunning and cancellation grace", () => {
    expect(FINAL).toContain("s.price_id IN ('pro_monthly','pro_annual')");
    expect(FINAL).toContain("s.current_period_end IS NOT NULL");
    expect(FINAL).toContain("s.status IN ('active','trialing') AND s.current_period_end > now()");
    expect(FINAL).toContain("OR s.status = 'past_due'");
    expect(FINAL).toContain("(s.status = 'canceled' AND s.current_period_end > now())");
    expect(FINAL).toContain("s.price_id = 'founder_lifetime'");
    // `_` is a SQL LIKE wildcard; a literal Founder prefix is required.
    expect(FINAL).toContain("left(s.paddle_subscription_id, 9) = 'lifetime_'");
    expect(FINAL).not.toContain("s.paddle_subscription_id LIKE 'lifetime_%'");
    // The regression signature: a bare plan_id read feeding the allowance
    // from billing_subscriptions.
    expect(FINAL).not.toMatch(
      /SELECT\s+plan_id\s+INTO\s+v_plan_id\s+FROM\s+public\.billing_subscriptions/i,
    );
  });

  it("fails closed for paused or expired recurring statuses", () => {
    expect(FINAL).not.toMatch(/s\.status\s*=\s*'(?:paused|expired)'/i);
  });

  it("preserves the ledger contract: idempotent replay, advisory lock, append-only", () => {
    expect(FINAL).toContain("WHERE user_id = v_uid AND idempotency_key = p_idempotency_key");
    expect(FINAL).toContain("pg_advisory_xact_lock");
    expect(FINAL).toContain("INSERT INTO public.ai_credit_spends");
    expect(FINAL).not.toMatch(/UPDATE\s+public\.ai_credit_spends/i);
    expect(FINAL).not.toMatch(/DELETE\s+FROM\s+public\.ai_credit_spends/i);
  });

  it("keeps staff metering capped and the grant posture server-only", () => {
    expect(FINAL).toContain("v_per_month := 10000");
    expect(FINAL).toMatch(/REVOKE ALL ON FUNCTION public\.ai_credit_spend[^;]+FROM PUBLIC/);
    expect(FINAL).toMatch(/REVOKE ALL ON FUNCTION public\.ai_credit_spend[^;]+FROM anon/);
    expect(FINAL).toMatch(/REVOKE ALL ON FUNCTION public\.ai_credit_spend[^;]+FROM authenticated/);
    expect(FINAL).toMatch(/GRANT EXECUTE ON FUNCTION public\.ai_credit_spend[^;]+TO service_role/);
    expect(FINAL).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.ai_credit_spend[^;]+TO authenticated/,
    );
  });
});
