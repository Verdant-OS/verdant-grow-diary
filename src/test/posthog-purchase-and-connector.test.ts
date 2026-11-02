import { describe, expect, it } from "vitest";
import { mapFunnelEventToPostHog, posthogIngestHostForRegion } from "@/lib/posthogAnalyticsRules";

describe("PostHog purchase and connector wiring", () => {
  it("maps a confirmed subscription_activated to purchase_completed with the plan", () => {
    expect(mapFunnelEventToPostHog("subscription_activated", { plan: "pro_monthly" })).toEqual([
      { name: "purchase_completed", properties: { plan: "pro_monthly" } },
    ]);
  });
  it("drops a purchase event whose plan is missing or not a slug", () => {
    expect(mapFunnelEventToPostHog("subscription_activated", {})).toEqual([]);
    expect(mapFunnelEventToPostHog("subscription_activated", { plan: "a@b.com" })).toEqual([]);
  });
  it("still maps signup to user_signed_up", () => {
    expect(mapFunnelEventToPostHog("signup", { method: "email" })).toEqual([
      { name: "user_signed_up", properties: {} },
    ]);
  });
  it("still drops checkout intent events", () => {
    expect(mapFunnelEventToPostHog("checkout_started", { plan: "pro_monthly" })).toEqual([]);
  });
  it("resolves connector regions to ingest hosts", () => {
    expect(posthogIngestHostForRegion("us")).toBe("https://us.i.posthog.com");
    expect(posthogIngestHostForRegion("eu")).toBe("https://eu.i.posthog.com");
    expect(posthogIngestHostForRegion("mars")).toBeNull();
  });
});
