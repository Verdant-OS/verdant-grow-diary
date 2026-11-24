import { describe, expect, it } from "vitest";
import { decideBlueprintAccess, serverAllowsSandboxFromEnv } from "@/lib/blueprintAccessRules";
import type { LovableSubscriptionRow } from "@/lib/entitlements/lovablePaddleAdapter";

const NOW = new Date("2026-11-24T08:00:00.000Z");

function row(price_id: string, environment = "live"): LovableSubscriptionRow {
  return {
    id: `row-${price_id}`,
    user_id: "user-1",
    paddle_subscription_id: `sub_${price_id}`,
    paddle_customer_id: "ctm_1",
    product_id: "prod",
    price_id,
    status: "active",
    current_period_end: "2026-12-24T00:00:00.000Z",
    environment,
    created_at: "2026-11-01T00:00:00.000Z",
  };
}

const base = { sandboxRows: [], serverAllowsSandbox: false, lookupFailed: false, now: NOW };

describe("decideBlueprintAccess", () => {
  it("denies a Free user (no rows)", () => {
    expect(decideBlueprintAccess({ ...base, liveRows: [] })).toEqual({
      allowed: false,
      reason: "no_blueprint_plan",
    });
  });
  it.each(["pro_monthly", "pro_annual"])("denies Pro (%s)", (plan) => {
    expect(decideBlueprintAccess({ ...base, liveRows: [row(plan)] }).allowed).toBe(false);
  });
  it("allows an existing Founder Lifetime row", () => {
    const founder = {
      ...row("founder_lifetime"),
      paddle_subscription_id: "lifetime_txn_1",
      current_period_end: null,
    };
    expect(decideBlueprintAccess({ ...base, liveRows: [founder] }).allowed).toBe(true);
  });
  it.each(["craft_monthly", "craft_annual"])("allows %s", (plan) => {
    expect(decideBlueprintAccess({ ...base, liveRows: [row(plan)] })).toEqual({
      allowed: true,
      reason: "allowed",
    });
  });
  it("denies when the lookup failed and no paid row is proven", () => {
    expect(decideBlueprintAccess({ ...base, liveRows: null, lookupFailed: true }).reason).toBe(
      "lookup_failed",
    );
  });
  it("ignores a sandbox Craft row unless the server resolved sandbox", () => {
    const input = { ...base, liveRows: [], sandboxRows: [row("craft_monthly", "sandbox")] };
    expect(decideBlueprintAccess(input).allowed).toBe(false);
    expect(decideBlueprintAccess({ ...input, serverAllowsSandbox: true }).allowed).toBe(true);
  });
  it("denies an expired canceled Craft row", () => {
    const expired = {
      ...row("craft_monthly"),
      status: "canceled",
      current_period_end: "2026-11-01T00:00:00.000Z",
    };
    expect(decideBlueprintAccess({ ...base, liveRows: [expired] }).allowed).toBe(false);
  });
  it("sandbox env flag is exact 'sandbox' only", () => {
    expect(serverAllowsSandboxFromEnv("sandbox")).toBe(true);
    expect(serverAllowsSandboxFromEnv("live")).toBe(false);
    expect(serverAllowsSandboxFromEnv(undefined)).toBe(false);
    expect(serverAllowsSandboxFromEnv("Sandbox")).toBe(false);
  });
});
