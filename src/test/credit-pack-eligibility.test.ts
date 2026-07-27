/**
 * A credit pack must only be sellable to someone who can spend it.
 *
 * `ai_credit_spend` only consults pack balance under the monthly scope.
 * Free grows are scoped per-grow, so selling a pack to Free would record
 * credits that the authoritative spend path never reads.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { KNOWN_PLAN_IDS, PLAN_CATALOG } from "@/lib/entitlements/planCatalog";
import type {
  BillingSubscriptionRow,
  LovableSubscriptionRow,
  PlanId,
  ResolvedEntitlement,
} from "@/lib/entitlements";
import { creditPackIsSpendable, resolveCreditPackPurchaseGate } from "@/lib/creditPackEligibility";
import { loadUnionEntitlementForUser } from "../../supabase/functions/_shared/unionEntitlementLookup.ts";

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
    source:
      plan === "free"
        ? "free"
        : plan === "founder_lifetime"
          ? "lovable_paddle_lifetime"
          : "lovable_paddle_subscription",
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

const VERIFIED_USER_ID = "verified-user";
const NOW = new Date("2026-07-25T12:00:00.000Z");
const FUTURE = "2026-08-25T12:00:00.000Z";

const BYO_PRO: BillingSubscriptionRow = {
  id: "billing-1",
  user_id: VERIFIED_USER_ID,
  plan_id: "pro_monthly",
  status: "active",
  provider: "paddle",
  provider_customer_id: "ctm-byo",
  provider_subscription_id: "sub-byo",
  current_period_end: FUTURE,
  cancel_at_period_end: false,
  founder_number: null,
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
};

const LOVABLE_PRO: LovableSubscriptionRow = {
  user_id: VERIFIED_USER_ID,
  paddle_subscription_id: "sub-lovable",
  paddle_customer_id: "ctm-lovable",
  product_id: "verdant_pro",
  price_id: "pro_monthly",
  status: "active",
  current_period_start: "2026-07-01T00:00:00.000Z",
  current_period_end: FUTURE,
  cancel_at_period_end: false,
  environment: "live",
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
};

interface FakeUnionState {
  billingRows?: BillingSubscriptionRow[];
  billingError?: unknown;
  liveRows?: LovableSubscriptionRow[];
}

function fakeUnionClient(state: FakeUnionState) {
  const ownerFilters: Array<{ table: string; userId: string }> = [];
  return {
    ownerFilters,
    client: {
      from(table: string) {
        let environment: "live" | "sandbox" | null = null;
        const builder = {
          select() {
            return builder;
          },
          eq(column: string, value: string) {
            if (column === "user_id") ownerFilters.push({ table, userId: value });
            if (column === "environment" && (value === "live" || value === "sandbox")) {
              environment = value;
            }
            return builder;
          },
          order() {
            return builder;
          },
          limit() {
            return builder;
          },
          then(resolveResult: (result: { data: unknown[] | null; error: unknown }) => void) {
            if (table === "billing_subscriptions") {
              resolveResult({
                data: state.billingError ? null : (state.billingRows ?? []),
                error: state.billingError ?? null,
              });
              return;
            }
            resolveResult({
              data: environment === "live" ? (state.liveRows ?? []) : [],
              error: null,
            });
          },
        };
        return builder;
      },
    },
  };
}

describe("credit pack server gate", () => {
  it("refuses a pack the caller cannot spend before returning a price", () => {
    expect(PRICE_FN).toMatch(/CREDIT_PACK_IDS[\s\S]{0,80}includes\(requested\)/);
    expect(PRICE_FN).toMatch(/creditPackIsSpendable/);
    expect(PRICE_FN).toMatch(/pack_requires_monthly_plan/);
    expect(PRICE_FN).toMatch(/json\(403, \{ error: "pack_requires_monthly_plan" \}\)/);
  });

  it("shares one predicate with the client instead of copying the rule", () => {
    expect(PRICE_FN).toMatch(/creditPackIsSpendable[\s\S]{0,140}creditPackEligibility/);
  });

  it("loads both billing authorities for the verified auth user, never a client user_id", () => {
    expect(PRICE_FN).toMatch(/loadUnionEntitlementForUser/);
    expect(PRICE_FN).toMatch(/loadUnionEntitlementForUser\([\s\S]{0,180}userData\.user\.id/);
    expect(PRICE_FN).not.toMatch(/body\s*(?:\.|\?\.)\s*user_id/);
    expect(PRICE_FN).not.toMatch(/\{\s*user_id\s*\}\s*=\s*body/);
  });

  it("fails closed if entitlement cannot be read", () => {
    const block = PRICE_FN.slice(PRICE_FN.indexOf("CREDIT_PACK_IDS as readonly string[]"));
    expect(block.slice(0, 1_000)).toMatch(/catch[\s\S]{0,240}packSpendable = false/);
  });

  it("surfaces refusal as a typed catalog reason", () => {
    const paddle = readFileSync(resolve(process.cwd(), "src", "lib", "paddle.ts"), "utf8");
    expect(paddle).toMatch(/"pack_requires_monthly_plan"/);
    const set = paddle.slice(paddle.indexOf("const CATALOG_REASONS"));
    expect(set.slice(0, 360)).toContain("pack_requires_monthly_plan");
  });
});

describe("credit pack eligibility", () => {
  it("allows a verified active BYO Paddle Pro row and owner-scopes every authority read", async () => {
    const fake = fakeUnionClient({ billingRows: [BYO_PRO] });
    const result = await loadUnionEntitlementForUser(fake.client, VERIFIED_USER_ID, "live", NOW);

    expect(result.lookupFailed).toBe(false);
    expect(result.entitlement.source).toBe("byo_paddle");
    expect(creditPackIsSpendable(result.entitlement)).toBe(true);
    expect(fake.ownerFilters).toEqual([
      { table: "billing_subscriptions", userId: VERIFIED_USER_ID },
      { table: "subscriptions", userId: VERIFIED_USER_ID },
    ]);
  });

  it("fails closed when the incumbent billing authority cannot be read", async () => {
    const fake = fakeUnionClient({
      billingError: { message: "billing unavailable" },
      liveRows: [LOVABLE_PRO],
    });
    const result = await loadUnionEntitlementForUser(fake.client, VERIFIED_USER_ID, "live", NOW);

    expect(result.lookupFailed).toBe(true);
    expect(result.entitlement.effectivePlanId).toBe("free");
    expect(creditPackIsSpendable(result.entitlement)).toBe(false);
    expect(
      resolveCreditPackPurchaseGate({
        entitlement: result.entitlement,
        entitlementVerified: !result.lookupFailed,
        loading: false,
        signedIn: true,
      }),
    ).toEqual({ kind: "blocked", reason: "unverified" });
  });

  it("agrees with ai_credit_allowance for every known plan", () => {
    for (const plan of KNOWN_PLAN_IDS) {
      const allowedInTs = gateFor(plan).kind === "allowed";
      const spendableInSql = sqlPerGrowIsNull(plan);
      expect(
        allowedInTs,
        `${plan}: UI ${allowedInTs ? "sells" : "withholds"} packs but SQL ` +
          `${spendableInSql ? "would" : "would not"} spend them`,
      ).toBe(spendableInSql);
    }
  });

  it("withholds packs from Free and offers them to paid plans", () => {
    expect(gateFor("free")).toEqual({ kind: "blocked", reason: "no_monthly_bucket" });
    expect(gateFor("pro_monthly").kind).toBe("allowed");
    expect(gateFor("pro_annual").kind).toBe("allowed");
    expect(gateFor("craft_monthly").kind).toBe("allowed");
    expect(gateFor("craft_annual").kind).toBe("allowed");
    expect(gateFor("founder_lifetime").kind).toBe("allowed");
  });

  it("does not treat a presentation-only staff lift as a paid subscription", () => {
    const staffOnFree: ResolvedEntitlement = {
      ...entitlementFor("pro_monthly"),
      isStaff: true,
      source: "free",
    };
    expect(
      resolveCreditPackPurchaseGate({
        entitlement: staffOnFree,
        entitlementVerified: true,
        loading: false,
        signedIn: true,
      }),
    ).toEqual({ kind: "blocked", reason: "no_monthly_bucket" });
  });

  it("fails closed on every uncertain edge", () => {
    const base = {
      entitlement: entitlementFor("pro_monthly"),
      entitlementVerified: true,
      loading: false,
      signedIn: true,
    };
    expect(resolveCreditPackPurchaseGate({ ...base, loading: true }).kind).toBe("pending");
    expect(resolveCreditPackPurchaseGate({ ...base, signedIn: false })).toEqual({
      kind: "blocked",
      reason: "signed_out",
    });
    expect(resolveCreditPackPurchaseGate({ ...base, entitlementVerified: false })).toEqual({
      kind: "blocked",
      reason: "unverified",
    });
  });
});
