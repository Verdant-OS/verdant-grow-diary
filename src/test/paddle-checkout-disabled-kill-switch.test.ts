/**
 * Build-time checkout kill switch (`VITE_CHECKOUT_DISABLED`) at the pure layer.
 * Regression guard: only exact "true" disables; disabled builds block every host.
 */
import { describe, expect, it } from "vitest";
import {
  CHECKOUT_PAUSED_MESSAGE,
  isCheckoutDisabledFlag,
  resolvePaddleCheckoutEnvironment,
} from "@/lib/paddleEnvironment";

describe("isCheckoutDisabledFlag", () => {
  it("disables checkout only for the exact string true", () => {
    expect(isCheckoutDisabledFlag("true")).toBe(true);
  });

  it.each([
    true,
    false,
    "false",
    "",
    "1",
    "TRUE",
    " true",
    "true ",
    " true ",
    "\ttrue",
    "true\n",
    undefined,
    null,
  ])("does not treat %j as disabled", (value) => {
    expect(isCheckoutDisabledFlag(value)).toBe(false);
  });
});

describe("resolvePaddleCheckoutEnvironment with checkoutDisabled", () => {
  it("returns unavailable for live and sandbox tokens when checkout is disabled", () => {
    expect(
      resolvePaddleCheckoutEnvironment({
        token: "live_abc000000000000000000000000",
        hostname: "verdantgrowdiary.com",
        checkoutDisabled: true,
      }),
    ).toBe("unavailable");
    expect(
      resolvePaddleCheckoutEnvironment({
        token: "test_abc000000000000000000000000",
        hostname: "localhost",
        checkoutDisabled: true,
      }),
    ).toBe("unavailable");
  });
});

describe("CHECKOUT_PAUSED_MESSAGE", () => {
  it("does not leak token or environment details", () => {
    expect(CHECKOUT_PAUSED_MESSAGE).toMatch(/paused/i);
    expect(CHECKOUT_PAUSED_MESSAGE).not.toMatch(/live_|test_|token/i);
    expect(CHECKOUT_PAUSED_MESSAGE).not.toMatch(/sandbox/i);
  });
});
