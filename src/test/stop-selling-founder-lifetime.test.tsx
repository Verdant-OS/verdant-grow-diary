/**
 * Sales-surface guards: Founder Lifetime is no longer offered.
 * Existing entitlements are covered in stop-selling-founder-entitlement-guard.test.ts.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import Pricing from "@/pages/Pricing";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildLegacyBillingRedirect } from "@/lib/legacyCheckoutRedirect";
import { isFounderLifetimeCheckoutSku } from "@/lib/founderLifetimeCheckoutGuard";

vi.mock("@/lib/pricingAnalytics", () => ({
  trackPricingEvent: vi.fn(),
  PRICING_ANALYTICS_EVENT: "verdant:analytics",
}));

const ROOT = resolve(__dirname, "../..");

function renderPricing(search = "") {
  return render(
    <MemoryRouter initialEntries={[`/pricing${search}`]}>
      <Pricing />
    </MemoryRouter>,
  );
}

describe("stop selling Founder Lifetime", () => {
  it("never renders Founder or $129 on /pricing, with or without the old plan query", () => {
    for (const search of ["", "?plan=founder_lifetime"]) {
      const view = renderPricing(search);
      expect(screen.queryByText(/Founder Lifetime/i)).toBeNull();
      expect(screen.queryByText(/\$129/)).toBeNull();
      expect(screen.queryByTestId("pricing-card-founder")).toBeNull();
      view.unmount();
    }
  });

  it("sends /billing/founder-lifetime to /pricing with no plan preselect", () => {
    expect(buildLegacyBillingRedirect({ planSlug: "founder-lifetime" })).toBe("/pricing");
    expect(buildLegacyBillingRedirect({ planSlug: "founder_lifetime" })).toBe("/pricing");
  });

  it("sends /founder to /pricing", () => {
    const route = readFileSync(resolve(__dirname, "../routes/founder.tsx"), "utf8");
    expect(route).toContain('to="/pricing"');
  });

  it("the post-checkout page does not mount a Founder note", () => {
    const page = readFileSync(resolve(ROOT, "src/pages/CheckoutSuccess.tsx"), "utf8");
    expect(page).not.toContain("CheckoutSuccessFounderNote");
    expect(page).not.toMatch(/Founder Lifetime/);
  });

  it("the checkout guard refuses founder_lifetime", () => {
    expect(isFounderLifetimeCheckoutSku("founder_lifetime")).toBe(true);
    expect(isFounderLifetimeCheckoutSku("founder-lifetime")).toBe(true);
    expect(isFounderLifetimeCheckoutSku("pro_monthly")).toBe(false);
  });
});
