/**
 * Router-level proof that `/billing/:plan` redirects to canonical `/pricing`
 * with the correct `?plan=` preselect, safely round-trips `returnTo`, and
 * never auto-opens Paddle. The grower must still click a Pricing CTA.
 *
 * `/pricing` owns `usePaddleCheckout`; `/upgrade` is presenter-only and NOT
 * canonical (see canonical-route ruling).
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import LegacyBillingRedirect from "@/pages/LegacyBillingRedirect";
import { APP_ROUTES } from "@/lib/appRouteManifest";

// ---- Mock usePaddleCheckout so we can prove no auto-open ---------------
const openCheckoutSpy = vi.fn();
vi.mock("@/hooks/usePaddleCheckout", () => ({
  usePaddleCheckout: () => ({
    openCheckout: openCheckoutSpy,
    loading: false,
    blocked: null,
  }),
}));

// usePageSeo touches document — stub it out to keep the test presenter-only.
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));

// Lazy import so the mocks above apply.
import Pricing from "@/pages/Pricing";

function LocationProbe() {
  const loc = useLocation();
  return (
    <div data-testid="probe">
      <span data-testid="probe-pathname">{loc.pathname}</span>
      <span data-testid="probe-search">{loc.search}</span>
      <Pricing />
    </div>
  );
}

function renderAt(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/billing/:plan" element={<LegacyBillingRedirect />} />
        <Route path="/pricing" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  openCheckoutSpy.mockClear();
});

describe("LegacyBillingRedirect — router-level canonical proof", () => {
  it("/billing/pro-monthly → /pricing?plan=pro_monthly with monthly preselected", () => {
    renderAt("/billing/pro-monthly");
    expect(screen.getByTestId("probe-pathname").textContent).toBe("/pricing");
    expect(screen.getByTestId("probe-search").textContent).toBe("?plan=pro_monthly");
    const main = document.querySelector("main");
    expect(main?.getAttribute("data-preselected-plan")).toBe("pro_monthly");
    expect(main?.getAttribute("data-preselected-billing")).toBe("monthly");
    expect(openCheckoutSpy).not.toHaveBeenCalled();
  });

  it("/billing/pro-annual → /pricing?plan=pro_annual with annual preselected", () => {
    renderAt("/billing/pro-annual");
    expect(screen.getByTestId("probe-search").textContent).toBe("?plan=pro_annual");
    const main = document.querySelector("main");
    expect(main?.getAttribute("data-preselected-plan")).toBe("pro_annual");
    expect(main?.getAttribute("data-preselected-billing")).toBe("annual");
    expect(openCheckoutSpy).not.toHaveBeenCalled();
  });

  it("/billing/founder-lifetime → /pricing?plan=founder_lifetime (founder preselected, billing untouched)", () => {
    renderAt("/billing/founder-lifetime");
    expect(screen.getByTestId("probe-search").textContent).toBe(
      "?plan=founder_lifetime",
    );
    const main = document.querySelector("main");
    expect(main?.getAttribute("data-preselected-plan")).toBe("founder_lifetime");
    // Founder is one-time — billing toggle stays at page default (annual).
    expect(main?.getAttribute("data-preselected-billing")).toBe("");
    expect(openCheckoutSpy).not.toHaveBeenCalled();
  });

  it("clicking the preselected Pro Monthly CTA opens Paddle with pro_monthly", () => {
    renderAt("/billing/pro-monthly");
    expect(openCheckoutSpy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("pricing-cta-pro-monthly"));
    expect(openCheckoutSpy).toHaveBeenCalledTimes(1);
    expect(openCheckoutSpy.mock.calls[0][0]).toMatchObject({ priceId: "pro_monthly" });
  });

  it("clicking the preselected Pro Annual CTA opens Paddle with pro_annual", () => {
    renderAt("/billing/pro-annual");
    fireEvent.click(screen.getByTestId("pricing-cta-pro-annual"));
    expect(openCheckoutSpy).toHaveBeenCalledTimes(1);
    expect(openCheckoutSpy.mock.calls[0][0]).toMatchObject({ priceId: "pro_annual" });
  });

  it("clicking the Founder Lifetime CTA opens Paddle with founder_lifetime", () => {
    renderAt("/billing/founder-lifetime");
    fireEvent.click(screen.getByTestId("pricing-cta-founder-lifetime"));
    expect(openCheckoutSpy).toHaveBeenCalledTimes(1);
    expect(openCheckoutSpy.mock.calls[0][0]).toMatchObject({
      priceId: "founder_lifetime",
    });
  });

  it("preserves a safe same-origin returnTo through the redirect", () => {
    renderAt("/billing/pro-monthly?returnTo=/pheno-hunts/new");
    expect(screen.getByTestId("probe-search").textContent).toBe(
      "?plan=pro_monthly&returnTo=%2Fpheno-hunts%2Fnew",
    );
    expect(openCheckoutSpy).not.toHaveBeenCalled();
  });

  it("drops an unsafe external returnTo silently", () => {
    renderAt(
      "/billing/pro-monthly?returnTo=" +
        encodeURIComponent("https://evil.example/steal"),
    );
    expect(screen.getByTestId("probe-search").textContent).toBe("?plan=pro_monthly");
  });

  it("drops javascript: returnTo silently", () => {
    renderAt(
      "/billing/pro-monthly?returnTo=" + encodeURIComponent("javascript:alert(1)"),
    );
    expect(screen.getByTestId("probe-search").textContent).toBe("?plan=pro_monthly");
  });

  it("unknown plan slug lands on bare /pricing (no paid preselect, no auto-open)", () => {
    renderAt("/billing/enterprise");
    expect(screen.getByTestId("probe-pathname").textContent).toBe("/pricing");
    expect(screen.getByTestId("probe-search").textContent).toBe("");
    const main = document.querySelector("main");
    expect(main?.getAttribute("data-preselected-plan")).toBe("");
    expect(openCheckoutSpy).not.toHaveBeenCalled();
  });

  it("Free plan slug lands on bare /pricing (no paid preselect)", () => {
    renderAt("/billing/free");
    expect(screen.getByTestId("probe-search").textContent).toBe("");
    expect(openCheckoutSpy).not.toHaveBeenCalled();
  });
});

// -------- Static router-manifest guarantees ----------------------------

const APP_SRC = readFileSync(resolve(__dirname, "..", "App.tsx"), "utf8");

describe("App.tsx and manifest convergence", () => {
  it("App.tsx has no BillingPlaceholder import or route element", () => {
    expect(APP_SRC).not.toMatch(/BillingPlaceholder/);
  });

  it("App.tsx mounts /billing/:plan only as LegacyBillingRedirect", () => {
    const matches =
      APP_SRC.match(/path="\/billing\/:plan"\s+element=\{<([A-Za-z0-9_]+)/g) ?? [];
    expect(matches.length).toBe(1);
    expect(matches[0]).toContain("LegacyBillingRedirect");
  });

  it("route manifest marks /billing/:plan as a redirect to /pricing", () => {
    const row = APP_ROUTES.find((r) => r.path === "/billing/:plan");
    expect(row).toBeDefined();
    expect(row?.access).toBe("redirect");
    expect(row?.description ?? "").toMatch(/\/pricing/);
    expect(row?.description ?? "").not.toMatch(/\/upgrade/);
  });
});
