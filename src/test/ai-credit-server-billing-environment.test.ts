import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");
const EXPAND = read(
  "supabase/migrations/20260718160000_ai_credit_server_billing_environment_expand.sql",
);
const CONTRACT = read(
  "supabase/contract-migrations/ai_credit_server_billing_environment_contract.sql",
);
const DOCTOR = read("supabase/functions/ai-doctor-review/index.ts");
const COACH = read("supabase/functions/ai-coach/index.ts");
const HARNESS = read("scripts/run-ai-credits-rls-harness.ts");

function executableSource(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("AI credit server billing-environment boundary", () => {
  it("exposes the environment-aware spend overload only to service_role", () => {
    expect(EXPAND).toMatch(
      /CREATE OR REPLACE FUNCTION public\.ai_credit_spend\(\s*p_user_id uuid,\s*p_billing_environment text,/,
    );
    expect(EXPAND).toContain("v_role text := current_setting('role', true)");
    expect(EXPAND).toContain("v_role IS DISTINCT FROM 'service_role'");
    expect(EXPAND).toContain("'reason', 'not_authorized'");
    expect(EXPAND).toMatch(
      /REVOKE ALL ON FUNCTION public\.ai_credit_spend\(uuid, text, text, uuid, text, text, jsonb\) FROM authenticated/,
    );
    expect(EXPAND).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.ai_credit_spend\(uuid, text, text, uuid, text, text, jsonb\) TO service_role/,
    );
    expect(EXPAND).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.ai_credit_spend\(uuid, text, text, uuid, text, text, jsonb\) TO authenticated/,
    );
  });

  it("keeps legacy grants during expand and retires them only in the isolated contract template", () => {
    for (const role of ["PUBLIC", "anon", "authenticated", "service_role"]) {
      const spendRevoke = `REVOKE ALL ON FUNCTION public.ai_credit_spend(text, uuid, text, text, jsonb) FROM ${role}`;
      const refundRevoke = `REVOKE ALL ON FUNCTION public.ai_credit_refund(uuid, text, text) FROM ${role}`;
      expect(EXPAND).not.toContain(spendRevoke);
      expect(EXPAND).not.toContain(refundRevoke);
      expect(CONTRACT).toContain(spendRevoke);
      expect(CONTRACT).toContain(refundRevoke);
    }
    expect(EXPAND).toContain("EXPAND STAGE ONLY");
    expect(CONTRACT).toContain("NOT AUTO-APPLIED");
    expect(EXPAND).toContain("p_model_tier NOT IN ('standard','escalated')");
    expect(EXPAND).toContain("CASE p_model_tier WHEN 'escalated' THEN 5 ELSE 1 END");
    const automaticMigrations = readdirSync(resolve(ROOT, "supabase", "migrations"));
    expect(
      automaticMigrations.some((name) =>
        name.includes("ai_credit_server_billing_environment_contract"),
      ),
    ).toBe(false);
    const pendingAiCreditSql = automaticMigrations
      .filter((name) => name >= "20260718160000" && name.endsWith(".sql"))
      .map((name) => read(`supabase/migrations/${name}`))
      .join("\n");
    expect(pendingAiCreditSql).not.toContain(
      "REVOKE ALL ON FUNCTION public.ai_credit_spend(text, uuid, text, text, jsonb)",
    );
    expect(pendingAiCreditSql).not.toContain(
      "REVOKE ALL ON FUNCTION public.ai_credit_refund(uuid, text, text)",
    );
    expect(HARNESS).toContain('process.env.AI_CREDIT_ROLLOUT_PHASE ?? "contract"');
    expect(HARNESS).toContain("if (isContractPhase)");
    expect(HARNESS).toContain(
      "expand: legacy authenticated spend remains available for rollback safety",
    );
    expect(HARNESS).toContain(
      "expand: legacy authenticated refund remains available for rollback safety",
    );
  });

  it("contract preflight requires the expected expand functions and grant posture", () => {
    for (const signature of [
      "public.ai_credit_spend(uuid,text,text,uuid,text,text,jsonb)",
      "public.ai_credit_refund(uuid,uuid,text,text)",
      "public.ai_credit_spend(text,uuid,text,text,jsonb)",
      "public.ai_credit_refund(uuid,text,text)",
    ]) {
      expect(CONTRACT).toContain(`'${signature}'`);
    }
    expect(CONTRACT).toContain("has_function_privilege('service_role'");
    expect(CONTRACT).toContain("has_function_privilege('authenticated'");
    expect(CONTRACT).toContain("has_function_privilege('anon'");
    expect(CONTRACT).toContain("RAISE EXCEPTION 'ai-credit contract blocked:");
  });

  it("moves refunds behind a service-only ownership-checking overload", () => {
    expect(EXPAND).toMatch(
      /CREATE OR REPLACE FUNCTION public\.ai_credit_refund\(\s*p_expected_user_id uuid,/,
    );
    expect(EXPAND).toContain("v_uid uuid := p_expected_user_id");
    expect(EXPAND).toContain("v_orig.user_id <> v_uid");
    expect(EXPAND).toContain("refund_of = p_spend_id");
    expect(EXPAND).toContain("v_existing_by_key.refund_of = p_spend_id");
    expect(EXPAND).toContain("'reason', 'idempotency_key_conflict'");
    expect(CONTRACT).toMatch(
      /REVOKE ALL ON FUNCTION public\.ai_credit_refund\(uuid, text, text\) FROM authenticated/,
    );
    expect(EXPAND).toMatch(
      /REVOKE ALL ON FUNCTION public\.ai_credit_refund\(uuid, uuid, text, text\) FROM authenticated/,
    );
    expect(EXPAND).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.ai_credit_refund\(uuid, uuid, text, text\) TO service_role/,
    );
    expect(EXPAND).toContain("NOTIFY pgrst, 'reload schema'");
    expect(EXPAND).not.toMatch(/UPDATE\s+public\.ai_credit_spends/i);
  });

  it("honors sandbox only on a sandbox server and always gives a valid live row precedence", () => {
    expect(EXPAND).toContain("p_billing_environment NOT IN ('live', 'sandbox')");
    expect(EXPAND).toMatch(
      /s\.environment = 'live'\s+OR \(p_billing_environment = 'sandbox' AND s\.environment = 'sandbox'\)/,
    );
    expect(EXPAND).toContain("CASE s.environment WHEN 'live' THEN 0 ELSE 1 END");
    expect(EXPAND).toContain("CASE s.price_id WHEN 'founder_lifetime' THEN 0 ELSE 1 END");
    expect(EXPAND).toContain("s.paddle_subscription_id DESC");
    expect(EXPAND).not.toMatch(/FROM\s+public\.billing_subscriptions/i);
  });

  it("preserves status policy, Founder validation, staff cap, locking, and append-only ledger", () => {
    expect(EXPAND).toContain("s.status IN ('active','trialing') AND s.current_period_end > now()");
    expect(EXPAND).toContain("OR s.status = 'past_due'");
    expect(EXPAND).toContain("s.status = 'canceled' AND s.current_period_end > now()");
    expect(EXPAND).toContain("left(s.paddle_subscription_id, 9) = 'lifetime_'");
    expect(EXPAND).toContain("v_per_month := 10000");
    expect(EXPAND).toContain("pg_advisory_xact_lock(hashtext(v_uid::text))");
    expect(EXPAND).toContain("WHERE user_id = v_uid AND idempotency_key = p_idempotency_key");
    expect(EXPAND).toContain("INSERT INTO public.ai_credit_spends");
    expect(EXPAND).not.toMatch(/UPDATE\s+public\.ai_credit_spends/i);
    expect(EXPAND).not.toMatch(/DELETE\s+FROM\s+public\.ai_credit_spends/i);
  });

  it("serializes spend replay lookup before reading the idempotency key", () => {
    const lockIndex = EXPAND.indexOf("PERFORM pg_advisory_xact_lock(hashtext(v_uid::text))");
    const replayIndex = EXPAND.indexOf(
      "WHERE user_id = v_uid AND idempotency_key = p_idempotency_key",
    );
    expect(lockIndex).toBeGreaterThan(-1);
    expect(replayIndex).toBeGreaterThan(lockIndex);

    const refundStart = EXPAND.indexOf("CREATE OR REPLACE FUNCTION public.ai_credit_refund(");
    const refundLockIndex = EXPAND.indexOf(
      "PERFORM pg_advisory_xact_lock(hashtext(v_uid::text))",
      refundStart,
    );
    const refundReplayIndex = EXPAND.indexOf(
      "WHERE user_id = v_uid AND idempotency_key = p_idempotency_key",
      refundStart,
    );
    expect(refundStart).toBeGreaterThan(-1);
    expect(refundLockIndex).toBeGreaterThan(refundStart);
    expect(refundReplayIndex).toBeGreaterThan(refundLockIndex);
  });

  it("keeps a runtime regression for concurrent same-key spend replay", () => {
    expect(HARNESS).toContain("const concurrentResponses = await Promise.all([");
    expect(HARNESS.match(/serverSpend\(uidPro, "live", concurrentArgs\)/g) ?? []).toHaveLength(2);
    expect(HARNESS).toContain('JSON.stringify(["replayed", "spent"])');
    expect(HARNESS).toContain("concurrent same-key spend inserts exactly one row");
    expect(HARNESS).toContain("const concurrentRefundResponses = await Promise.all([");
    expect(
      HARNESS.match(/serverRefund\(uidFree, spends\[1\], concurrentRefundKey/g) ?? [],
    ).toHaveLength(2);
    expect(HARNESS).toContain('JSON.stringify(["refunded", "replayed"])');
    expect(HARNESS).toContain("concurrent same-key refund inserts exactly one reversal");
  });

  for (const [label, source] of [
    ["AI Doctor", DOCTOR],
    ["AI Coach", COACH],
  ] as const) {
    it(`${label} derives environment and user identity on the server before spending`, () => {
      const code = executableSource(source);
      expect(code).toContain("resolveRequiredServerBillingEnvironment()");
      expect(code).toMatch(/creditSupabase\.rpc\(\s*["']ai_credit_spend["']/);
      expect(code).toMatch(/creditSupabase\.rpc\(\s*["']ai_credit_refund["']/);
      expect(code).toContain("const userId = u.user.id");
      expect(code).toContain("p_user_id: userId");
      expect(code).toContain("p_expected_user_id: userId");
      expect(code).toContain("p_billing_environment: billingEnvironment");
      expect(code).toContain("p_model_tier: MODEL_TIER");
      expect(code).toContain("p_feature: FEATURE");
      expect(code).not.toMatch(/(?:body|requestBody)\.billing_?[Ee]nvironment/);
      expect(code).not.toMatch(/(?:body|requestBody)\.user_?[Ii]d/);
      expect(code).not.toMatch(/(?:body|requestBody)\.(?:modelTier|model_tier|weight|plan)/);
      expect(code).not.toMatch(/creditSupabase\s*\.from\(/);
      expect(code).toContain("isMissingAiCreditRpcOverload(");

      const jwtIndex = code.indexOf("await supabase.auth.getUser()");
      const spendIndex = code.indexOf('creditSupabase.rpc("ai_credit_spend"');
      expect(jwtIndex).toBeGreaterThan(-1);
      expect(spendIndex).toBeGreaterThan(jwtIndex);
    });
  }
});
