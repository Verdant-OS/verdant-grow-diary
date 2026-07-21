/**
 * AI credit packs — PR2 static contract for the ai_credit_spend pack overflow.
 *
 * Pins the money-load-bearing invariants of the fold-in: Craft resolver +
 * allowance, pack-funded rows excluded from every plan-scope usage SUM
 * (no double-charge), derived pack balance, monthly-allowance-first spend
 * order, funded_by tagging, and — the correctness discriminator — the refund
 * propagating funded_by so a refunded pack spend restores pack (not allowance)
 * balance. Both overloads must carry the change.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260721104000_ai_credit_spend_pack_overflow.sql"),
  "utf8",
).replace(/\r\n/g, "\n");

function count(needle: string): number {
  return MIGRATION.split(needle).length - 1;
}

function allowanceBody(): string {
  const start = MIGRATION.indexOf("CREATE OR REPLACE FUNCTION public.ai_credit_allowance");
  const end = MIGRATION.indexOf("$$;", start);
  return MIGRATION.slice(start, end);
}

describe("ai_credit_spend pack overflow migration", () => {
  it("fails closed unless the grant ledger exists first", () => {
    expect(MIGRATION).toContain("to_regclass('public.ai_credit_grants') IS NULL");
    expect(MIGRATION).toContain("apply the grant-ledger migration first");
  });

  it("adds Craft (300/month) to the allowance mirror and keeps packs out of it", () => {
    const body = allowanceBody();
    expect(body).toContain("WHEN 'craft_monthly' THEN 300");
    expect(body).toContain("WHEN 'craft_annual' THEN 300");
    // Packs are a grant-ledger balance, never a plan cap — the SQL↔TS parity
    // test depends on the allowance staying plan-only.
    expect(body.toLowerCase()).not.toContain("pack");
    expect(body).not.toContain("ai_credit_grants");
  });

  it("resolves Craft as a recurring paid plan in BOTH spend overloads", () => {
    expect(count("s.price_id IN ('pro_monthly','pro_annual','craft_monthly','craft_annual')")).toBe(
      2,
    );
  });

  it("excludes pack-funded rows from every plan-scope usage SUM (no double-charge)", () => {
    // per_grow + per_month in each of the two overloads = 4 exclusions.
    expect(count("(meta ->> 'funded_by') IS DISTINCT FROM 'pack'")).toBe(4);
  });

  it("derives the pack balance from the grant ledger minus pack-funded spends", () => {
    expect(MIGRATION).toContain(
      "FROM public.ai_credit_grants\n     WHERE user_id = v_uid AND (expires_at IS NULL OR expires_at > now())",
    );
    expect(MIGRATION).toContain("WHERE user_id = v_uid AND (meta ->> 'funded_by') = 'pack'");
    // Balance is derived, never a stored counter; computed once per overload.
    expect(count("v_pack_balance := v_pack_granted - v_pack_used;")).toBe(2);
  });

  it("spends the included monthly allowance first, then packs as overflow", () => {
    expect(count("IF v_used + v_weight <= v_limit THEN")).toBe(2);
    expect(count("v_funded_by := 'allowance';")).toBe(2);
    expect(count("ELSIF v_scope = 'per_month' AND v_pack_balance >= v_weight THEN")).toBe(2);
    expect(count("v_funded_by := 'pack';")).toBe(2);
    // Only the pool actually drawn from advances.
    expect(count("v_pack_balance := v_pack_balance - v_weight;")).toBe(2);
  });

  it("tags each spend with the pool it drew from and surfaces it to the caller", () => {
    // Each overload references 'funded_by', v_funded_by twice: once in the
    // INSERT meta, once in the success RETURN (so the client can show packs).
    expect(count("'funded_by', v_funded_by")).toBe(4);
    // And the return carries the remaining pack balance in both overloads.
    expect(count("'pack_balance', GREATEST(v_pack_balance, 0)")).toBeGreaterThanOrEqual(2);
  });

  it("refund propagates funded_by so a pack refund restores pack (not allowance) balance", () => {
    // Both refund overloads read the original meta and copy funded_by onto the
    // reversal. A refund of a pack-funded spend therefore stays out of the
    // monthly bucket and nets the pack consumption back to zero.
    expect(
      count("jsonb_build_object('reason', p_reason, 'funded_by', v_orig.meta ->> 'funded_by')"),
    ).toBe(2);
    expect(count("model_tier, feature, status, meta\n    INTO v_orig")).toBe(2);
  });

  it("stays append-only on the credit ledger", () => {
    expect(MIGRATION).not.toMatch(/UPDATE\s+public\.ai_credit_spends/i);
    expect(MIGRATION).not.toMatch(/DELETE\s+FROM\s+public\.ai_credit_spends/i);
  });

  it("reasserts the service overloads as service-only WITHOUT retiring legacy grants", () => {
    expect(MIGRATION).toContain(
      "GRANT EXECUTE ON FUNCTION public.ai_credit_spend(uuid, text, text, uuid, text, text, jsonb) TO service_role",
    );
    expect(MIGRATION).toContain(
      "GRANT EXECUTE ON FUNCTION public.ai_credit_refund(uuid, uuid, text, text) TO service_role",
    );
    expect(MIGRATION).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.ai_credit_spend\(uuid, text, text, uuid, text, text, jsonb\) TO authenticated/,
    );
    // Legacy grants are retired only in the isolated contract template, never here.
    expect(MIGRATION).not.toContain(
      "REVOKE ALL ON FUNCTION public.ai_credit_spend(text, uuid, text, text, jsonb)",
    );
    expect(MIGRATION).not.toContain(
      "REVOKE ALL ON FUNCTION public.ai_credit_refund(uuid, text, text)",
    );
  });

  it("does not broaden table mutation privileges or alter billing/schema policy surfaces", () => {
    expect(MIGRATION).not.toMatch(/CREATE\s+TABLE/i);
    expect(MIGRATION).not.toMatch(/(?:CREATE|ALTER|DROP)\s+POLICY/i);
    expect(MIGRATION).not.toMatch(
      /ALTER\s+TABLE\s+public\.(?:billing_subscriptions|subscriptions)/i,
    );
    expect(MIGRATION).not.toMatch(/GRANT[^;]+ON\s+TABLE\s+public\.ai_credit_spends/i);
  });
});
