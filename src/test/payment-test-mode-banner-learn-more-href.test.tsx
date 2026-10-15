import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const paddleState = vi.hoisted(() => ({
  environment: "sandbox" as "sandbox" | "live" | "unavailable",
  unavailableMessage: null as string | null,
}));

vi.mock("@/lib/paddle", () => ({
  resolvePaddleCheckout: () => paddleState.environment,
  getCheckoutUnavailableMessage: () => paddleState.unavailableMessage,
}));

import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";

beforeEach(() => {
  paddleState.environment = "sandbox";
  paddleState.unavailableMessage = null;
});

afterEach(() => cleanup());

describe("PaymentTestModeBanner learn more", () => {
  it("contains no lovable.dev href", () => {
    render(createElement(PaymentTestModeBanner));

    const banner = screen.getByTestId("payments-test-mode-banner");
    const hrefs = [...banner.querySelectorAll("a")].map((anchor) => anchor.getAttribute("href"));
    expect(hrefs.some((href) => href?.includes("lovable.dev"))).toBe(false);
    expect(hrefs).toEqual(["/pricing#pricing-faq-checkout-live"]);
  });
});
