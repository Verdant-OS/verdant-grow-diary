import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildPaywallCtaViewModel,
  paywallCtaFindBannedWords,
  paywallCtaViewModelText,
} from "@/lib/paywallCtaViewModel";
import PaywallCta from "@/components/PaywallCta";
import BillingPlaceholder from "@/pages/BillingPlaceholder";
import { APP_ROUTES } from "@/lib/appRouteManifest";

describe("paywallCtaViewModel — calm defaults", () => {
  it("returns calm default copy with no input", () => {
    const vm = buildPaywallCtaViewModel();
    expect(vm.title).toMatch(/upgrade/i);
    expect(vm.requiredPlanLabel).toBe("Pro");
    expect(vm.primaryCtaLabel).toBeTruthy();
    expect(vm.primaryCtaHref).toBe("/pricing");
    expect(vm.unlockBullets.length).toBeGreaterThanOrEqual(3);
  });

  it("uses featureTitle in the title when provided", () => {
    const vm = buildPaywallCtaViewModel({
      featureTitle: "Advanced timeline filtering",
      requiredPlanLabel: "Pro",
    });
    expect(vm.title).toContain("Advanced timeline filtering");
    expect(vm.title).toContain("Pro");
  });

  it("mentions current plan when different from required", () => {
    const vm = buildPaywallCtaViewModel({
      requiredPlanLabel: "Pro",
      currentPlanLabel: "Free",
    });
    expect(vm.description).toMatch(/Free/);
    expect(vm.currentPlanLabel).toBe("Free");
  });

  it("contains no banned words in the assembled text", () => {
    const vm = buildPaywallCtaViewModel({
      featureTitle: "Sensor snapshot history",
      requiredPlanLabel: "Pro",
      currentPlanLabel: "Free",
      secondaryCopy:
        "This panel describes what upgrading would unlock.",
    });
    const banned = paywallCtaFindBannedWords(paywallCtaViewModelText(vm));
    expect(banned).toEqual([]);
  });

  it("links to the existing pricing route from the manifest", () => {
    const vm = buildPaywallCtaViewModel();
    const pricingPaths = APP_ROUTES.filter((r) => r.path === "/pricing");
    expect(pricingPaths.length).toBe(1);
    expect(vm.primaryCtaHref).toBe("/pricing");
  });

  it("honors override unlockBullets and trims empties", () => {
    const vm = buildPaywallCtaViewModel({
      unlockBullets: ["  More history  ", "", "Backups"],
    });
    expect(vm.unlockBullets).toEqual(["More history", "Backups"]);
  });
});

describe("PaywallCta presenter", () => {
  function renderCta() {
    const vm = buildPaywallCtaViewModel({
      featureTitle: "Full Action Queue",
      requiredPlanLabel: "Pro",
      currentPlanLabel: "Free",
    });
    return render(
      <MemoryRouter>
        <PaywallCta vm={vm} />
      </MemoryRouter>,
    );
  }

  it("renders a heading, bullets, and a pricing link", () => {
    renderCta();
    const root = screen.getByTestId("paywall-cta");
    const bullets = within(root).getByTestId("paywall-cta-bullets");
    expect(bullets.querySelectorAll("li").length).toBeGreaterThanOrEqual(3);
    const link = within(root).getByTestId("paywall-cta-link");
    expect(link.getAttribute("href")).toBe("/pricing");
  });

  it("renders no banned words in DOM text", () => {
    renderCta();
    const text = screen.getByTestId("paywall-cta").textContent ?? "";
    expect(paywallCtaFindBannedWords(text)).toEqual([]);
  });
});

describe("BillingPlaceholder mounts PaywallCta", () => {
  it("renders the paywall CTA panel on the billing route", () => {
    render(
      <MemoryRouter initialEntries={["/billing/pro-monthly"]}>
        <BillingPlaceholder />
      </MemoryRouter>,
    );
    const panel = screen.getByTestId("billing-paywall-cta");
    expect(panel).toBeTruthy();
    const link = within(panel).getByTestId("billing-paywall-cta-link");
    expect(link.getAttribute("href")).toBe("/pricing");
    expect(paywallCtaFindBannedWords(panel.textContent ?? "")).toEqual([]);
  });
});

describe("PaywallCta source — no payment/checkout imports", () => {
  it("PaywallCta.tsx imports no payment or checkout modules", () => {
    const src = readFileSync(
      resolve(__dirname, "../components/PaywallCta.tsx"),
      "utf8",
    );
    const imports = src.match(/^\s*import[^\n]+from\s+["'][^"']+["']/gm) ?? [];
    const joined = imports.join("\n");
    expect(joined).not.toMatch(/paddle/i);
    expect(joined).not.toMatch(/stripe/i);
    expect(joined).not.toMatch(/checkout/i);
    expect(joined).not.toMatch(/@\/integrations\/supabase/);
  });

  it("paywallCtaViewModel.ts imports no React or payment modules", () => {
    const src = readFileSync(
      resolve(__dirname, "../lib/paywallCtaViewModel.ts"),
      "utf8",
    );
    const imports = src.match(/^\s*import[^\n]+from\s+["'][^"']+["']/gm) ?? [];
    const joined = imports.join("\n");
    expect(joined).not.toMatch(/react/i);
    expect(joined).not.toMatch(/paddle/i);
    expect(joined).not.toMatch(/stripe/i);
    expect(joined).not.toMatch(/checkout/i);
  });
});

