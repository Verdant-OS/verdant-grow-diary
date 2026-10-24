/**
 * Existing Founder Lifetime holders keep the Pro Blueprint (#2028,
 * FOUNDER-BLUEPRINT-20261024). The entitlement catalog already grants it;
 * the retained account-display copy must say so, without reopening sales
 * and without inheriting Craft's 300-credit allowance.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { PLAN_CATALOG } from "@/lib/entitlements/planCatalog";
import { PRICING_TIERS, PURCHASABLE_PRICING_TIERS } from "@/config/pricing";

const BLUEPRINT_FEATURE = "Pro Blueprint: live per-stage SOP scoring";

const entitlementMock = vi.hoisted(() => ({ displayPlanId: "founder_lifetime" as string }));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: { displayPlanId: entitlementMock.displayPlanId },
    refetch: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/hooks/usePaddleCancelNotice", () => ({
  usePaddleCancelNotice: () => ({
    visible: false,
    accessUntilIso: null,
    accessUntilLabel: "",
    reason: null,
  }),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "u1", email: "u@example.com" }, signOut: vi.fn() }),
}));

vi.mock("@/components/RewardedReferralCard", () => ({
  default: () => null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

import Settings from "@/pages/Settings";

function founderTier() {
  const tier = PRICING_TIERS.find((t) => t.id === "founder_lifetime");
  if (!tier) throw new Error("founder_lifetime tier missing from PRICING_TIERS");
  return tier;
}

describe("Founder Lifetime retained Blueprint copy", () => {
  beforeEach(() => {
    entitlementMock.displayPlanId = "founder_lifetime";
  });

  it("matches the entitlement catalog: Founder has Blueprint and 100 credits, Pro has no Blueprint", () => {
    expect(PLAN_CATALOG.founder_lifetime.blueprint).toBe(true);
    expect(PLAN_CATALOG.founder_lifetime.aiMonthlyCredits).toBe(100);
    expect(PLAN_CATALOG.pro_monthly.blueprint).toBe(false);
  });

  it("lists Blueprint once in the retained Founder feature list, with no 300-credit claim", () => {
    const features = founderTier().features;
    expect(features.filter((f) => f === BLUEPRINT_FEATURE)).toHaveLength(1);
    expect(features.join(" ")).not.toMatch(/300/);
  });

  it("does not add Blueprint to Pro", () => {
    const pro = PRICING_TIERS.find((t) => t.id === "pro_monthly");
    expect(pro?.features).not.toContain(BLUEPRINT_FEATURE);
  });

  it("keeps Founder Lifetime out of the purchasable tiers", () => {
    expect(PURCHASABLE_PRICING_TIERS.map((t) => t.id)).not.toContain("founder_lifetime");
  });

  it("shows an existing Founder holder the Blueprint once in Settings, with no 300-credit claim", () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>,
    );
    const list = screen.getByTestId("settings-subscription-features");
    expect(list.textContent?.split(BLUEPRINT_FEATURE)).toHaveLength(2);
    expect(list.textContent).not.toMatch(/300/);
  });
});
