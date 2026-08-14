/**
 * #564 — PhenoTrackerUpgradeGate must keep entitled children mounted when
 * useMyEntitlements reports loading while entitlement already allows access.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import PhenoTrackerUpgradeGate from "@/components/PhenoTrackerUpgradeGate";
import { resolveEntitlements } from "@/lib/entitlements";

const entitlementsMock = vi.fn();
vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => entitlementsMock(),
}));

const PRO = resolveEntitlements(
  {
    id: "r",
    user_id: "u",
    plan_id: "pro_monthly",
    status: "active",
    provider: "paddle",
    provider_customer_id: null,
    provider_subscription_id: null,
    current_period_end: "2027-01-01Z",
    cancel_at_period_end: false,
    founder_number: null,
    created_at: "",
    updated_at: "",
  },
  new Date("2026-08-01Z"),
);
const FREE = resolveEntitlements(null, new Date("2026-08-01Z"));

describe("PhenoTrackerUpgradeGate soft revalidate (#564)", () => {
  beforeEach(() => {
    cleanup();
    entitlementsMock.mockReset();
  });

  it("keeps children mounted when loading=true but entitlement is already Pro", () => {
    entitlementsMock.mockReturnValue({
      loading: true,
      lookupFailed: false,
      entitlement: PRO,
      refetch: vi.fn(),
    });
    render(
      <MemoryRouter>
        <PhenoTrackerUpgradeGate>
          <div data-testid="wizard-child">wizard stays</div>
        </PhenoTrackerUpgradeGate>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("wizard-child")).toBeInTheDocument();
    expect(screen.queryByTestId("pheno-tracker-upgrade-gate-loading")).toBeNull();
  });

  it("shows loading shell on first paint when Free + loading", () => {
    entitlementsMock.mockReturnValue({
      loading: true,
      lookupFailed: false,
      entitlement: FREE,
      refetch: vi.fn(),
    });
    render(
      <MemoryRouter>
        <PhenoTrackerUpgradeGate>
          <div data-testid="wizard-child">wizard</div>
        </PhenoTrackerUpgradeGate>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("pheno-tracker-upgrade-gate-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("wizard-child")).toBeNull();
  });
});
