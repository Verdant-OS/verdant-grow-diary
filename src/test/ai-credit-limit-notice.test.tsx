import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AiCreditLimitNotice from "@/components/AiCreditLimitNotice";
import type { AiCreditDenial } from "@/lib/aiCreditLimitNoticeViewModel";
import { paywallCtaFindBannedWords } from "@/lib/paywallCtaViewModel";

const entitlementLookup = vi.hoisted(() => ({ failed: false }));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: entitlementLookup.failed,
    entitlement: {
      displayPlanId: "free",
      effectivePlanId: "free",
      status: "active",
      isActive: true,
      capabilities: {},
      degraded: false,
      degradedReason: "null_row_free",
      source: "free",
    },
    refetch: async () => undefined,
  }),
}));

const denial = (plan_id: string | null): AiCreditDenial => ({
  ok: false,
  status: "denied",
  reason: "limit_reached",
  scope: plan_id === "free" ? "per_grow" : "per_month",
  scope_used: 100,
  scope_limit: 100,
  remaining: 0,
  plan_id,
});

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("AiCreditLimitNotice presenter", () => {
  beforeEach(() => {
    entitlementLookup.failed = false;
  });

  it("upsell branch (free) shows paywall CTA link to /pricing", () => {
    renderWithRouter(<AiCreditLimitNotice credit={denial("free")} />);
    expect(screen.getByTestId("ai-credit-limit-notice")).toHaveAttribute("data-kind", "upsell");
    const link = screen.getByTestId("ai-credit-limit-notice-paywall-link");
    expect(link).toHaveAttribute("href", "/pricing");
  });

  it("preserves a safe return target through the pricing CTA", () => {
    renderWithRouter(<AiCreditLimitNotice credit={denial("free")} returnTo="/plants/plant-123" />);
    expect(screen.getByTestId("ai-credit-limit-notice-paywall-link")).toHaveAttribute(
      "href",
      "/pricing?returnTo=%2Fplants%2Fplant-123",
    );
  });

  it("drops an unsafe return target instead of creating an external CTA", () => {
    renderWithRouter(
      <AiCreditLimitNotice credit={denial("free")} returnTo="https://not-verdant.example/phish" />,
    );
    expect(screen.getByTestId("ai-credit-limit-notice-paywall-link")).toHaveAttribute(
      "href",
      "/pricing",
    );
  });

  it("wait branch (pro_monthly) renders NO CTA link", () => {
    renderWithRouter(<AiCreditLimitNotice credit={denial("pro_monthly")} />);
    expect(screen.getByTestId("ai-credit-limit-notice")).toHaveAttribute("data-kind", "wait");
    expect(screen.queryByTestId("ai-credit-limit-notice-paywall-link")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("wait branch (founder_lifetime) renders NO CTA link", () => {
    renderWithRouter(<AiCreditLimitNotice credit={denial("founder_lifetime")} />);
    expect(screen.queryByTestId("ai-credit-limit-notice-paywall-link")).toBeNull();
  });

  it("unknown branch (null plan_id) renders NO CTA link", () => {
    renderWithRouter(<AiCreditLimitNotice credit={denial(null)} />);
    expect(screen.getByTestId("ai-credit-limit-notice")).toHaveAttribute("data-kind", "unknown");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("does not show an upsell when the defensive viewer plan check failed", () => {
    entitlementLookup.failed = true;
    renderWithRouter(<AiCreditLimitNotice credit={denial("free")} />);

    expect(screen.getByTestId("ai-credit-limit-notice")).toHaveAttribute(
      "data-kind",
      "unknown",
    );
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("rendered DOM text contains no banned words", () => {
    for (const plan of ["free", "pro_monthly", "founder_lifetime", null]) {
      const { unmount } = renderWithRouter(
        <AiCreditLimitNotice credit={denial(plan as string | null)} />,
      );
      const text = screen.getByTestId("ai-credit-limit-notice").textContent ?? "";
      expect(paywallCtaFindBannedWords(text)).toEqual([]);
      unmount();
    }
  });

  it("source has no supabase/payment SDK imports (deny-list)", () => {
    const src = readFileSync(resolve(__dirname, "../components/AiCreditLimitNotice.tsx"), "utf8");
    expect(src).not.toMatch(/@\/integrations\/supabase/);
    expect(src).not.toMatch(/paddle|stripe/i);
    const vmSrc = readFileSync(
      resolve(__dirname, "../lib/aiCreditLimitNoticeViewModel.ts"),
      "utf8",
    );
    expect(vmSrc).not.toMatch(/@\/integrations\/supabase/);
    expect(vmSrc).not.toMatch(/paddle|stripe/i);
    expect(vmSrc).not.toMatch(/\bfetch\b/);
  });
});
