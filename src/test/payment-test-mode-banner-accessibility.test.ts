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

describe("PaymentTestModeBanner", () => {
  it("announces public sandbox test mode and that no real charges are made", () => {
    render(createElement(PaymentTestModeBanner));

    const banner = screen.getByRole("complementary", { name: "Payment environment" });
    expect(banner).toHaveAttribute("aria-live", "polite");
    expect(banner).toHaveAttribute("data-payment-env", "sandbox");
    expect(banner).toHaveTextContent("sandbox");
    expect(banner).toHaveTextContent("test mode");
    expect(banner).toHaveTextContent("No real charges");
  });

  it("uses the named availability landmark when sandbox checkout is unavailable", () => {
    paddleState.environment = "unavailable";
    paddleState.unavailableMessage = "Sandbox test checkout is currently unavailable.";

    render(createElement(PaymentTestModeBanner));

    const banner = screen.getByRole("complementary", { name: "Payment availability" });
    expect(banner).toHaveAttribute("aria-live", "polite");
    expect(banner).toHaveAttribute("data-payment-env", "unavailable");
    expect(banner).toHaveTextContent("Sandbox test checkout is currently unavailable.");
  });

  it("renders nothing for a resolved live environment (resolved only on a production host)", () => {
    paddleState.environment = "live";
    paddleState.unavailableMessage = null;

    const { container } = render(createElement(PaymentTestModeBanner));

    expect(screen.queryByText(/Live payments enabled/i)).toBeNull();
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(container.innerHTML).toBe("");
  });

  it("announces the off-host block for a live token outside the production hosts", () => {
    // A live token on any non-production host resolves "unavailable".
    paddleState.environment = "unavailable";
    paddleState.unavailableMessage = "Live checkout is only available on verdantgrowdiary.com.";

    render(createElement(PaymentTestModeBanner));

    const banner = screen.getByRole("complementary", { name: "Payment availability" });
    expect(banner).toHaveAttribute("data-payment-env", "unavailable");
    expect(banner).toHaveTextContent("only available on verdantgrowdiary.com");
  });
});
