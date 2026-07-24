import { describe, expect, it } from "vitest";

import {
  canUseCapability,
  resolveUnionEntitlements,
  type LovableSubscriptionRow,
  type PlanId,
  type ResolvedEntitlement,
} from "@/lib/entitlements";
import { loadUnionEntitlement } from "../../supabase/functions/_shared/unionEntitlementLookup.ts";

const NOW = new Date("2026-07-18T12:00:00.000Z");
const FUTURE = "2099-01-01T00:00:00.000Z";

function canonicalRow(planId: Exclude<PlanId, "free">): LovableSubscriptionRow {
  const lifetime = planId === "founder_lifetime";
  return {
    user_id: "user-1",
    paddle_subscription_id: lifetime ? "lifetime_txn_founder" : `sub_${planId}`,
    paddle_customer_id: "ctm_user_1",
    product_id: lifetime ? "founder_lifetime" : "verdant_pro",
    price_id: planId,
    status: "active",
    current_period_start: "2026-07-18T00:00:00.000Z",
    current_period_end: lifetime ? null : FUTURE,
    cancel_at_period_end: false,
    environment: "live",
    created_at: "2026-07-18T00:00:00.000Z",
    updated_at: "2026-07-18T00:00:00.000Z",
  };
}

function serverClient(rows: readonly LovableSubscriptionRow[]) {
  return {
    from(table: string) {
      let environment = "";
      const builder = {
        select() {
          return builder;
        },
        eq(column: string, value: string) {
          if (column === "environment") environment = value;
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return builder;
        },
        then(resolve: (result: { data: LovableSubscriptionRow[]; error: null }) => void) {
          expect(table).toBe("subscriptions");
          resolve({
            data: rows.filter((row) => row.environment === environment),
            error: null,
          });
        },
      };
      return builder;
    },
  };
}

type BooleanCapability = "advancedExports" | "liveSensors" | "multiTent";
type CapabilityFn = (
  entitlement: ResolvedEntitlement | null | undefined,
  capability: BooleanCapability,
) => boolean;

const CAPABILITIES = ["advancedExports", "liveSensors", "multiTent"] as const;
const MATRIX: ReadonlyArray<{ planId: PlanId; expected: boolean }> = [
  { planId: "free", expected: false },
  { planId: "pro_monthly", expected: true },
  { planId: "pro_annual", expected: true },
  { planId: "founder_lifetime", expected: true },
];

describe("entitlement plan x capability parity", () => {
  it("runs the same plan matrix through client and server canonical resolvers", async () => {
    const entitlements = await import("@/lib/entitlements");
    const capabilityHelper = (entitlements as { canUseCapability?: CapabilityFn }).canUseCapability;

    expect(capabilityHelper).toBeTypeOf("function");
    if (!capabilityHelper) return;

    for (const { planId, expected } of MATRIX) {
      const lovableRow = planId === "free" ? null : canonicalRow(planId);
      const clientEntitlement = resolveUnionEntitlements({
        byoRow: null,
        lovableRow,
        expectedBillingEnvironment: "live",
        now: NOW,
      });
      const serverResult = await loadUnionEntitlement(
        serverClient(lovableRow ? [lovableRow] : []),
        "live",
        NOW,
      );

      expect(serverResult.lookupFailed, `${planId} server verification`).toBe(false);
      expect(serverResult.entitlement.effectivePlanId).toBe(clientEntitlement.effectivePlanId);
      expect(serverResult.entitlement.displayPlanId).toBe(clientEntitlement.displayPlanId);
      expect(serverResult.entitlement.capabilities).toEqual(clientEntitlement.capabilities);

      for (const capability of CAPABILITIES) {
        expect(
          capabilityHelper(clientEntitlement, capability),
          `${planId} client ${capability}`,
        ).toBe(expected);
        expect(
          capabilityHelper(serverResult.entitlement, capability),
          `${planId} server ${capability}`,
        ).toBe(expected);
      }
    }

    expect(canUseCapability(null, "advancedExports")).toBe(false);
    expect(canUseCapability(undefined, "advancedExports")).toBe(false);
  });

  it("keeps Founder AI credits capped while matching Pro boolean capabilities", () => {
    const founder = resolveUnionEntitlements({
      byoRow: null,
      lovableRow: canonicalRow("founder_lifetime"),
      expectedBillingEnvironment: "live",
      now: NOW,
    });
    const pro = resolveUnionEntitlements({
      byoRow: null,
      lovableRow: canonicalRow("pro_monthly"),
      expectedBillingEnvironment: "live",
      now: NOW,
    });

    for (const capability of CAPABILITIES) {
      expect(founder.capabilities[capability]).toBe(pro.capabilities[capability]);
    }
    expect(founder.capabilities.aiMonthlyCredits).toBe(100);
    expect(Number.isFinite(founder.capabilities.aiMonthlyCredits)).toBe(true);
  });
});
