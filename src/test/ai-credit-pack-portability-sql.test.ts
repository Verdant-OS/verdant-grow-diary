/**
 * Forward-only credit-pack portability contract.
 *
 * This pins the authoritative service spend overload without mutating any
 * published migration. Included plan allowance remains first; an
 * environment-bound grant pool is durable overflow under either Free
 * per-grow or paid per-month scope.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const MIGRATIONS = resolve(ROOT, "supabase/migrations");
const FILENAME = "20260728090736_ai_credit_pack_portability.sql";
const MIGRATION = readFileSync(resolve(MIGRATIONS, FILENAME), "utf8").replace(/\r\n?/g, "\n");
const EXECUTABLE = MIGRATION.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const NORMALIZED = EXECUTABLE.replace(/\s+/g, " ").trim().toLowerCase();

const SERVICE_SPEND_SIGNATURE =
  /create or replace function public\.ai_credit_spend\(\s*p_user_id uuid,\s*p_billing_environment text,\s*p_feature text,\s*p_grow_id uuid,\s*p_model_tier text,\s*p_idempotency_key text,\s*p_result jsonb default null::jsonb\s*\)/i;
const ANY_SERVICE_SPEND_DEFINITION =
  /create or replace function public\.ai_credit_spend\(\s*p_user_id uuid,\s*p_billing_environment text/i;
const LEGACY_SIGNATURES = [
  "public.ai_credit_spend(text, uuid, text, text, jsonb)",
  "public.ai_credit_refund(uuid, text, text)",
] as const;

function position(needle: string): number {
  const at = NORMALIZED.indexOf(needle);
  expect(at, `missing SQL contract: ${needle}`).toBeGreaterThan(-1);
  return at;
}

describe("AI-credit pack portability migration", () => {
  it("is a later forward migration and replaces only the authoritative service spend overload", () => {
    expect(Number(FILENAME.slice(0, 14))).toBeGreaterThan(20260728090000);
    expect(EXECUTABLE.match(SERVICE_SPEND_SIGNATURE)).toHaveLength(1);
    expect(EXECUTABLE.match(/create or replace function public\.ai_credit_refund\(/gi)).toBeNull();
    expect(EXECUTABLE).not.toMatch(
      /create or replace function public\.ai_credit_spend\(\s*p_feature text/i,
    );
  });

  it("fails closed unless every existing money dependency is present", () => {
    for (const dependency of [
      "public.ai_credit_grants",
      "public.ai_credit_spends",
      "public.ai_credit_spend_results",
      "public.ai_credit_allowance(text)",
      "public.ai_credit_spend(uuid,text,text,uuid,text,text,jsonb)",
      "public.ai_credit_refund(uuid,uuid,text,text)",
    ]) {
      expect(MIGRATION).toContain(`'${dependency}'`);
    }
    expect(MIGRATION).toContain("RAISE EXCEPTION");
  });

  it("keeps Free at three credits per grow and paid plans on their existing monthly allowance", () => {
    expect(NORMALIZED).toContain("select per_grow, per_month into v_per_grow, v_per_month");
    expect(NORMALIZED).toContain("from public.ai_credit_allowance(v_plan_id)");
    expect(NORMALIZED).toContain("if v_per_grow is not null then");
    expect(NORMALIZED).toContain("v_scope := 'per_grow'");
    expect(NORMALIZED).toContain("'grow_id_required_for_plan'");
    expect(NORMALIZED).toContain("elsif v_per_month is not null then");
    expect(NORMALIZED).toContain("v_scope := 'per_month'");
    expect(NORMALIZED).toContain(
      "s.price_id in ('pro_monthly','pro_annual','craft_monthly','craft_annual')",
    );
  });

  it("derives one environment-bound grant pool independent of allowance scope", () => {
    expect(NORMALIZED).toContain("grant_row.environment = p_billing_environment");
    expect(NORMALIZED).toContain("grant_row.expires_at is null or grant_row.expires_at > now()");
    expect(NORMALIZED).toContain("left join public.ai_credit_spends original_spend");
    expect(NORMALIZED).toContain("original_spend.id = spend_row.refund_of");
    expect(NORMALIZED).toContain(
      "coalesce( spend_row.meta ->> 'server_billing_environment', original_spend.meta ->> 'server_billing_environment', 'live' ) = p_billing_environment",
    );
    expect(NORMALIZED).toContain("v_pack_balance := v_pack_granted - v_pack_used");

    const balanceStart = position("select coalesce(sum(grant_row.credits), 0) into v_pack_granted");
    const balanceEnd = position("v_pack_balance := v_pack_granted - v_pack_used");
    const balanceBlock = NORMALIZED.slice(balanceStart, balanceEnd);
    expect(balanceBlock).not.toContain("if v_scope = 'per_month'");
    expect(balanceBlock).not.toContain("v_scope = 'per_grow'");
  });

  it("uses included allowance first, then portable grant balance under either scope", () => {
    const allowanceChoice = position("if v_used + v_weight <= v_limit then");
    const packChoice = position("elsif v_pack_balance >= v_weight then");
    const denial = position("'reason', 'limit_reached'");

    expect(allowanceChoice).toBeLessThan(packChoice);
    expect(packChoice).toBeLessThan(denial);
    expect(NORMALIZED).toContain("v_funded_by := 'allowance'");
    expect(NORMALIZED).toContain("v_funded_by := 'pack'");
    expect(NORMALIZED).not.toContain("elsif v_scope = 'per_month' and v_pack_balance >= v_weight");
  });

  it("preserves ownership, idempotent replay, cached result, refund, and concurrency guards", () => {
    expect(NORMALIZED).toContain("pg_advisory_xact_lock(hashtext(v_uid::text))");
    expect(NORMALIZED).toContain("grow_row.user_id = v_uid");
    expect(NORMALIZED).toContain("for share");
    expect(NORMALIZED).toContain("left join public.ai_credit_spend_results cache");
    for (const binding of [
      "v_existing.feature is distinct from p_feature",
      "v_existing.grow_id is distinct from p_grow_id",
      "v_existing.model_tier is distinct from p_model_tier",
      "v_existing.server_billing_environment is distinct from p_billing_environment",
    ]) {
      expect(NORMALIZED).toContain(binding);
    }
    expect(NORMALIZED).toContain("'reason', 'idempotency_key_conflict'");
    expect(NORMALIZED).toContain("'reason', 'spend_refunded'");
    expect(NORMALIZED).toContain("'status', 'replayed'");
    expect(NORMALIZED).toContain("'result', v_existing.cached_result");
  });

  it("stores one immutable post-spend receipt and rehydrates it without recomputing balances", () => {
    expect(NORMALIZED).toContain("v_receipt_snapshot := jsonb_build_object(");
    for (const field of [
      "plan_id",
      "scope",
      "scope_used",
      "scope_limit",
      "remaining",
      "funded_by",
      "pack_balance",
    ]) {
      expect(NORMALIZED).toContain(`'${field}'`);
    }
    for (const field of ["scope_used", "scope_limit", "remaining", "pack_balance"]) {
      expect(NORMALIZED).toContain(`v_existing.receipt_snapshot -> '${field}'`);
    }
    for (const field of ["plan_id", "scope", "funded_by"]) {
      expect(NORMALIZED).toContain(`v_existing.receipt_snapshot ->> '${field}'`);
    }
    expect(NORMALIZED).toContain("'receipt_snapshot', v_receipt_snapshot");
    expect(NORMALIZED).toContain("return v_receipt_snapshot || jsonb_build_object(");

    const replayStart = position("if v_existing.status = 'spent' then");
    const replayEnd = position("'reason', 'spend_not_replayable'");
    const replayBlock = NORMALIZED.slice(replayStart, replayEnd);
    expect(replayBlock).toContain("v_existing.receipt_snapshot");
    expect(replayBlock).not.toContain("from public.ai_credit_grants");
    expect(replayBlock).not.toContain("from public.ai_credit_spends spend_row");
    expect(replayBlock).not.toContain("v_pack_balance :=");
    expect(replayBlock).not.toContain("v_used :=");
  });

  it("keeps the spend ledger append-only and records authoritative provenance", () => {
    expect(NORMALIZED).toContain("insert into public.ai_credit_spends");
    expect(NORMALIZED).toContain("'server_billing_environment', p_billing_environment");
    expect(NORMALIZED).toContain("'entitlement_environment', v_entitlement_environment");
    expect(NORMALIZED).toContain("'funded_by', v_funded_by");
    expect(EXECUTABLE).not.toMatch(/update\s+public\.ai_credit_spends/i);
    expect(EXECUTABLE).not.toMatch(/delete\s+from\s+public\.ai_credit_spends/i);
  });

  it("remains service-role-only in both body and ACL", () => {
    const signature = "public.ai_credit_spend(uuid, text, text, uuid, text, text, jsonb)";
    expect(NORMALIZED).toContain("if v_role is distinct from 'service_role' then");
    expect(NORMALIZED).toContain("'reason', 'not_authorized'");
    expect(MIGRATION).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC`);
    expect(MIGRATION).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM anon`);
    expect(MIGRATION).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM authenticated`);
    expect(MIGRATION).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role`);
    expect(MIGRATION).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.ai_credit_spend\([^;]+TO (?:anon|authenticated)/i,
    );
  });

  it("conditionally removes every API role from both legacy overloads", () => {
    for (const signature of LEGACY_SIGNATURES) {
      const compactSignature = signature.replace(/, /g, ",");
      expect(MIGRATION).toContain(`to_regprocedure('${compactSignature}')`);
      for (const role of ["PUBLIC", "anon", "authenticated", "service_role"]) {
        expect(MIGRATION).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM ${role}`);
      }
    }
    expect(MIGRATION).toContain("DO $legacy_acl$");
    expect(MIGRATION).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.ai_credit_(?:spend|refund)\([^;]+TO (?:PUBLIC|anon|authenticated)/i,
    );
  });

  it("does not alter tables, policies, billing, auth, grant rows, or refund bodies", () => {
    expect(EXECUTABLE).not.toMatch(/(?:create|alter|drop)\s+table/i);
    expect(EXECUTABLE).not.toMatch(/(?:create|alter|drop)\s+policy/i);
    expect(EXECUTABLE).not.toMatch(/create\s+(?:unique\s+)?index/i);
    expect(EXECUTABLE).not.toMatch(/insert\s+into\s+public\.ai_credit_grants/i);
    expect(EXECUTABLE).not.toMatch(/update\s+public\.(?:subscriptions|billing_subscriptions)/i);
    expect(EXECUTABLE).not.toMatch(/alter\s+(?:role|function)\s+auth\./i);
  });

  it("is the latest authoritative service-spend definition", () => {
    const definingMigrations = readdirSync(MIGRATIONS)
      .filter((name) => /^\d{14}_.+\.sql$/.test(name))
      .sort()
      .filter((name) =>
        ANY_SERVICE_SPEND_DEFINITION.test(readFileSync(resolve(MIGRATIONS, name), "utf8")),
      );

    expect(definingMigrations.at(-1)).toBe(FILENAME);
  });
});
