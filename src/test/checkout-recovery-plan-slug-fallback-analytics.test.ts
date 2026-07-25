/**
 * Contract test for the aggregated analytics emission from
 * sanitizeCheckoutRecoveryPlanSlug.
 *
 * Guarantees:
 *  - Every fallback (not throttled) dispatches a `verdant:analytics`
 *    CustomEvent named `checkout_recovery_plan_slug_fallback`.
 *  - The event payload carries ONLY `reason` and `length_bucket` — no plan
 *    slug, no raw rejected value, no user identifiers.
 *  - Allowlisted plans never emit the fallback event.
 *  - The event name is registered in the shared FUNNEL_EVENTS catalog so
 *    sanitizeFunnelParams accepts the payload keys.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetCheckoutRecoveryPlanSlugTelemetryForTests,
  sanitizeCheckoutRecoveryPlanSlug,
} from "@/lib/checkoutRecoveryPlanSlug";
import { FUNNEL_EVENTS } from "@/lib/funnelAnalytics";
import { PRICING_ANALYTICS_EVENT } from "@/lib/pricingAnalytics";

type Captured = { name: string; props: Record<string, unknown> | null };

describe("checkout_recovery_plan_slug_fallback analytics event", () => {
  let captured: Captured[];
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<Captured>).detail;
    captured.push({ name: detail?.name, props: detail?.props ?? null });
  };

  beforeEach(() => {
    __resetCheckoutRecoveryPlanSlugTelemetryForTests();
    captured = [];
    window.addEventListener(PRICING_ANALYTICS_EVENT, listener);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    window.removeEventListener(PRICING_ANALYTICS_EVENT, listener);
    vi.restoreAllMocks();
  });

  it("is registered in the shared FUNNEL_EVENTS catalog", () => {
    expect(FUNNEL_EVENTS).toContain("checkout_recovery_plan_slug_fallback");
  });

  it("emits one aggregated event per fallback (not throttled)", () => {
    sanitizeCheckoutRecoveryPlanSlug(undefined);
    sanitizeCheckoutRecoveryPlanSlug(undefined);
    sanitizeCheckoutRecoveryPlanSlug(undefined);

    const fallbacks = captured.filter(
      (event) => event.name === "checkout_recovery_plan_slug_fallback",
    );
    expect(fallbacks).toHaveLength(3);
  });

  it("payload carries only reason + length_bucket, no plan / raw value / identifiers", () => {
    sanitizeCheckoutRecoveryPlanSlug("Pro Monthly");

    const [event] = captured.filter(
      (entry) => entry.name === "checkout_recovery_plan_slug_fallback",
    );
    expect(event).toBeDefined();
    const props = event!.props ?? {};

    expect(Object.keys(props).sort()).toEqual(["length_bucket", "reason"]);
    expect(props.reason).toBe("not_in_allowlist");
    expect(props.length_bucket).toBe("9-32");

    const serialized = JSON.stringify(props).toLowerCase();
    // Raw rejected value must never appear.
    expect(serialized).not.toContain("pro monthly");
    expect(serialized).not.toContain("pro_monthly");
    // No identifier-shaped fields.
    for (const forbidden of [
      "plan",
      "user",
      "email",
      "token",
      "session",
      "http",
      "pri_",
      "customer",
      "transaction",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("does not emit for allowlisted plan slugs", () => {
    sanitizeCheckoutRecoveryPlanSlug("pro_monthly");
    sanitizeCheckoutRecoveryPlanSlug("craft_annual");
    sanitizeCheckoutRecoveryPlanSlug("founder_lifetime");

    const fallbacks = captured.filter(
      (event) => event.name === "checkout_recovery_plan_slug_fallback",
    );
    expect(fallbacks).toHaveLength(0);
  });

  it("classifies each fallback branch with the correct reason token", () => {
    sanitizeCheckoutRecoveryPlanSlug(undefined);
    sanitizeCheckoutRecoveryPlanSlug({} as unknown);
    sanitizeCheckoutRecoveryPlanSlug("");
    sanitizeCheckoutRecoveryPlanSlug("nope");

    const reasons = captured
      .filter((event) => event.name === "checkout_recovery_plan_slug_fallback")
      .map((event) => (event.props ?? {}).reason);

    expect(reasons).toEqual(["missing", "wrong_type", "empty_string", "not_in_allowlist"]);
  });
});
