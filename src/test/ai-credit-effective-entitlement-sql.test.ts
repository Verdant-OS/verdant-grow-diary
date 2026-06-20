import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSource(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const MIGRATION = readSource(
  "supabase/migrations/20260620231000_harden_ai_credit_effective_entitlement.sql",
);

describe("AI credit SQL effective entitlement hardening", () => {
  it("adds a deterministic SQL helper for effective credit plan resolution", () => {
    expect(MIGRATION).toContain("CREATE OR REPLACE FUNCTION public.ai_credit_effective_credit_plan_id");
    expect(MIGRATION).toContain("p_plan_id text");
    expect(MIGRATION).toContain("p_status text");
    expect(MIGRATION).toContain("p_current_period_end timestamptz");
    expect(MIGRATION).toContain("p_now timestamptz");
    expect(MIGRATION).toContain("LANGUAGE sql");
    expect(MIGRATION).toContain("IMMUTABLE");
  });

  it("degrades inactive, unknown, null, and elapsed billing rows to free", () => {
    expect(MIGRATION).toContain("p_plan_id IS NULL OR p_plan_id NOT IN ('free','pro_monthly','pro_annual','founder_lifetime') THEN 'free'");
    expect(MIGRATION).toContain("p_status IS DISTINCT FROM 'active' THEN 'free'");
    expect(MIGRATION).toContain("p_current_period_end IS NOT NULL AND p_current_period_end <= p_now THEN 'free'");
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
