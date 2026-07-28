/**
 * New credit-pack purchases remain paid-plan top-ups. That is a merchandising
 * rule, not a technical spendability rule: once settled, an owned grant stays
 * portable if the buyer later returns to Free.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { KNOWN_PLAN_IDS, PLAN_CATALOG } from "@/lib/entitlements/planCatalog";
import type { LovableSubscriptionRow, PlanId, ResolvedEntitlement } from "@/lib/entitlements";
import {
  creditPackPurchaseEligible,
  resolveCreditPackPurchaseGate,
} from "@/lib/creditPackEligibility";
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
  liveRows?: LovableSubscriptionRow[];
  liveError?: unknown;
  sandboxRows?: LovableSubscriptionRow[];
  sandboxError?: unknown;
}

function fakeUnionClient(state: FakeUnionState) {
  const ownerFilters: Array<{ table: string; userId: string }> = [];
  const tableReads: string[] = [];
  return {
    ownerFilters,
    tableReads,
    client: {
      from(table: string) {
        tableReads.push(table);
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
            if (table !== "subscriptions") throw new Error(`unexpected authority read: ${table}`);
            const error = environment === "sandbox" ? state.sandboxError : state.liveError;
            resolveResult({
              data:
                error != null
                  ? null
                  : environment === "sandbox"
                    ? (state.sandboxRows ?? [])
                    : (state.liveRows ?? []),
              error: error ?? null,
            });
          },
        };
        return builder;
      },
    },
  };
}

describe("credit pack server gate", () => {
  it("refuses a new pack purchase for a verified ineligible plan before returning a price", () => {
    expect(PRICE_FN).toMatch(/CREDIT_PACK_IDS[\s\S]{0,80}includes\(requested\)/);
    expect(PRICE_FN).toMatch(/creditPackPurchaseEligible/);
    expect(PRICE_FN).toMatch(/pack_requires_monthly_plan/);
    expect(PRICE_FN).toMatch(/json\(403, \{ error: "pack_requires_monthly_plan" \}\)/);
  });

  it("shares one predicate with the client instead of copying the rule", () => {
    expect(PRICE_FN).toMatch(/creditPackPurchaseEligible[\s\S]{0,140}creditPackEligibility/);
  });

  it("loads the canonical billing authority for the verified auth user, never a client user_id", () => {
    expect(PRICE_FN).toMatch(/loadUnionEntitlementForUser/);
    expect(PRICE_FN).toMatch(/loadUnionEntitlementForUser\([\s\S]{0,180}userData\.user\.id/);
    expect(PRICE_FN).not.toMatch(/body\s*(?:\.|\?\.)\s*user_id/);
    expect(PRICE_FN).not.toMatch(/\{\s*user_id\s*\}\s*=\s*body/);
  });

  it("distinguishes a transient entitlement lookup failure from genuine ineligibility", () => {
    const start = PRICE_FN.indexOf(
      "if ((CREDIT_PACK_IDS as readonly string[]).includes(requested))",
    );
    const end = PRICE_FN.indexOf("// 2b. Founder Lifetime", start);
    const block = PRICE_FN.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(block).toMatch(
      /if \(resolved\.lookupFailed\)[\s\S]{0,420}json\(503, \{ error: "price_resolution_unavailable" \}\)/,
    );
    expect(block).toMatch(
      /catch \{[\s\S]{0,420}json\(503, \{ error: "price_resolution_unavailable" \}\)/,
    );
    expect(block).toMatch(
      /if \(!packPurchaseEligible\)[\s\S]{0,420}json\(403, \{ error: "pack_requires_monthly_plan" \}\)/,
    );
    expect(block.indexOf("if (resolved.lookupFailed)")).toBeLessThan(
      block.indexOf("creditPackPurchaseEligible(resolved.entitlement)"),
    );
    expect(block.indexOf("creditPackPurchaseEligible(resolved.entitlement)")).toBeLessThan(
      block.indexOf("if (!packPurchaseEligible)"),
    );
  });

  it("surfaces refusal as a typed catalog reason", () => {
    const paddle = readFileSync(resolve(process.cwd(), "src", "lib", "paddle.ts"), "utf8");
    expect(paddle).toMatch(/"pack_requires_monthly_plan"/);
    const set = paddle.slice(paddle.indexOf("const CATALOG_REASONS"));
    expect(set.slice(0, 360)).toContain("pack_requires_monthly_plan");
  });
});

describe("credit pack eligibility", () => {
  it("allows a verified active canonical Paddle Pro row and owner-scopes every read", async () => {
    const fake = fakeUnionClient({ liveRows: [LOVABLE_PRO] });
    const result = await loadUnionEntitlementForUser(fake.client, VERIFIED_USER_ID, "live", NOW);

    expect(result.lookupFailed).toBe(false);
    expect(result.entitlement.source).toBe("lovable_paddle_subscription");
    expect(creditPackPurchaseEligible(result.entitlement)).toBe(true);
    expect(fake.tableReads).toEqual(["subscriptions"]);
    expect(fake.ownerFilters).toEqual([{ table: "subscriptions", userId: VERIFIED_USER_ID }]);
  });

  it("does not query the legacy billing_subscriptions audit table", () => {
    const lookup = readFileSync(
      resolve(process.cwd(), "supabase", "functions", "_shared", "unionEntitlementLookup.ts"),
      "utf8",
    );
    const scoped = lookup.slice(
      lookup.indexOf("export async function loadUnionEntitlementForUser"),
    );
    expect(scoped).toContain("loadUnionEntitlementScoped");
    expect(scoped).not.toContain('.from("billing_subscriptions")');
  });

  it("fails closed when the canonical authority cannot be read", async () => {
    const fake = fakeUnionClient({
      liveError: { message: "subscriptions unavailable" },
    });
    const result = await loadUnionEntitlementForUser(fake.client, VERIFIED_USER_ID, "live", NOW);

    expect(result.lookupFailed).toBe(true);
    expect(result.entitlement.effectivePlanId).toBe("free");
    expect(creditPackPurchaseEligible(result.entitlement)).toBe(false);
    expect(
      resolveCreditPackPurchaseGate({
        entitlement: result.entitlement,
        entitlementVerified: !result.lookupFailed,
        loading: false,
        signedIn: true,
      }),
    ).toEqual({ kind: "blocked", reason: "unverified" });
  });

  it("keeps a proven live paid row verified when the lower-precedence sandbox read fails", async () => {
    const fake = fakeUnionClient({
      liveRows: [LOVABLE_PRO],
      sandboxError: { message: "sandbox unavailable" },
    });
    const result = await loadUnionEntitlementForUser(fake.client, VERIFIED_USER_ID, "sandbox", NOW);

    expect(result.lookupFailed).toBe(false);
    expect(result.entitlement.effectivePlanId).toBe("pro_monthly");
    expect(creditPackPurchaseEligible(result.entitlement)).toBe(true);
    expect(fake.tableReads).toEqual(["subscriptions", "subscriptions"]);
  });

  it("agrees with ai_credit_allowance for every known plan", () => {
    for (const plan of KNOWN_PLAN_IDS) {
      const allowedInTs = gateFor(plan).kind === "allowed";
      const hasMonthlyBucketInSql = sqlPerGrowIsNull(plan);
      expect(
        allowedInTs,
        `${plan}: UI ${allowedInTs ? "sells" : "withholds"} new packs but SQL ` +
          `${hasMonthlyBucketInSql ? "does" : "does not"} define a paid monthly bucket`,
      ).toBe(hasMonthlyBucketInSql);
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
