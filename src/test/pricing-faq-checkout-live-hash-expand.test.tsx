/**
 * Issue #1994 retest fix: navigating to `/pricing#pricing-faq-checkout-live`
 * or clicking the "Is checkout live?" link on `/pricing` expands the
 * "Is checkout live?" FAQ item so its answer is visible.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import { CHECKOUT_MECHANISM_FAQ_ANSWER } from "@/lib/checkoutTrustCopyRules";
import {
  CHECKOUT_LIVE_FAQ_ID,
  CHECKOUT_LIVE_FAQ_ITEM_VALUE,
  resolvePricingFaqValueForHash,
} from "@/lib/sandboxCheckoutTestModeNoteRules";

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

describe("Pricing #pricing-faq-checkout-live expansion (#1994)", () => {
  beforeEach(() => {
    checkout.environment = "sandbox";
    window.history.replaceState(null, "", "/pricing");
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState(null, "", "/");
  });

  it("resolves the checkout-live FAQ accordion value only for #pricing-faq-checkout-live", () => {
    expect(resolvePricingFaqValueForHash(`#${CHECKOUT_LIVE_FAQ_ID}`)).toBe(
      CHECKOUT_LIVE_FAQ_ITEM_VALUE,
    );
    expect(resolvePricingFaqValueForHash(CHECKOUT_LIVE_FAQ_ID)).toBe(CHECKOUT_LIVE_FAQ_ITEM_VALUE);
    expect(resolvePricingFaqValueForHash("#buy-credits")).toBeNull();
    expect(resolvePricingFaqValueForHash("")).toBeNull();
    expect(resolvePricingFaqValueForHash(null)).toBeNull();
    expect(resolvePricingFaqValueForHash(undefined)).toBeNull();
  });

  it("expands the 'Is checkout live?' FAQ answer when arriving on /pricing#pricing-faq-checkout-live", () => {
    render(
      <MemoryRouter initialEntries={[`/pricing#${CHECKOUT_LIVE_FAQ_ID}`]}>
        <Pricing />
      </MemoryRouter>,
    );

    const faqItem = screen.getByTestId("pricing-faq-checkout-status");
    const trigger = within(faqItem).getByRole("button", { name: "Is checkout live?" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(faqItem).toHaveTextContent(CHECKOUT_MECHANISM_FAQ_ANSWER);
  });

  it("keeps the 'Is checkout live?' FAQ collapsed by default on /pricing without the hash, and expands it when the in-page 'Is checkout live?' link is clicked", () => {
    render(
      <MemoryRouter initialEntries={["/pricing"]}>
        <Pricing />
      </MemoryRouter>,
    );

    const faqItem = screen.getByTestId("pricing-faq-checkout-status");
    const trigger = within(faqItem).getByRole("button", { name: "Is checkout live?" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    const noteLink = screen.getByRole("link", { name: "Is checkout live?" });
    fireEvent.click(noteLink);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(faqItem).toHaveTextContent(CHECKOUT_MECHANISM_FAQ_ANSWER);
  });

  it("expands the 'Is checkout live?' FAQ answer when a same-page hashchange navigates to #pricing-faq-checkout-live", () => {
    render(
      <MemoryRouter initialEntries={["/pricing"]}>
        <Pricing />
      </MemoryRouter>,
    );

    const faqItem = screen.getByTestId("pricing-faq-checkout-status");
    const trigger = within(faqItem).getByRole("button", { name: "Is checkout live?" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    act(() => {
      window.history.replaceState(null, "", `/pricing#${CHECKOUT_LIVE_FAQ_ID}`);
      window.dispatchEvent(new Event("hashchange"));
    });

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(faqItem).toHaveTextContent(CHECKOUT_MECHANISM_FAQ_ANSWER);
  });

  it("still allows the user to collapse and open other FAQ items after hash expansion", () => {
    render(
      <MemoryRouter initialEntries={[`/pricing#${CHECKOUT_LIVE_FAQ_ID}`]}>
        <Pricing />
      </MemoryRouter>,
    );

    const checkoutFaq = screen.getByTestId("pricing-faq-checkout-status");
    const checkoutTrigger = within(checkoutFaq).getByRole("button", {
      name: "Is checkout live?",
    });
    expect(checkoutTrigger).toHaveAttribute("aria-expanded", "true");

    const otherFaq = screen.getByTestId("pricing-faq-what-paying-for");
    const otherTrigger = within(otherFaq).getByRole("button", {
      name: "What am I really paying for?",
    });
    fireEvent.click(otherTrigger);

    expect(otherTrigger).toHaveAttribute("aria-expanded", "true");
    expect(checkoutTrigger).toHaveAttribute("aria-expanded", "false");
  });
});
