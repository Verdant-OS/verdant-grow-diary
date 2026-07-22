/**
 * Craft tier staging — client catalog + server SQL guardrails.
 *
 * Craft (craft_monthly / craft_annual) is the craft-grower / rosin tier:
 * everything Pro has plus the Blueprint overlay capability and a 300/month
 * AI-credit bucket. Its definition mirrors the deploy branch so the lineages
 * stay converged. These tests pin that the tier is fully resolvable everywhere
 * the app reasons about entitlements (activation is only the Paddle products)
 * while asserting existing plans are unchanged.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  PLAN_CATALOG,
  KNOWN_PLAN_IDS,
  isKnownPlanId,
} from "@/lib/entitlements/planCatalog";
import { resolveEntitlements } from "@/lib/entitlements/resolveEntitlements";
import type { BillingSubscriptionRow } from "@/lib/entitlements/types";

const ROOT = resolve(__dirname, "../..");

describe("Craft — client catalog", () => {
  it("both cadences are known plans", () => {
    expect(isKnownPlanId("craft_monthly")).toBe(true);
    expect(isKnownPlanId("craft_annual")).toBe(true);
    expect(KNOWN_PLAN_IDS).toContain("craft_monthly");
    expect(KNOWN_PLAN_IDS).toContain("craft_annual");
  });

  it("Craft = Pro plus Blueprint and a 300/month bucket (matches deploy)", () => {
    expect(PLAN_CATALOG.craft_monthly).toEqual(PLAN_CATALOG.craft_annual);
    expect(PLAN_CATALOG.craft_monthly.phenoComparison).toBe(true);
    expect(PLAN_CATALOG.craft_monthly.blueprint).toBe(true);
    expect(PLAN_CATALOG.craft_monthly.aiMonthlyCredits).toBe(300);
    // Everything else tracks Pro.
    const { aiMonthlyCredits: _c, blueprint: _b, ...craftRest } = PLAN_CATALOG.craft_monthly;
    const { aiMonthlyCredits: _pc, blueprint: _pb, ...proRest } = PLAN_CATALOG.pro_monthly;
    expect(craftRest).toEqual(proRest);
  });

  it("Blueprint is Craft-exclusive plus Founder — not Free or Pro", () => {
    expect(PLAN_CATALOG.free.blueprint).toBe(false);
    expect(PLAN_CATALOG.pro_monthly.blueprint).toBe(false);
    expect(PLAN_CATALOG.founder_lifetime.blueprint).toBe(true);
  });

  it("existing plans are unchanged (no regression from adding Craft)", () => {
    expect(PLAN_CATALOG.free.phenoComparison).toBe(false);
    expect(PLAN_CATALOG.pro_monthly.aiMonthlyCredits).toBe(100);
    expect(PLAN_CATALOG.founder_lifetime.aiMonthlyCredits).toBe(100);
  });
});

describe("Craft — resolver", () => {
  const now = Date.parse("2026-07-22T00:00:00Z");
  function row(over: Partial<BillingSubscriptionRow>): BillingSubscriptionRow {
    return {
      id: "s1",
      user_id: "u1",
      plan_id: "craft_monthly",
      status: "active",
      provider: "paddle",
      provider_customer_id: null,
      provider_subscription_id: null,
      current_period_end: new Date(now + 30 * 86_400_000).toISOString(),
      cancel_at_period_end: false,
      founder_number: null,
      created_at: new Date(now).toISOString(),
      updated_at: new Date(now).toISOString(),
      ...over,
    };
  }

  it("an active craft row resolves to Craft capabilities (300/mo + blueprint)", () => {
    const r = resolveEntitlements(row({}), new Date(now));
    expect(r.effectivePlanId).toBe("craft_monthly");
    expect(r.isActive).toBe(true);
    expect(r.capabilities).toEqual(PLAN_CATALOG.craft_monthly);
    expect(r.capabilities.aiMonthlyCredits).toBe(300);
    expect(r.capabilities.blueprint).toBe(true);
  });

  it("a canceled craft row degrades to free (same as any paid plan)", () => {
    const r = resolveEntitlements(row({ status: "canceled" }), new Date(now));
    expect(r.capabilities).toEqual(PLAN_CATALOG.free);
    expect(r.displayPlanId).toBe("craft_monthly");
  });
});

describe("Craft — server SQL staging migration", () => {
  const MIG = (() => {
    const dir = resolve(ROOT, "supabase/migrations");
    const f = readdirSync(dir).find((n) => /craft_tier_staging\.sql$/.test(n));
    return f ? readFileSync(join(dir, f), "utf8") : "";
  })();

  it("widens the billing_subscriptions.plan_id CHECK to include both craft SKUs", () => {
    expect(MIG).toMatch(
      /CHECK\s*\(\s*plan_id\s+IN\s*\([^)]*'craft_monthly'[^)]*'craft_annual'[^)]*\)/i,
    );
  });

  it("teaches ai_credit_allowance craft = 300/month (parity with the TS catalog)", () => {
    expect(MIG).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.ai_credit_allowance/i);
    expect(MIG).toMatch(/WHEN\s+'craft_monthly'\s+THEN\s+300/i);
    expect(MIG).toMatch(/WHEN\s+'craft_annual'\s+THEN\s+300/i);
  });

  it("recognises craft as a known plan in effective-credit resolution", () => {
    expect(MIG).toMatch(
      /NOT\s+IN\s*\([^)]*'craft_monthly'[^)]*'craft_annual'[^)]*\)\s*THEN\s*'free'/i,
    );
  });

  it("re-grants EXECUTE to authenticated + service_role only (no PUBLIC/anon)", () => {
    expect(MIG).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.ai_credit_allowance[\s\S]*TO\s+authenticated,\s*service_role/i);
    expect(MIG).not.toMatch(/GRANT\s+EXECUTE[\s\S]*TO\s+anon\b/i);
  });
});
