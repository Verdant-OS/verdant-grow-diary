/**
 * Unit tests for the fallback telemetry emitted by
 * sanitizeCheckoutRecoveryPlanSlug when it collapses an input to
 * "unknown_plan".
 *
 * Contract:
 *  - Every fallback increments getUnknownPlanSlugFallbackCount by exactly one.
 *  - Allowlisted plan slugs never bump the counter and never warn.
 *  - The console.warn payload is single-line JSON and carries ONLY the
 *    non-sensitive fields (event, reason, length_bucket). It must never carry
 *    the raw rejected value, a user id, a route, or any other identifier.
 *  - Warnings are throttled per (reason,length_bucket) tuple so a stuck
 *    caller cannot flood the console. The counter still increments on every
 *    call regardless of throttle state.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetCheckoutRecoveryPlanSlugTelemetryForTests,
  getUnknownPlanSlugFallbackCount,
  sanitizeCheckoutRecoveryPlanSlug,
} from "@/lib/checkoutRecoveryPlanSlug";

const ALLOWED_KEYS = new Set(["event", "reason", "length_bucket"]);
const FORBIDDEN_TOKENS = [
  "user",
  "userId",
  "email",
  "token",
  "jwt",
  "authorization",
  "cookie",
  "session",
  "ip",
  "route",
  "url",
  "http",
  "price",
  "pri_",
  "customer",
  "transaction",
];

describe("checkout recovery plan slug fallback telemetry", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetCheckoutRecoveryPlanSlugTelemetryForTests();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("does not bump the counter or warn for an allowlisted plan", () => {
    sanitizeCheckoutRecoveryPlanSlug("pro_monthly");
    expect(getUnknownPlanSlugFallbackCount()).toBe(0);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("increments the counter exactly once per fallback call", () => {
    sanitizeCheckoutRecoveryPlanSlug(undefined);
    sanitizeCheckoutRecoveryPlanSlug(null);
    sanitizeCheckoutRecoveryPlanSlug("not-a-real-plan");
    sanitizeCheckoutRecoveryPlanSlug(42);
    expect(getUnknownPlanSlugFallbackCount()).toBe(4);
  });

  it("emits single-line JSON with only allowed non-sensitive fields", () => {
    sanitizeCheckoutRecoveryPlanSlug("Pro Monthly");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const raw = warnSpy.mock.calls[0]?.[0];
    expect(typeof raw).toBe("string");
    expect(raw).not.toContain("\n");

    const parsed = JSON.parse(raw as string) as Record<string, unknown>;
    expect(parsed.event).toBe("checkout_recovery_plan_slug_fallback");
    expect(parsed.reason).toBe("not_in_allowlist");
    expect(parsed.length_bucket).toBe("9-32");

    for (const key of Object.keys(parsed)) {
      expect(ALLOWED_KEYS.has(key), `unexpected key ${key}`).toBe(true);
    }

    const serialized = (raw as string).toLowerCase();
    // The raw rejected value ("Pro Monthly") must not appear.
    expect(serialized).not.toContain("pro monthly");
    for (const token of FORBIDDEN_TOKENS) {
      expect(serialized).not.toContain(token.toLowerCase());
    }
  });

  it("classifies each fallback branch correctly", () => {
    sanitizeCheckoutRecoveryPlanSlug(undefined);
    sanitizeCheckoutRecoveryPlanSlug({ plan: "pro_monthly" });
    sanitizeCheckoutRecoveryPlanSlug("");
    sanitizeCheckoutRecoveryPlanSlug("nope");

    const reasons = warnSpy.mock.calls
      .map((call) => JSON.parse(call[0] as string) as { reason: string })
      .map((entry) => entry.reason);

    expect(reasons).toEqual(["missing", "wrong_type", "empty_string", "not_in_allowlist"]);
  });

  it("throttles warnings per (reason,length_bucket) tuple while still counting", () => {
    for (let i = 0; i < 5; i += 1) {
      sanitizeCheckoutRecoveryPlanSlug(undefined);
    }
    expect(getUnknownPlanSlugFallbackCount()).toBe(5);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    // Different bucket -> new warning.
    sanitizeCheckoutRecoveryPlanSlug("this-string-is-longer-than-eight");
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(getUnknownPlanSlugFallbackCount()).toBe(6);
  });
});
