/**
 * Issue #1994 / PR #2212 Codex P2:
 * Start with the "Is checkout live?" FAQ item closed on the initial render
 * so SSR and client hydration match, then read `window.location.hash` in a
 * `useEffect` after mount (and on `hashchange`) to expand and scroll to
 * `#pricing-faq-checkout-live`.
 */
import { act, useLayoutEffect } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import { CHECKOUT_MECHANISM_FAQ_ANSWER } from "@/lib/checkoutTrustCopyRules";
import { CHECKOUT_LIVE_FAQ_ID } from "@/lib/sandboxCheckoutTestModeNoteRules";

const checkout = vi.hoisted(() => ({
  environment: "sandbox" as "sandbox" | "live" | "unavailable",
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

const scrollIntoView = vi.fn();
const originalScrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView",
);

let hydratedRoot: Root | null = null;
let hydratedContainer: HTMLDivElement | null = null;

describe("Pricing checkout-live FAQ hydration and post-mount hash expansion (#2212)", () => {
  beforeEach(() => {
    checkout.environment = "sandbox";
    scrollIntoView.mockReset();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: scrollIntoView,
    });
    window.history.replaceState(null, "", "/pricing");
  });

  afterEach(() => {
    act(() => {
      hydratedRoot?.unmount();
    });
    hydratedContainer?.remove();
    hydratedRoot = null;
    hydratedContainer = null;
    cleanup();
    if (originalScrollIntoViewDescriptor) {
      Object.defineProperty(
        HTMLElement.prototype,
        "scrollIntoView",
        originalScrollIntoViewDescriptor,
      );
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
    window.history.replaceState(null, "", "/");
  });

  it("shows no FAQ item open on the initial render even when #pricing-faq-checkout-live is present, then opens and scrolls after mount", () => {
    window.history.replaceState(null, "", `/pricing#${CHECKOUT_LIVE_FAQ_ID}`);

    const initialHtml = renderToString(
      <MemoryRouter initialEntries={[`/pricing#${CHECKOUT_LIVE_FAQ_ID}`]}>
        <Pricing />
      </MemoryRouter>,
    );
    const initialSnapshot = document.createElement("div");
    initialSnapshot.innerHTML = initialHtml;

    const initialFaqItem = within(initialSnapshot).getByTestId("pricing-faq-checkout-status");
    const initialTrigger = within(initialFaqItem).getByRole("button", {
      name: "Is checkout live?",
    });
    expect(initialTrigger).toHaveAttribute("aria-expanded", "false");
    expect(initialSnapshot.querySelectorAll('button[aria-expanded="true"]')).toHaveLength(0);

    let expandedInFirstCommitCount = -1;
    function FirstCommitInspector() {
      useLayoutEffect(() => {
        expandedInFirstCommitCount = document.querySelectorAll(
          'button[aria-expanded="true"]',
        ).length;
      }, []);
      return null;
    }

    render(
      <MemoryRouter initialEntries={[`/pricing#${CHECKOUT_LIVE_FAQ_ID}`]}>
        <Pricing />
        <FirstCommitInspector />
      </MemoryRouter>,
    );

    expect(expandedInFirstCommitCount).toBe(0);

    const mountedFaqItem = screen.getByTestId("pricing-faq-checkout-status");
    const mountedTrigger = within(mountedFaqItem).getByRole("button", {
      name: "Is checkout live?",
    });
    expect(mountedTrigger).toHaveAttribute("aria-expanded", "true");
    expect(mountedFaqItem).toHaveTextContent(CHECKOUT_MECHANISM_FAQ_ANSWER);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("hydrates server HTML without a mismatch when window.location.hash is #pricing-faq-checkout-live, then expands and scrolls after mount", async () => {
    window.history.replaceState(null, "", "/pricing");
    const ssrHtml = renderToString(
      <MemoryRouter initialEntries={["/pricing"]}>
        <Pricing />
      </MemoryRouter>,
    );

    window.history.replaceState(null, "", `/pricing#${CHECKOUT_LIVE_FAQ_ID}`);
    hydratedContainer = document.createElement("div");
    hydratedContainer.innerHTML = ssrHtml;
    document.body.appendChild(hydratedContainer);

    const recoverableErrors: unknown[] = [];
    await act(async () => {
      hydratedRoot = hydrateRoot(
        hydratedContainer!,
        <MemoryRouter initialEntries={["/pricing"]}>
          <Pricing />
        </MemoryRouter>,
        {
          onRecoverableError: (err) => {
            recoverableErrors.push(err);
          },
        },
      );
    });

    expect(recoverableErrors).toEqual([]);

    const faqItem = within(hydratedContainer).getByTestId("pricing-faq-checkout-status");
    const trigger = within(faqItem).getByRole("button", { name: "Is checkout live?" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(faqItem).toHaveTextContent(CHECKOUT_MECHANISM_FAQ_ANSWER);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("opens and scrolls to #pricing-faq-checkout-live on window hashchange after mount", () => {
    render(
      <MemoryRouter initialEntries={["/pricing"]}>
        <Pricing />
      </MemoryRouter>,
    );

    const faqItem = screen.getByTestId("pricing-faq-checkout-status");
    const trigger = within(faqItem).getByRole("button", { name: "Is checkout live?" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(scrollIntoView).not.toHaveBeenCalled();

    act(() => {
      window.history.replaceState(null, "", `/pricing#${CHECKOUT_LIVE_FAQ_ID}`);
      window.dispatchEvent(new Event("hashchange"));
    });

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(faqItem).toHaveTextContent(CHECKOUT_MECHANISM_FAQ_ANSWER);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
