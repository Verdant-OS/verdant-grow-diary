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
import { CHECKOUT_LIVE_FAQ_ID } from "@/lib/sandboxCheckoutTestModeNoteRules";

const CHECKOUT_LIVE_FAQ_PRICING_HREF = `/pricing#${CHECKOUT_LIVE_FAQ_ID}`;

beforeEach(() => {
  paddleState.environment = "sandbox";
  paddleState.unavailableMessage = null;
});

afterEach(() => cleanup());

describe("PaymentTestModeBanner learn more", () => {
  it("links Learn more to the checkout-live FAQ on pricing (#1994)", () => {
    render(createElement(PaymentTestModeBanner));

    const link = screen.getByRole("link", { name: "Learn more" });
    expect(link).toHaveAttribute("href", CHECKOUT_LIVE_FAQ_PRICING_HREF);

    const banner = screen.getByTestId("payments-test-mode-banner");
    expect(banner).toContainElement(link);
  });

  it("contains no lovable.dev href", () => {
    render(createElement(PaymentTestModeBanner));

    const banner = screen.getByTestId("payments-test-mode-banner");
    const hrefs = [...banner.querySelectorAll("a")].map((anchor) => anchor.getAttribute("href"));
    expect(hrefs.some((href) => href?.includes("lovable.dev"))).toBe(false);
    expect(hrefs).toEqual([CHECKOUT_LIVE_FAQ_PRICING_HREF]);
  });

  it("does not show Learn more when checkout is unavailable", () => {
    paddleState.environment = "unavailable";
    paddleState.unavailableMessage = "Sandbox test checkout is currently unavailable.";

    render(createElement(PaymentTestModeBanner));

    expect(screen.queryByRole("link", { name: "Learn more" })).toBeNull();
    expect(screen.getByTestId("payments-unavailable-banner")).toBeInTheDocument();
  });
});
