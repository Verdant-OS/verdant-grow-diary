import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");
const MIGRATION = read(
  "supabase/migrations/20260720093000_ai_credit_grow_scope_integrity.sql",
).replace(/\r\n/g, "\n");
const TYPES = read("src/integrations/supabase/types.ts");

function functionDefinition(firstParameter: string): string {
  const start = MIGRATION.indexOf(
    `CREATE OR REPLACE FUNCTION public.ai_credit_spend(\n  ${firstParameter}`,
  );
  expect(start).toBeGreaterThan(-1);
  const end = MIGRATION.indexOf("$function$;", start);
  expect(end).toBeGreaterThan(start);
  return MIGRATION.slice(start, end + "$function$;".length);
}

const SERVER_SPEND = functionDefinition("p_user_id uuid,");
const LEGACY_SPEND = functionDefinition("p_feature text,");
const SPEND_OVERLOADS = [SERVER_SPEND, LEGACY_SPEND] as const;

function expectInOrder(source: string, fragments: readonly string[]): void {
  let cursor = -1;
  for (const fragment of fragments) {
    const next = source.indexOf(fragment, cursor + 1);
    expect(next, `Expected ${JSON.stringify(fragment)} after offset ${cursor}`).toBeGreaterThan(
      cursor,
    );
    cursor = next;
  }
}

