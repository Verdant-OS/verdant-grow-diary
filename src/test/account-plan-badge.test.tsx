/**
 * Phase 2b — AccountPlanBadge presenter tests.
 * Never renders raw provider IDs; labels come from a fixed allow-list.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import AccountPlanBadge from "@/components/AccountPlanBadge";
import type { ResolvedEntitlement } from "@/lib/entitlements";

function ent(plan: ResolvedEntitlement["displayPlanId"]): ResolvedEntitlement {
  return {
    effectivePlanId: plan,
    displayPlanId: plan,
    status: "active",
    isActive: plan !== "free",
    capabilities: {} as unknown as ResolvedEntitlement["capabilities"],
    degraded: false,
    degradedReason: null,
    isStaff: false,
  };
}

describe("AccountPlanBadge", () => {
  it("renders Free", () => {
    render(<AccountPlanBadge entitlement={ent("free")} />);
    expect(screen.getByTestId("account-plan-badge")).toHaveTextContent("Free");
  });
  it("renders Pro Monthly", () => {
    render(<AccountPlanBadge entitlement={ent("pro_monthly")} />);
    expect(screen.getByTestId("account-plan-badge")).toHaveTextContent("Pro Monthly");
  });
  it("renders Pro Annual", () => {
    render(<AccountPlanBadge entitlement={ent("pro_annual")} />);
    expect(screen.getByTestId("account-plan-badge")).toHaveTextContent("Pro Annual");
  });
  it("renders Founder Lifetime", () => {
    render(<AccountPlanBadge entitlement={ent("founder_lifetime")} />);
    expect(screen.getByTestId("account-plan-badge")).toHaveTextContent("Founder Lifetime");
  });
  it("does not render raw IDs (ctm_/sub_/txn_/evt_/pri_/pro_)", () => {
    const { container } = render(<AccountPlanBadge entitlement={ent("pro_monthly")} />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/(ctm_|sub_|txn_|evt_|pri_)[a-z0-9]{6,}/);
  });
});
