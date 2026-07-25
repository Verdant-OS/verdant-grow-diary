/**
 * Pricing blocked-checkout UI — reason-code leak guard.
 *
 * The `usePaddleCheckout` hook exposes a `blockedReason` string that is meant
 * to be the calm, grower-facing message produced by
 * `getPaddleCheckoutCatalogMessage(...)`. The sanitized reason enum tokens
 * (`unknown_plan`, `price_not_configured`, `price_resolution_unavailable`,
 * `plan_sold_out`, plus the env-unavailable telemetry token
 * `checkout_env_unavailable`) are telemetry-only and must never appear in the
 * rendered DOM.
 *
 * This test drives the Pricing page through every catalog reason and asserts:
 *   1. The recovery panel is rendered.
 *   2. The human copy for that reason is present.
 *   3. None of the internal reason tokens appear anywhere in the rendered
 *      DOM (including data-* attributes, aria-labels, and button text).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  getPaddleCheckoutCatalogMessage,
  type PaddleCheckoutCatalogReason,
} from "@/lib/paddle";

const openCheckoutMock = vi.fn(async () => {});
const dismissBlockedMock = vi.fn();

let currentBlockedReason: string | null = null;
let currentUnavailableMessage: string | null = null;

vi.mock("@/hooks/usePaddleCheckout", () => ({
  usePaddleCheckout: () => ({
    openCheckout: openCheckoutMock,
    loading: false,
    environment: "sandbox" as const,
    unavailableMessage: currentUnavailableMessage,
    blockedReason: currentBlockedReason,
    dismissBlocked: dismissBlockedMock,
  }),
}));

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
vi.mock("@/hooks/useFounderSlotsRemaining", () => ({
  useFounderSlotsRemaining: () => ({
    status: "ready" as const,
    remaining: 25,
    total: 100,
    claimed: 75,
    soldOut: false,
  }),
}));
vi.mock("@/components/SubscriberInterestForm", () => ({ default: () => null }));

import Pricing from "@/pages/Pricing";

const REASON_TOKENS: readonly string[] = [
  "unknown_plan",
  "price_not_configured",
  "price_resolution_unavailable",
  "plan_sold_out",
  "checkout_env_unavailable",
  "runtime_failure",
  "environment_unavailable",
];

const CATALOG_REASONS: readonly PaddleCheckoutCatalogReason[] = [
  "unknown_plan",
  "price_not_configured",
  "price_resolution_unavailable",
  "plan_sold_out",
];

function renderPricing() {
  return render(
    <MemoryRouter initialEntries={["/pricing"]}>
      <Pricing />
    </MemoryRouter>,
  );
}

function assertNoReasonTokensLeaked(html: string) {
  for (const token of REASON_TOKENS) {
    expect(
      html,
      `sanitized reason token "${token}" leaked into blocked checkout UI`,
    ).not.toContain(token);
  }
}

describe("Pricing blocked checkout — sanitized reason-code leak guard", () => {
  beforeEach(() => {
    currentBlockedReason = null;
    currentUnavailableMessage = null;
    openCheckoutMock.mockClear();
    dismissBlockedMock.mockClear();
  });

  for (const reason of CATALOG_REASONS) {
    it(`renders human copy but no reason token for "${reason}"`, () => {
      const humanCopy = getPaddleCheckoutCatalogMessage(reason);
      currentBlockedReason = humanCopy;

      const { container, getByTestId } = renderPricing();

      // 1. Recovery panel rendered.
      expect(getByTestId("pricing-checkout-recovery")).toBeTruthy();

      // 2. Human copy present.
      expect(container.textContent ?? "").toContain(humanCopy);

      // 3. No sanitized reason tokens leaked (full markup, incl. data-* attrs).
      assertNoReasonTokensLeaked(container.innerHTML);
    });
  }

  it("renders env-unavailable message without leaking env/env-token strings", () => {
    // Simulate the fail-closed env-unavailable path where
    // usePaddleCheckout surfaces a calm `unavailableMessage` rather than a
    // catalog `blockedReason`. Same guarantee: no telemetry tokens leak.
    currentUnavailableMessage =
      "Checkout is temporarily unavailable. Please try again in a moment.";

    const { container, getByTestId } = renderPricing();

    expect(getByTestId("pricing-checkout-recovery")).toBeTruthy();
    expect(container.textContent ?? "").toContain(currentUnavailableMessage);
    assertNoReasonTokensLeaked(container.innerHTML);
  });

  it("does not render the recovery panel or leak tokens when checkout is healthy", () => {
    const { container, queryByTestId } = renderPricing();

    expect(queryByTestId("pricing-checkout-recovery")).toBeNull();
    assertNoReasonTokensLeaked(container.innerHTML);
  });

  it("guards against a hook regression that put a raw reason token into blockedReason", () => {
    // Contract check: even if some future refactor accidentally routed the
    // raw enum token into `blockedReason` (which the panel renders verbatim),
    // this test will fail loudly rather than silently ship the leak.
    currentBlockedReason = "price_not_configured";

    const { container } = renderPricing();

    // The panel *would* render this string — that is exactly the regression
    // we want to catch. This assertion must fail if the leak ever happens.
    for (const token of REASON_TOKENS) {
      if (container.innerHTML.includes(token)) {
        throw new Error(
          `regression: raw reason token "${token}" reached the rendered DOM`,
        );
      }
    }
    cleanup();
  });
});
