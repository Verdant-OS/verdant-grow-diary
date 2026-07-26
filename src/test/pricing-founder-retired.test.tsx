/**
 * Founder Lifetime is retired from the public pricing page.
 *
 * Presentation only. `founder_lifetime` stays in planCatalog, PAID_PLAN_IDS /
 * SUBSCRIPTION_PLAN_IDS, ai_credit_allowance and every entitlement gate, so
 * existing holders keep exactly what they bought and the sell-vs-grant parity
 * guards stay satisfied. This file pins the *display* contract only.
 *
 * The deep link stays live on purpose: `?plan=founder_lifetime` (and the legacy
 * `/billing/founder-lifetime` redirect that lands on it) still renders the
 * offer, so a link already sent out completes rather than dead-ending on a page
 * where Founder has silently vanished.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ openCheckout: vi.fn() }));

vi.mock("@/hooks/usePaddleCheckout", () => ({
  usePaddleCheckout: () => ({
    openCheckout: mocks.openCheckout,
    loading: false,
    environment: "live" as const,
    unavailable: false,
    unavailableMessage: null,
    blockedReason: null,
    dismissBlocked: vi.fn(),
  }),
}));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
vi.mock("@/lib/pricingAnalytics", () => ({ trackPricingEvent: vi.fn() }));

import Pricing from "@/pages/Pricing";

function renderPricing(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Pricing />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.openCheckout.mockReset();
  document.querySelectorAll('[data-page-ldjson="pricing"]').forEach((n) => n.remove());
});

describe("Founder Lifetime retired from /pricing", () => {
  it("shows no Founder surface at all when browsing normally", () => {
    renderPricing("/pricing");
    // The grid card, the highlight band, and the comparison column are three
    // separate render sites — a partial removal that leaves one behind is the
    // failure mode this asserts against.
    expect(screen.queryByTestId("pricing-card-founder")).toBeNull();
    expect(screen.queryByTestId("pricing-cta-founder-lifetime")).toBeNull();
    expect(screen.queryByTestId("pricing-cta-founder-highlight")).toBeNull();
    expect(screen.getByTestId("pricing-comparison-table").textContent).not.toMatch(
      /Founder Lifetime/i,
    );
  });

  it("does not advertise a retired offer in structured data", () => {
    // A leftover Product node keeps Founder surfacing in search results as a
    // buyable thing long after the card is gone.
    //
    // Scoped to Product nodes deliberately. The shared credits FAQ
    // (verdantSeoCopy.ts) still names Founder Lifetime when explaining monthly
    // allowances — that remains TRUE for existing holders and is a statement
    // of fact, not an offer. Asserting "the string never appears" would force
    // an edit to copy shared with other pages, to delete something accurate.
    renderPricing("/pricing");
    const payloads = [...document.querySelectorAll('[data-page-ldjson="pricing"]')].map(
      (n) => JSON.parse(n.textContent ?? "{}") as Record<string, unknown>,
    );
    expect(payloads.length).toBeGreaterThan(0);

    const products = payloads.flatMap((p) => {
      const graph = (p["@graph"] ?? p.itemListElement ?? []) as unknown[];
      const list = Array.isArray(graph) ? graph : [];
      return list.filter(
        (n) => typeof n === "object" && n !== null && (n as { "@type"?: string })["@type"] === "Product",
      );
    });
    // Non-triviality: the page must still describe SOME product, or this
    // assertion passes by finding nothing at all.
    expect(products.length).toBeGreaterThan(0);
    expect(JSON.stringify(products)).not.toMatch(/Founder/i);
  });

  it("still honours an existing Founder deep link", () => {
    renderPricing("/pricing?plan=founder_lifetime");
    expect(screen.getByTestId("pricing-card-founder")).toBeInTheDocument();
    expect(screen.getByTestId("pricing-cta-founder-lifetime")).toBeInTheDocument();
  });

  it("keeps Free, Pro and Craft on the public page", () => {
    // Non-triviality: proves the assertions above are scoped to Founder and
    // that the retirement did not take the rest of the grid with it.
    renderPricing("/pricing");
    expect(screen.getByTestId("pricing-card-free")).toBeInTheDocument();
    expect(screen.getByTestId("pricing-card-pro")).toBeInTheDocument();
    expect(screen.getByTestId("pricing-cta-craft-annual")).toBeInTheDocument();
  });
});
