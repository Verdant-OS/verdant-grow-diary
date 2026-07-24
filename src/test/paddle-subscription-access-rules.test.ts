import { describe, expect, it } from "vitest";
import {
  subscriptionGrantsAccess,
  type SubscriptionAccessInput,
} from "@/lib/paddleSubscriptionAccessRules";

const NOW = new Date("2026-07-17T12:00:00.000Z");
const FUTURE = new Date(NOW.getTime() + 60_000).toISOString();
const PAST = new Date(NOW.getTime() - 60_000).toISOString();

function recurring(overrides: Partial<SubscriptionAccessInput> = {}): SubscriptionAccessInput {
  return {
    plan_id: "pro_monthly",
    status: "active",
    current_period_end: FUTURE,
    ...overrides,
  };
}

describe("subscriptionGrantsAccess", () => {
  it.each(["active", "trialing"])("grants an in-period recurring %s row", (status) => {
    expect(subscriptionGrantsAccess(recurring({ status }), NOW)).toBe(true);
  });

  it("keeps a past-due recurring customer entitled during dunning after period end", () => {
    expect(
      subscriptionGrantsAccess(recurring({ status: "past_due", current_period_end: PAST }), NOW),
    ).toBe(true);
  });

  it("keeps a canceled recurring customer entitled only before their paid-through end", () => {
    expect(
      subscriptionGrantsAccess(recurring({ status: "canceled", current_period_end: FUTURE }), NOW),
    ).toBe(true);
    expect(
      subscriptionGrantsAccess(
        recurring({ status: "canceled", current_period_end: NOW.toISOString() }),
        NOW,
      ),
    ).toBe(false);
    expect(
      subscriptionGrantsAccess(recurring({ status: "canceled", current_period_end: PAST }), NOW),
    ).toBe(false);
  });

  it.each(["paused", "expired", "unknown"])("denies %s recurring rows", (status) => {
    expect(subscriptionGrantsAccess(recurring({ status }), NOW)).toBe(false);
  });

  it("fails closed for malformed or missing recurring period ends", () => {
    expect(subscriptionGrantsAccess(recurring({ current_period_end: "not-a-date" }), NOW)).toBe(
      false,
    );
    expect(subscriptionGrantsAccess(recurring({ current_period_end: null }), NOW)).toBe(false);
  });

  it("accepts only the exact active/no-end Founder Lifetime shape", () => {
    expect(
      subscriptionGrantsAccess(
        {
          plan_id: "founder_lifetime",
          status: "active",
          current_period_end: null,
        },
        NOW,
      ),
    ).toBe(true);
    expect(
      subscriptionGrantsAccess(
        {
          plan_id: "founder_lifetime",
          status: "past_due",
          current_period_end: null,
        },
        NOW,
      ),
    ).toBe(false);
    expect(
      subscriptionGrantsAccess(
        {
          plan_id: "founder_lifetime",
          status: "active",
          current_period_end: FUTURE,
        },
        NOW,
      ),
    ).toBe(false);
    expect(
      subscriptionGrantsAccess(
        {
          plan_id: "founder_lifetime",
          status: "active",
          current_period_end: undefined,
        },
        NOW,
      ),
    ).toBe(false);
  });
});
