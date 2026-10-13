import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shouldShowPaddleSandboxTestModeBanner } from "@/lib/paymentTestModeBannerVisibilityRules";

const paddleState = vi.hoisted(() => ({
  environment: "sandbox" as "sandbox" | "live" | "unavailable",
  unavailableMessage: null as string | null,
}));

const roleState = vi.hoisted(() => ({
  role: "" as string,
  status: "denied" as "loading" | "granted" | "denied" | "unauthenticated" | "error",
  granted: false,
}));

vi.mock("@/lib/paddle", () => ({
  resolvePaddleCheckout: () => paddleState.environment,
  getCheckoutUnavailableMessage: () => paddleState.unavailableMessage,
}));

vi.mock("@/hooks/useHasRole", () => ({
  useHasRole: (role: string) => {
    roleState.role = role;
    return {
      status: roleState.status,
      granted: roleState.granted,
      error: roleState.status === "error" ? "role_check_failed" : null,
    };
  },
}));

import { SitePaymentTestModeBanner } from "@/components/PaymentTestModeBanner";

beforeEach(() => {
  paddleState.environment = "sandbox";
  paddleState.unavailableMessage = null;
  roleState.role = "";
  roleState.status = "denied";
  roleState.granted = false;
});

afterEach(() => cleanup());

describe("shouldShowPaddleSandboxTestModeBanner", () => {
  it("shows the sandbox banner only when the operator check is granted", () => {
    expect(shouldShowPaddleSandboxTestModeBanner(true)).toBe(true);
    expect(shouldShowPaddleSandboxTestModeBanner(false)).toBe(false);
  });
});

describe("SitePaymentTestModeBanner", () => {
  it("shows the sandbox test-mode banner to an operator", () => {
    roleState.status = "granted";
    roleState.granted = true;

    render(createElement(SitePaymentTestModeBanner));

    expect(roleState.role).toBe("operator");
    expect(screen.getByTestId("payments-test-mode-banner")).toHaveTextContent("test mode");
    expect(screen.queryByTestId("payments-unavailable-banner")).toBeNull();
  });

  it.each([
    ["denied", false],
    ["unauthenticated", false],
    ["loading", false],
    ["error", false],
  ] as const)("hides the sandbox banner when the operator check is %s", (status, granted) => {
    roleState.status = status;
    roleState.granted = granted;

    render(createElement(SitePaymentTestModeBanner));

    expect(roleState.role).toBe("operator");
    expect(screen.queryByTestId("payments-test-mode-banner")).toBeNull();
    expect(screen.queryByText(/test mode/i)).toBeNull();
  });

  it("still shows checkout-unavailable copy to a non-operator", () => {
    paddleState.environment = "unavailable";
    paddleState.unavailableMessage = "Sandbox test checkout is currently unavailable.";
    roleState.status = "unauthenticated";
    roleState.granted = false;

    render(createElement(SitePaymentTestModeBanner));

    expect(screen.queryByTestId("payments-test-mode-banner")).toBeNull();
    expect(screen.getByTestId("payments-unavailable-banner")).toHaveTextContent(
      "Sandbox test checkout is currently unavailable.",
    );
  });
});
