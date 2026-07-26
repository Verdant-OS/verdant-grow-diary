/**
 * A credit pack must only be sellable to someone who can spend it.
 *
 * Found live on production: /pricing rendered enabled "Buy 50 credits — $9"
 * buttons to signed-out and free visitors. But `ai_credit_spend` only consults
 * pack balance under `IF v_scope = 'per_month'`, and free grows are
 * `per_grow = 3` — so a free grower's pack lands in `ai_credit_grants` and no
 * spend path ever reads it. Money taken, nothing delivered.
 *
 * The eligibility rule is derived from `Capabilities.aiCreditsPerGrow`, the TS
 * mirror of the same `ai_credit_allowance` column the SQL branches on. The
 * parity test below is the one that matters: it checks the TS rule against the
 * actual migration SQL for every known plan, so the two cannot drift.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { KNOWN_PLAN_IDS, PLAN_CATALOG } from "@/lib/entitlements/planCatalog";
import type { PlanId, ResolvedEntitlement } from "@/lib/entitlements/types";
import { resolveCreditPackPurchaseGate } from "@/lib/creditPackEligibility";

const SPEND_SQL = readFileSync(
  resolve(
    process.cwd(),
    "supabase",
    "migrations",
    "20260721104000_ai_credit_spend_pack_overflow.sql",
  ),
  "utf8",
);

function entitlementFor(plan: PlanId): ResolvedEntitlement {
  return {
    effectivePlanId: plan,
    displayPlanId: plan,
    status: "active",
    isActive: true,
    capabilities: PLAN_CATALOG[plan],
    degraded: false,
    degradedReason: null,
    isStaff: false,
  };
}

function gateFor(plan: PlanId) {
  return resolveCreditPackPurchaseGate({
    entitlement: entitlementFor(plan),
    entitlementVerified: true,
    loading: false,
    signedIn: true,
  });
}

/**
 * What `ai_credit_allowance` returns for `per_grow`, read from the migration.
 * `NULL` there means the plan uses the monthly bucket, which is the only scope
 * under which pack balance is consulted.
 */
function sqlPerGrowIsNull(plan: PlanId): boolean {
  const fn = SPEND_SQL.slice(SPEND_SQL.indexOf("FUNCTION public.ai_credit_allowance"));
  const perGrowBlock = fn.slice(0, fn.indexOf("AS per_grow"));
  const row = perGrowBlock.match(new RegExp(`WHEN '${plan}' THEN (\\S+)`));
  if (!row) throw new Error(`ai_credit_allowance has no per_grow case for ${plan}`);
  return row[1].toUpperCase() === "NULL";
}

const PRICE_FN = readFileSync(
  resolve(process.cwd(), "supabase", "functions", "get-paddle-price", "index.ts"),
  "utf8",
);

describe("credit pack server gate", () => {
  // The SERVER is the authority. A client-only gate is bypassable by calling
  // the function directly, and this is the last point where refusing costs the
  // buyer nothing.
  it("refuses a pack the caller cannot spend, before returning a price", () => {
    expect(PRICE_FN).toMatch(/CREDIT_PACK_IDS[\s\S]{0,80}includes\(requested\)/);
    expect(PRICE_FN).toMatch(/creditPackIsSpendable/);
    expect(PRICE_FN).toMatch(/pack_requires_monthly_plan/);
    expect(PRICE_FN).toMatch(/json\(403, \{ error: "pack_requires_monthly_plan" \}\)/);
  });

  it("shares one predicate with the client instead of copying the rule", () => {
    // A second hand-maintained copy is how Craft went missing from the webhook
    // allowlist; the edge module imports the mirrored shared rule.
    expect(PRICE_FN).toMatch(/creditPackIsSpendable[\s\S]{0,120}creditPackEligibility/);
  });

  it("fails closed if the entitlement cannot be read", () => {
    // "We couldn't check" must never resolve to "sell".
    const block = PRICE_FN.slice(PRICE_FN.indexOf("CREDIT_PACK_IDS as readonly string[]"));
    expect(block.slice(0, 900)).toMatch(/catch[\s\S]{0,200}packSpendable = false/);
  });

  it("surfaces the refusal as a typed catalog reason, not a raw error", () => {
    const paddle = readFileSync(resolve(process.cwd(), "src", "lib", "paddle.ts"), "utf8");
    expect(paddle).toMatch(/"pack_requires_monthly_plan"/);
    // Must be in CATALOG_REASONS, or it falls through to the raw-message toast.
    const set = paddle.slice(paddle.indexOf("const CATALOG_REASONS"));
    expect(set.slice(0, 300)).toContain("pack_requires_monthly_plan");
  });
});

describe("credit pack eligibility", () => {
  it("agrees with ai_credit_allowance for every known plan", () => {
    // The assertion that keeps the TS rule honest against the database.
    for (const plan of KNOWN_PLAN_IDS) {
      const allowedInTs = gateFor(plan).kind === "allowed";
      const spendableInSql = sqlPerGrowIsNull(plan);
      expect(
        allowedInTs,
        `${plan}: TS ${allowedInTs ? "sells" : "withholds"} credit packs but SQL ` +
          `${spendableInSql ? "would" : "would NOT"} ever spend them — selling a pack ` +
          `the spend path cannot read is money taken for nothing`,
      ).toBe(spendableInSql);
    }
  });

  it("withholds packs from free and offers them to paid plans", () => {
    // Non-triviality: proves the parity assertion above is not vacuous by
    // pinning both sides of the split explicitly.
    expect(gateFor("free")).toEqual({ kind: "blocked", reason: "no_monthly_bucket" });
    expect(gateFor("pro_monthly").kind).toBe("allowed");
    expect(gateFor("craft_annual").kind).toBe("allowed");
    expect(gateFor("founder_lifetime").kind).toBe("allowed");
  });

  it("fails closed on every uncertain edge", () => {
    const base = {
      entitlement: entitlementFor("pro_monthly"),
      entitlementVerified: true,
      loading: false,
      signedIn: true,
    };
    // Loading must not flash a buyable state that later retracts.
    expect(resolveCreditPackPurchaseGate({ ...base, loading: true }).kind).toBe("pending");
    // Signed out — checkout would 401 anyway, and we cannot know their plan.
    expect(resolveCreditPackPurchaseGate({ ...base, signedIn: false })).toEqual({
      kind: "blocked",
      reason: "signed_out",
    });
    // "We couldn't check" must never resolve to "sell". A paid viewer whose
    // lookup failed sees a retry message, not a purchase they may not be able
    // to use.
    expect(resolveCreditPackPurchaseGate({ ...base, entitlementVerified: false })).toEqual({
      kind: "blocked",
      reason: "unverified",
    });
  });

  it("derives from the catalog rather than a plan-id list", () => {
    // A hand-maintained paid-plan list is how Craft went missing from the
    // webhook allowlist. A hypothetical new tier with a monthly bucket must be
    // eligible without editing creditPackEligibility.ts.
    const futureTier: ResolvedEntitlement = {
      ...entitlementFor("pro_monthly"),
      effectivePlanId: "pro_monthly",
      capabilities: { ...PLAN_CATALOG.pro_monthly, aiMonthlyCredits: 500 },
    };
    expect(
      resolveCreditPackPurchaseGate({
        entitlement: futureTier,
        entitlementVerified: true,
        loading: false,
        signedIn: true,
      }).kind,
    ).toBe("allowed");
  });
});
