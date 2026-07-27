import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const MIGRATIONS = resolve(ROOT, "supabase/migrations");
const FORWARD_FILENAME = "20260727050000_ai_credit_service_contract_forward_reassert.sql";
const FORWARD = readFileSync(resolve(MIGRATIONS, FORWARD_FILENAME), "utf8");
const EXECUTABLE = FORWARD.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const NORMALIZED = EXECUTABLE.replace(/\s+/g, " ").trim().toLowerCase();

const SERVICE_SPEND_SIGNATURE =
  /create or replace function public\.ai_credit_spend\(\s*p_user_id uuid,\s*p_billing_environment text,\s*p_feature text,\s*p_grow_id uuid,\s*p_model_tier text,\s*p_idempotency_key text,\s*p_result jsonb default null::jsonb\s*\)/i;
const SERVICE_REFUND_SIGNATURE =
  /create or replace function public\.ai_credit_refund\(\s*p_expected_user_id uuid,\s*p_spend_id uuid,\s*p_idempotency_key text,\s*p_reason text default 'upstream_failure'\s*\)/i;

describe("AI-credit service contract forward reassertion", () => {
  it("fails closed unless every authoritative dependency already exists", () => {
    for (const dependency of [
      "public.ai_credit_grants",
      "public.ai_credit_spend_results",
      "public.ai_credit_allowance(text)",
      "public.ai_credit_spend(uuid,text,text,uuid,text,text,jsonb)",
      "public.ai_credit_refund(uuid,uuid,text,text)",
    ]) {
      expect(FORWARD).toContain(`'${dependency}'`);
    }
    expect(FORWARD).toContain("RAISE EXCEPTION");
  });

  it("reasserts only the two service overloads", () => {
    expect(EXECUTABLE.match(SERVICE_SPEND_SIGNATURE)).toHaveLength(1);
    expect(EXECUTABLE.match(SERVICE_REFUND_SIGNATURE)).toHaveLength(1);
    expect(EXECUTABLE).not.toMatch(
      /create or replace function public\.ai_credit_spend\(\s*p_feature text/i,
    );
    expect(EXECUTABLE).not.toMatch(
      /create or replace function public\.ai_credit_refund\(\s*p_spend_id uuid/i,
    );
  });

  it("keeps replay bound to context, cached output, refund state, and database time", () => {
    expect(NORMALIZED).toContain("inline_result_not_allowed");
    expect(NORMALIZED).toContain("left join public.ai_credit_spend_results cache");
    for (const binding of [
      "v_existing.feature is distinct from p_feature",
      "v_existing.grow_id is distinct from p_grow_id",
      "v_existing.model_tier is distinct from p_model_tier",
      "v_existing.server_billing_environment is distinct from p_billing_environment",
    ]) {
      expect(NORMALIZED).toContain(binding);
    }

    const refundGuard = NORMALIZED.indexOf("if v_existing.has_refund then");
    const cachedReplay = NORMALIZED.indexOf("'result', v_existing.cached_result");
    expect(refundGuard).toBeGreaterThan(-1);
    expect(cachedReplay).toBeGreaterThan(refundGuard);
    expect(NORMALIZED).toContain("'grow_id', p_grow_id");
    expect(NORMALIZED).toContain("'spend_created_at', v_existing.created_at");
    expect(NORMALIZED).toContain("'spend_age_ms', greatest(");
  });

  it("preserves Craft allowance-first pack accounting and refund provenance", () => {
    expect(NORMALIZED).toContain(
      "s.price_id in ('pro_monthly','pro_annual','craft_monthly','craft_annual')",
    );
    expect(NORMALIZED).toContain("from public.ai_credit_grants");
    expect(NORMALIZED).toContain("v_funded_by := 'allowance'");
    expect(NORMALIZED).toContain("v_funded_by := 'pack'");
    expect(NORMALIZED).toContain(
      "jsonb_build_object('reason', p_reason, 'funded_by', v_orig.meta ->> 'funded_by')",
    );
  });

  it("pins service-only RPC grants and the read-only result sidecar ACL", () => {
    for (const signature of [
      "public.ai_credit_spend(uuid, text, text, uuid, text, text, jsonb)",
      "public.ai_credit_refund(uuid, uuid, text, text)",
    ]) {
      expect(FORWARD).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC`);
      expect(FORWARD).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM anon`);
      expect(FORWARD).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM authenticated`);
      expect(FORWARD).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role`);
    }
    expect(FORWARD).toContain(
      "REVOKE ALL ON TABLE public.ai_credit_spend_results FROM service_role",
    );
    expect(FORWARD).toContain(
      "GRANT SELECT ON TABLE public.ai_credit_spend_results TO service_role",
    );
    expect(FORWARD).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.ai_credit_(?:spend|refund)[^;]+TO authenticated/i,
    );
  });

  it("is the final migration that defines either service overload", () => {
    const definingMigrations = readdirSync(MIGRATIONS)
      .filter((name) => /^\d{14}_.+\.sql$/.test(name))
      .sort()
      .filter((name) => {
        const sql = readFileSync(resolve(MIGRATIONS, name), "utf8");
        return SERVICE_SPEND_SIGNATURE.test(sql) || SERVICE_REFUND_SIGNATURE.test(sql);
      });

    expect(definingMigrations.at(-1)).toBe(FORWARD_FILENAME);
  });
});

describe("AI-credit runtime receipt assertion", () => {
  it("cannot pass when both fresh and replay timestamps are missing", () => {
    const harness = readFileSync(resolve(ROOT, "scripts/run-ai-credits-rls-harness.ts"), "utf8");
    const assertionStart = harness.indexOf(
      '"same-key replay returns the original spend_created_at"',
    );
    const assertion = harness.slice(assertionStart, assertionStart + 700);

    expect(assertion).toContain('typeof (s1 as any)?.spend_created_at === "string"');
    expect(assertion).toContain("Number.isFinite(Date.parse((s1 as any).spend_created_at))");
    expect(assertion).toContain('typeof (s2 as any)?.spend_created_at === "string"');
    expect(assertion).toContain("Number.isFinite(Date.parse((s2 as any).spend_created_at))");
  });
});
