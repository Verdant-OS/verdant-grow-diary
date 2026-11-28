/**
 * decideBlueprintAccess edge cases that blueprint-access-rules.test.ts (a
 * locked scorer) does not cover: unknown prices, and a non-entitling live row
 * that must not hide an entitling sandbox row.
 */
import { describe, expect, it } from "vitest";
import { decideBlueprintAccess } from "@/lib/blueprintAccessRules";
import type { LovableSubscriptionRow } from "@/lib/entitlements/lovablePaddleAdapter";

const NOW = new Date("2026-11-24T08:00:00.000Z");

function row(
  price_id: string,
  extra: Partial<LovableSubscriptionRow> = {},
): LovableSubscriptionRow {
  return {
    id: `row-${price_id}`,
    user_id: "user-1",
    paddle_subscription_id: `sub_${price_id}`,
    paddle_customer_id: "ctm_1",
    product_id: "prod",
    price_id,
    status: "active",
    current_period_end: "2026-12-24T00:00:00.000Z",
    environment: "live",
    created_at: "2026-11-01T00:00:00.000Z",
    ...extra,
  };
}

const base = { sandboxRows: [], serverAllowsSandbox: false, lookupFailed: false, now: NOW };

describe("decideBlueprintAccess — edge cases", () => {
  it.each(["pri_01unknown", "craft_quarterly", "CRAFT_MONTHLY", ""])(
    "denies an active row with unknown price_id %j",
    (price_id) => {
      expect(decideBlueprintAccess({ ...base, liveRows: [row(price_id)] })).toEqual({
        allowed: false,
        reason: "no_blueprint_plan",
      });
    },
  );

  it("still allows a Craft row listed after an unknown-price row", () => {
    const rows = [
      row("pri_01unknown"),
      row("craft_monthly", { created_at: "2026-10-01T00:00:00.000Z" }),
    ];
    expect(decideBlueprintAccess({ ...base, liveRows: rows }).allowed).toBe(true);
  });

  it("checks sandbox when the only live row no longer entitles", () => {
    const expiredLive = row("craft_monthly", {
      status: "canceled",
      current_period_end: "2026-11-01T00:00:00.000Z",
    });
    const sandbox = row("craft_annual", { environment: "sandbox" });
    expect(
      decideBlueprintAccess({
        ...base,
        liveRows: [expiredLive],
        sandboxRows: [sandbox],
        serverAllowsSandbox: true,
      }),
    ).toEqual({ allowed: true, reason: "allowed" });
  });

  it("reports lookup_failed when a read failed and the only row no longer entitles", () => {
    const expired = row("craft_monthly", {
      status: "canceled",
      current_period_end: "2026-11-01T00:00:00.000Z",
    });
    expect(decideBlueprintAccess({ ...base, liveRows: [expired], lookupFailed: true })).toEqual({
      allowed: false,
      reason: "lookup_failed",
    });
  });
});
