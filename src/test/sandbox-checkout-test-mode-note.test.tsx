import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import { SandboxCheckoutTestModeNote } from "@/components/SandboxCheckoutTestModeNote";
import {
  SANDBOX_CHECKOUT_TEST_MODE_NOTE,
  sandboxCheckoutTestModeNote,
} from "@/lib/sandboxCheckoutTestModeNoteRules";

const checkout = vi.hoisted(() => ({
  environment: "sandbox" as "sandbox" | "live",
}));

vi.mock("@/hooks/usePaddleCheckout", () => ({
  usePaddleCheckout: () => ({
    openCheckout: vi.fn(async () => {}),
    loading: false,
    environment: checkout.environment,
    unavailableMessage: null,
    blockedReason: null,
    blockedReasonCode: null,
    dismissBlocked: vi.fn(),
  }),
}));

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
vi.mock("@/lib/pricingAnalytics", () => ({ trackPricingEvent: vi.fn() }));
vi.mock("@/lib/funnelAnalytics", () => ({ trackFunnelEvent: vi.fn() }));

import Pricing from "@/pages/Pricing";

function renderPricing() {
  return render(
    <MemoryRouter initialEntries={["/pricing"]}>
      <Pricing />
    </MemoryRouter>,
  );
}

describe("sandbox checkout test-mode note", () => {
  beforeEach(() => {
    checkout.environment = "sandbox";
  });

  it("returns the exact sentence only when checkout resolves to sandbox", () => {
    expect(SANDBOX_CHECKOUT_TEST_MODE_NOTE).toBe("Test mode: no real charges are made");
    expect(sandboxCheckoutTestModeNote("sandbox")).toBe(SANDBOX_CHECKOUT_TEST_MODE_NOTE);
    expect(sandboxCheckoutTestModeNote("live")).toBeNull();
    expect(sandboxCheckoutTestModeNote("unavailable")).toBeNull();
    expect(sandboxCheckoutTestModeNote(null)).toBeNull();
    expect(sandboxCheckoutTestModeNote(undefined)).toBeNull();
  });

  it("repeats the same sentence for the same environment", () => {
    expect(sandboxCheckoutTestModeNote("sandbox")).toBe(sandboxCheckoutTestModeNote("sandbox"));
    expect(sandboxCheckoutTestModeNote("live")).toBe(sandboxCheckoutTestModeNote("live"));
  });

  it("shows the note for sandbox without an operator check", () => {
    render(<SandboxCheckoutTestModeNote environment="sandbox" />);
    expect(screen.getByTestId("sandbox-checkout-test-mode-note")).toHaveTextContent(
      "Test mode: no real charges are made",
    );
  });

  it("renders nothing when checkout is not sandbox", () => {
    const { container } = render(<SandboxCheckoutTestModeNote environment="unavailable" />);
    expect(screen.queryByTestId("sandbox-checkout-test-mode-note")).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the note on Pricing when checkout resolves to sandbox", () => {
    checkout.environment = "sandbox";
    renderPricing();
    expect(screen.getByTestId("sandbox-checkout-test-mode-note")).toHaveTextContent(
      SANDBOX_CHECKOUT_TEST_MODE_NOTE,
    );
  });

  it("hides the note on Pricing when checkout resolves to live", () => {
    checkout.environment = "live";
    renderPricing();
    expect(screen.queryByTestId("sandbox-checkout-test-mode-note")).toBeNull();
  });
});
