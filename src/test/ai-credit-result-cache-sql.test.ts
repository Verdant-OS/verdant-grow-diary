import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");
const MIGRATION = read("supabase/migrations/20260719043000_ai_credit_result_cache.sql");
const CONTRACT = read(
  "supabase/contract-migrations/ai_credit_server_billing_environment_contract.sql",
);
const HARNESS = read("scripts/run-ai-credits-rls-harness.ts");

describe("AI credit immutable result cache SQL", () => {
  it("creates a bounded insert-once sidecar with account-lifecycle cleanup", () => {
    expect(MIGRATION).toContain("CREATE TABLE public.ai_credit_spend_results");
    expect(MIGRATION).toContain("spend_id uuid PRIMARY KEY");
    expect(MIGRATION).toContain("REFERENCES public.ai_credit_spends(id) ON DELETE CASCADE");
    expect(MIGRATION).toContain("feature IN ('ai_doctor_review', 'ai_coach')");
    expect(MIGRATION).toContain("jsonb_typeof(result) = 'object'");
    expect(MIGRATION).toContain("result <> '{}'::jsonb");
    expect(MIGRATION).toContain("octet_length(result::text) <= 131072");
    expect(MIGRATION).toContain("recorded_at timestamptz NOT NULL DEFAULT now()");
    expect(MIGRATION).not.toContain("CREATE POLICY");
  });

  it("keeps the sidecar private and gives service_role read-only table access", () => {
    expect(MIGRATION).toContain(
      "ALTER TABLE public.ai_credit_spend_results ENABLE ROW LEVEL SECURITY",
    );
    for (const role of ["PUBLIC", "anon", "authenticated", "service_role"]) {
      expect(MIGRATION).toContain(
        `REVOKE ALL ON TABLE public.ai_credit_spend_results FROM ${role}`,
      );
    }
    expect(MIGRATION).toContain(
      "GRANT SELECT ON TABLE public.ai_credit_spend_results TO service_role",
    );
    expect(MIGRATION).not.toMatch(
      /GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)[^;]*ai_credit_spend_results[^;]*service_role/i,
    );
    expect(MIGRATION).not.toMatch(/GRANT[^;]*ai_credit_spend_results[^;]*(?:anon|authenticated)/i);
  });

  it("exposes a narrow service-only result recorder with defense in depth", () => {
    expect(MIGRATION).toMatch(
      /CREATE OR REPLACE FUNCTION public\.ai_credit_attach_result\(\s*p_expected_user_id uuid,\s*p_spend_id uuid,\s*p_expected_feature text,\s*p_result jsonb/,
    );
    expect(MIGRATION).toContain("SECURITY DEFINER");
    expect(MIGRATION).toContain("v_role IS DISTINCT FROM 'service_role'");
    expect(MIGRATION).toContain("p_expected_feature IS NULL");
    expect(MIGRATION).toContain("jsonb_typeof(p_result) IS DISTINCT FROM 'object'");
    expect(MIGRATION).toContain("p_result = '{}'::jsonb");
    expect(MIGRATION).toContain("octet_length(p_result::text) > 131072");
    for (const role of ["PUBLIC", "anon", "authenticated"]) {
      expect(MIGRATION).toContain(
        `REVOKE ALL ON FUNCTION public.ai_credit_attach_result(uuid, uuid, text, jsonb) FROM ${role}`,
      );
    }
    expect(MIGRATION).toContain(
      "GRANT EXECUTE ON FUNCTION public.ai_credit_attach_result(uuid, uuid, text, jsonb) TO service_role",
    );
  });

  it("blocks new inline ledger results while retaining historical inline reads", () => {
    expect(MIGRATION).toContain("ADD CONSTRAINT ai_credit_spends_new_result_must_be_null");
    expect(MIGRATION).toContain("CHECK (result IS NULL) NOT VALID");
    expect(MIGRATION).toContain("IF p_result IS NOT NULL THEN");
    expect(MIGRATION).toContain("'reason', 'inline_result_not_allowed'");
    expect(MIGRATION).toContain("p_idempotency_key, NULL,");
    expect(MIGRATION).toContain("COALESCE(cache.result, spend.result) AS cached_result");
  });

  it("locks, checks ownership/feature/refunds, and never overwrites a result", () => {
    expect(MIGRATION).toContain(
      "PERFORM pg_advisory_xact_lock(hashtext(p_expected_user_id::text))",
    );
    expect(MIGRATION).toContain("v_spend.user_id <> p_expected_user_id");
    expect(MIGRATION).toContain("v_spend.status <> 'spent'");
    expect(MIGRATION).toContain("v_spend.refund_of IS NOT NULL");
    expect(MIGRATION).toContain("v_spend.feature <> p_expected_feature");
    expect(MIGRATION).toContain("reversal.refund_of = p_spend_id");
    expect(MIGRATION).toContain("'reason', 'spend_refunded'");
    expect(MIGRATION).toContain("v_spend.result <> p_result");
    expect(MIGRATION).toContain("v_sidecar_feature <> p_expected_feature");
    expect(MIGRATION).toContain("v_sidecar_result <> p_result");
    expect(MIGRATION).toContain("'reason', 'result_conflict'");
    expect(MIGRATION).toContain("INSERT INTO public.ai_credit_spend_results");
    expect(MIGRATION).not.toMatch(/UPDATE\s+public\.ai_credit_spend_results/i);
    expect(MIGRATION).not.toMatch(/DELETE\s+FROM\s+public\.ai_credit_spend_results/i);
    expect(MIGRATION).not.toMatch(/UPDATE\s+public\.ai_credit_spends/i);
    expect(MIGRATION).not.toMatch(/DELETE\s+FROM\s+public\.ai_credit_spends/i);
  });

  it("binds replay context before returning cached output and suppresses refunds", () => {
    expect(MIGRATION).toContain("COALESCE(cache.result, spend.result) AS cached_result");
    expect(MIGRATION).toContain("LEFT JOIN public.ai_credit_spend_results cache");
    expect(MIGRATION).toContain("cache.feature = spend.feature");
    expect(MIGRATION).toContain("reversal.refund_of = spend.id");
    expect(MIGRATION).toContain("v_existing.feature IS DISTINCT FROM p_feature");
    expect(MIGRATION).toContain("v_existing.grow_id IS DISTINCT FROM p_grow_id");
    expect(MIGRATION).toContain("v_existing.model_tier IS DISTINCT FROM p_model_tier");
    expect(MIGRATION).toContain(
      "v_existing.server_billing_environment IS DISTINCT FROM p_billing_environment",
    );
    expect(MIGRATION).toContain(
      "COALESCE(spend.meta ->> 'server_billing_environment', 'live') AS server_billing_environment",
    );
    expect(MIGRATION).toContain("'reason', 'idempotency_key_conflict'");
    expect(MIGRATION).toContain("IF v_existing.has_refund THEN");
    expect(MIGRATION).toContain("'result', v_existing.cached_result");
    expect(MIGRATION).toContain("'spend_created_at', v_existing.created_at");
    expect(MIGRATION).toContain("'spend_created_at', v_new_created_at");
    expect(MIGRATION).toContain("'spend_age_ms', GREATEST(");
    expect(MIGRATION).toContain("clock_timestamp() - v_existing.created_at");
    expect(MIGRATION).toContain("'spend_age_ms', 0");
    expect(MIGRATION).toContain("'grow_id', v_existing.grow_id");
    expect(MIGRATION).toContain("'grow_id', p_grow_id");
    expect(MIGRATION.indexOf("v_existing.feature IS DISTINCT FROM p_feature")).toBeLessThan(
      MIGRATION.indexOf("'result', v_existing.cached_result"),
    );
    expect(MIGRATION.indexOf("IF v_existing.has_refund THEN")).toBeLessThan(
      MIGRATION.indexOf("'result', v_existing.cached_result"),
    );
    expect(MIGRATION).toContain("RETURNING id, created_at INTO v_new_id, v_new_created_at");
  });

  it("extends the contract preflight and final grants to the recorder/cache", () => {
    expect(CONTRACT).toContain("'public.ai_credit_attach_result(uuid,uuid,text,jsonb)'");
    expect(CONTRACT).toContain("to_regclass('public.ai_credit_spend_results')");
    expect(CONTRACT).toContain(
      "has_function_privilege('service_role', v_attach_result::oid, 'EXECUTE')",
    );
    expect(CONTRACT).toContain(
      "has_table_privilege('service_role', v_result_cache::oid, 'SELECT')",
    );
    expect(CONTRACT).toContain(
      "has_table_privilege('service_role', v_result_cache::oid, 'INSERT')",
    );
    expect(CONTRACT).toContain(
      "has_table_privilege('service_role', v_result_cache::oid, 'UPDATE')",
    );
    expect(CONTRACT).toContain(
      "has_table_privilege('service_role', v_result_cache::oid, 'DELETE')",
    );
    expect(CONTRACT).toContain(
      "GRANT SELECT ON TABLE public.ai_credit_spend_results TO service_role",
    );
    expect(CONTRACT).not.toContain(
      "GRANT SELECT, INSERT ON TABLE public.ai_credit_spend_results TO service_role",
    );
  });

  it("keeps runtime proof for privacy, immutability, replay, refund, and cascade", () => {
    for (const proof of [
      "authenticated client cannot invoke result recorder",
      "anon cannot invoke result recorder",
      "authenticated result-cache SELECT of an owned attached result is denied / empty",
      "authenticated result-cache INSERT denied",
      "spend RPC rejects inline cached result",
      "ledger constraint rejects direct inline cached result",
      "service role cannot INSERT a result directly",
      "service role cannot UPDATE an attached result",
      "service role cannot DELETE an attached result directly",
      "attaching output leaves the spend row immutable",
      "equal result attachment replays successfully",
      "different result attachment is rejected as a conflict",
      "same-key replay returns the cached validated result",
      "same idempotency key remains isolated between users",
      "fresh spend returns bound grow_id and zero database age",
      "same-key replay returns bound grow_id and nonnegative database age",
      "cached same-key replay adds no credit weight",
      "refund suppresses cached output on same-key replay",
      "result recorder rejects a reversed spend",
      "account deletion removes both spend and result sidecar",
      "authenticated mutation attempts leave attached result unchanged",
    ]) {
      expect(HARNESS).toContain(proof);
    }
    for (const rejected of [
      "wrong user",
      "wrong feature",
      "null feature",
      "scalar result",
      "null result",
      "empty result",
      "oversized result",
    ]) {
      expect(HARNESS).toContain(`label: "${rejected}"`);
    }
    for (const conflict of ["cross-feature", "cross-grow", "cross-model", "cross-environment"]) {
      expect(HARNESS).toContain(`label: "${conflict}"`);
      expect(HARNESS).toContain("same-key replay is rejected without cached output");
    }
  });
});