describe("AI credit grow-scope integrity SQL", () => {
  it("fails closed unless both spend overloads and the result cache exist", () => {
    expect(MIGRATION).toContain(
      "to_regprocedure('public.ai_credit_spend(text,uuid,text,text,jsonb)')",
    );
    expect(MIGRATION).toContain(
      "to_regprocedure('public.ai_credit_spend(uuid,text,text,uuid,text,text,jsonb)')",
    );
    expect(MIGRATION).toContain("to_regclass('public.ai_credit_spends')");
    expect(MIGRATION).toContain("to_regclass('public.ai_credit_spend_results')");
    expect(MIGRATION).toContain("to_regclass('public.ai_doctor_review_evidence_receipts')");
    expect(MIGRATION).toContain(
      "ai-credit grow-scope integrity blocked: missing legacy five-argument spend overload",
    );
    expect(MIGRATION).toContain(
      "ai-credit grow-scope integrity blocked: missing service seven-argument spend overload",
    );
    expect(MIGRATION).toContain(
      "ai-credit grow-scope integrity blocked: missing public.ai_credit_spend_results",
    );
    expect(MIGRATION).toContain(
      "ai-credit grow-scope integrity blocked: missing public.ai_doctor_review_evidence_receipts",
    );

    expectInOrder(MIGRATION, [
      "DO $preflight$",
      "to_regprocedure('public.ai_credit_spend(text,uuid,text,text,jsonb)')",
      "to_regprocedure('public.ai_credit_spend(uuid,text,text,uuid,text,text,jsonb)')",
      "to_regclass('public.ai_credit_spend_results')",
      "to_regclass('public.ai_doctor_review_evidence_receipts')",
      "$preflight$;",
      "DROP CONSTRAINT ai_credit_spends_grow_id_fkey",
    ]);
  });

  it("requires the exact grow, user, and result-cache cascade assumptions before changing history", () => {
    for (const constraint of [
      "ai_credit_spends_grow_id_fkey",
      "ai_credit_spends_user_id_fkey",
      "ai_credit_spend_results_spend_id_fkey",
      "ai_doctor_review_evidence_receipts_spend_id_fkey",
    ]) {
      expect(MIGRATION).toContain(`c.conname = '${constraint}'`);
    }
    expect(MIGRATION.match(/c\.confdeltype = 'c'/g) ?? []).toHaveLength(4);
    expect(MIGRATION).toContain("c.confrelid = v_grows");
    expect(MIGRATION).toContain("c.confrelid = v_users");
    expect(MIGRATION).toContain("c.conrelid = v_result_cache");
    expect(MIGRATION).toContain("c.conrelid = v_evidence_receipts");
    expect(MIGRATION).toContain("c.confrelid = v_spends");
    expect(MIGRATION).toContain("a.attname = 'grow_id'");
    expect(MIGRATION).toContain("a.attname = 'user_id'");
    expect(MIGRATION.match(/a\.attname = 'spend_id'/g) ?? []).toHaveLength(2);
    expect(MIGRATION.match(/a\.attname = 'id'/g) ?? []).toHaveLength(4);
  });

  it("drops only the grow FK so deleted grows leave immutable historical UUIDs", () => {
    expect(MIGRATION.match(/DROP CONSTRAINT ai_credit_spends_grow_id_fkey/g) ?? []).toHaveLength(1);
    expect(MIGRATION).not.toMatch(/ADD\s+CONSTRAINT\s+ai_credit_spends_grow_id_fkey/i);
    expect(MIGRATION).not.toMatch(/REFERENCES\s+public\.grows/i);
    expect(MIGRATION).not.toContain("DROP CONSTRAINT ai_credit_spends_user_id_fkey");
    expect(MIGRATION).not.toMatch(/ALTER\s+COLUMN\s+grow_id/i);
    expect(MIGRATION).not.toMatch(/UPDATE\s+public\.ai_credit_spends/i);
    expect(MIGRATION).not.toMatch(/DELETE\s+FROM\s+public\.ai_credit_spends/i);
    expect(TYPES).not.toContain('foreignKeyName: "ai_credit_spends_grow_id_fkey"');
    expect(TYPES).toContain('foreignKeyName: "ai_credit_spends_refund_of_fkey"');
  });

  it("serializes, validates, and row-locks any non-null grow before replay in both overloads", () => {
    for (const body of SPEND_OVERLOADS) {
      expectInOrder(body, [
        "p_idempotency_key IS NULL",
        "PERFORM pg_advisory_xact_lock(hashtext(v_uid::text))",
        "IF p_grow_id IS NOT NULL THEN",
        "FROM public.grows grow_row",
        "grow_row.id = p_grow_id",
        "grow_row.user_id = v_uid",
        "FOR SHARE",
        "IF NOT FOUND THEN",
        "'reason', 'grow_not_owned'",
        "idempotency_key = p_idempotency_key",
      ]);
      expect(body.match(/'reason', 'grow_not_owned'/g) ?? []).toHaveLength(1);
      expect(body).not.toMatch(/IF\s+p_grow_id\s+IS\s+NULL[\s\S]*?grow_not_owned/i);
    }
  });

  it("preserves monthly paid/staff null-grow behavior and Free per-grow null rejection", () => {
    for (const body of SPEND_OVERLOADS) {
      expect(body).toContain("v_plan_id := COALESCE(v_lov_plan, 'free')");
      expect(body).toContain("v_per_grow := NULL");
      expect(body).toContain("v_per_month := 10000");
      expectInOrder(body, [
        "IF v_per_grow IS NOT NULL THEN",
        "IF p_grow_id IS NULL THEN",
        "'reason', 'grow_id_required_for_plan'",
        "ELSIF v_per_month IS NOT NULL THEN",
      ]);
      expect(body).not.toMatch(
        /ELSIF\s+v_per_month\s+IS\s+NOT\s+NULL\s+THEN[\s\S]*?grow_id_required_for_plan/i,
      );
    }
  });

  it("preserves current status, Founder, weight, cap, and append-only allowance semantics", () => {
    for (const body of SPEND_OVERLOADS) {
      expect(body).toContain("s.price_id IN ('pro_monthly','pro_annual')");
      expect(body).toContain("s.status IN ('active','trialing') AND s.current_period_end > now()");
      expect(body).toContain("OR s.status = 'past_due'");
      expect(body).toContain("s.status = 'canceled' AND s.current_period_end > now()");
      expect(body).toContain("left(s.paddle_subscription_id, 9) = 'lifetime_'");
      expect(body).toContain("CASE p_model_tier WHEN 'escalated' THEN 5 ELSE 1 END");
      expect(body).toContain("FROM public.ai_credit_allowance(v_plan_id)");
      expect(body).toContain("INSERT INTO public.ai_credit_spends");
      expect(body).not.toMatch(/UPDATE\s+public\.ai_credit_spends/i);
      expect(body).not.toMatch(/DELETE\s+FROM\s+public\.ai_credit_spends/i);
    }
  });

  it("preserves the seven-argument result-cache and replay conflict contract", () => {
    for (const fragment of [
      "IF p_result IS NOT NULL THEN",
      "'reason', 'inline_result_not_allowed'",
      "LEFT JOIN public.ai_credit_spend_results cache",
      "COALESCE(cache.result, spend.result) AS cached_result",
      "v_existing.feature IS DISTINCT FROM p_feature",
      "v_existing.grow_id IS DISTINCT FROM p_grow_id",
      "v_existing.model_tier IS DISTINCT FROM p_model_tier",
      "v_existing.server_billing_environment IS DISTINCT FROM p_billing_environment",
      "'reason', 'idempotency_key_conflict'",
      "'reason', 'spend_refunded'",
      "'result', v_existing.cached_result",
      "p_idempotency_key, NULL",
      "RETURNING id, created_at INTO v_new_id, v_new_created_at",
    ]) {
      expect(SERVER_SPEND).toContain(fragment);
    }
    expectInOrder(SERVER_SPEND, [
      "v_existing.feature IS DISTINCT FROM p_feature",
      "v_existing.grow_id IS DISTINCT FROM p_grow_id",
      "v_existing.model_tier IS DISTINCT FROM p_model_tier",
      "v_existing.server_billing_environment IS DISTINCT FROM p_billing_environment",
      "'reason', 'idempotency_key_conflict'",
      "IF v_existing.has_refund THEN",
      "'reason', 'spend_refunded'",
      "'result', v_existing.cached_result",
    ]);
    expect(SERVER_SPEND).toContain(
      "p_billing_environment = 'sandbox' AND s.environment = 'sandbox'",
    );
    expect(SERVER_SPEND).toContain("CASE s.environment WHEN 'live' THEN 0 ELSE 1 END");
  });

  it("preserves legacy inline-result compatibility without changing expand-stage grants", () => {
    expect(LEGACY_SPEND).toContain("'result', v_existing.result");
    expect(LEGACY_SPEND).toContain("p_idempotency_key, p_result");
    expect(LEGACY_SPEND).not.toContain("inline_result_not_allowed");
    expect(LEGACY_SPEND).toContain("s.environment = 'live'");
    expect(MIGRATION).not.toContain(
      "REVOKE ALL ON FUNCTION public.ai_credit_spend(text, uuid, text, text, jsonb)",
    );
    expect(MIGRATION).not.toContain(
      "GRANT EXECUTE ON FUNCTION public.ai_credit_spend(text, uuid, text, text, jsonb)",
    );
  });

  it("reasserts the seven-argument overload as service-only", () => {
    const signature = "public.ai_credit_spend(uuid, text, text, uuid, text, text, jsonb)";
    for (const role of ["PUBLIC", "anon", "authenticated"]) {
      expect(MIGRATION).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM ${role}`);
    }
    expect(MIGRATION).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role`);
    expect(MIGRATION).not.toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO authenticated`);
    expect(SERVER_SPEND).toContain("v_role IS DISTINCT FROM 'service_role'");
  });

  it("does not broaden table mutation privileges or alter billing/schema policy surfaces", () => {
    expect(MIGRATION).not.toMatch(/GRANT[^;]+ON\s+TABLE\s+public\.ai_credit_spends/i);
    expect(MIGRATION).not.toMatch(/GRANT[^;]+ON\s+TABLE\s+public\.ai_credit_spend_results/i);
    expect(MIGRATION).not.toMatch(
      /ALTER\s+TABLE\s+public\.(?:billing_subscriptions|subscriptions)/i,
    );
    expect(MIGRATION).not.toMatch(/(?:CREATE|ALTER|DROP)\s+POLICY/i);
    expect(MIGRATION).not.toMatch(/CREATE\s+TABLE/i);
    expect(MIGRATION).not.toMatch(/DROP\s+TABLE/i);
    expect(MIGRATION).not.toMatch(/TRUNCATE/i);
  });
});
