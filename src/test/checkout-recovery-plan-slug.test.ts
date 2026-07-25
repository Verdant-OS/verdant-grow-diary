/**
 * Unit tests for sanitizeCheckoutRecoveryPlanSlug.
 *
 * Contract:
 *  - Every value that is not an exact member of PAID_PLAN_ALLOWLIST collapses
 *    to the stable "unknown_plan" token.
 *  - Allowlisted plan slugs pass through unchanged.
 *  - The fallback token stays enum-like so the funnel sanitizer (no
 *    whitespace, <= 32 chars) accepts it without dropping the field.
 */

import { describe, expect, it } from "vitest";

import {
  CHECKOUT_RECOVERY_UNKNOWN_PLAN_SLUG,
  sanitizeCheckoutRecoveryPlanSlug,
} from "@/lib/checkoutRecoveryPlanSlug";
import { PAID_PLAN_IDS } from "@/lib/paidPlanAllowlist";
import { sanitizeFunnelParams } from "@/lib/funnelAnalytics";

describe("sanitizeCheckoutRecoveryPlanSlug", () => {
  it.each(PAID_PLAN_IDS)("passes through allowlisted plan %s", (id) => {
    expect(sanitizeCheckoutRecoveryPlanSlug(id)).toBe(id);
  });

  it.each([
    undefined,
    null,
    "",
    "PRO_MONTHLY",
    "pro-monthly",
    "pro_monthly ",
    " pro_monthly",
    "pri_01hxyz",
    "Pro Monthly",
    "https://verdantgrowdiary.com/pricing",
    "free",
    "enterprise",
    "{plan:pro_monthly}",
    42,
    true,
    { plan: "pro_monthly" },
    ["pro_monthly"],
  ] as const)("collapses non-allowlisted value %p to unknown_plan", (value) => {
    expect(sanitizeCheckoutRecoveryPlanSlug(value)).toBe(CHECKOUT_RECOVERY_UNKNOWN_PLAN_SLUG);
  });

  it("fallback token survives the funnel-param sanitizer", () => {
    const sanitized = sanitizeFunnelParams({ plan: CHECKOUT_RECOVERY_UNKNOWN_PLAN_SLUG });
    expect(sanitized.plan).toBe(CHECKOUT_RECOVERY_UNKNOWN_PLAN_SLUG);
  });

  it.each(PAID_PLAN_IDS)("allowlisted plan %s survives funnel sanitizer", (id) => {
    const sanitized = sanitizeFunnelParams({ plan: id });
    expect(sanitized.plan).toBe(id);
  });
});
