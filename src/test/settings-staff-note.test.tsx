/**
 * Settings · Subscription tile — staff note visibility.
 *
 * Regression fence: the "Internal staff — Pro capabilities, 10,000 AI
 * credits/month." note MUST render only when entitlement.isStaff === true.
 * Non-staff users (free or paid Pro) must not see it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Settings from "@/pages/Settings";
import { FREE_CAPABILITIES } from "@/lib/entitlements/capabilities";
import { PLAN_CATALOG } from "@/lib/entitlements/planCatalog";
import type { ResolvedEntitlement } from "@/lib/entitlements/types";
import { clearLocalStorageForTest } from "./helpers/localStorageTestHelper";

const entitlementState: { value: ResolvedEntitlement; loading: boolean } = {
  loading: false,
  value: {
    effectivePlanId: "free",
    displayPlanId: "free",
    status: "active",
    isActive: true,
    capabilities: FREE_CAPABILITIES,
    degraded: false,
    degradedReason: "null_row_free",
    isStaff: false,
  },
};

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: entitlementState.loading,
    entitlement: entitlementState.value,
  }),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: { id: "user-test-1", email: "tester@example.com" },
    loading: false,
    session: { user: { id: "user-test-1" } },
    signOut: async () => undefined,
  }),
}));

const staffEntitlement: ResolvedEntitlement = {
  effectivePlanId: "pro_monthly",
  displayPlanId: "pro_monthly",
  status: "active",
  isActive: true,
  capabilities: PLAN_CATALOG.pro_monthly,
  degraded: false,
  degradedReason: null,
  isStaff: true,
};

const paidProEntitlement: ResolvedEntitlement = {
  effectivePlanId: "pro_monthly",
  displayPlanId: "pro_monthly",
  status: "active",
  isActive: true,
  capabilities: PLAN_CATALOG.pro_monthly,
  degraded: false,
  degradedReason: null,
  isStaff: false,
};

const freeEntitlement: ResolvedEntitlement = {
  effectivePlanId: "free",
  displayPlanId: "free",
  status: "active",
  isActive: true,
  capabilities: FREE_CAPABILITIES,
  degraded: false,
  degradedReason: "null_row_free",
  isStaff: false,
};

beforeEach(() => {
  try {
    clearLocalStorageForTest();
  } catch {
    /* ignore */
  }
  entitlementState.loading = false;
  entitlementState.value = freeEntitlement;
});

describe("Settings · Subscription staff note", () => {
  it("hides staff note for non-staff free user", () => {
    entitlementState.value = freeEntitlement;
    render(<MemoryRouter><Settings /></MemoryRouter>);
    expect(
      screen.queryByTestId("settings-subscription-staff-note"),
    ).not.toBeInTheDocument();
  });

  it("hides staff note for non-staff paid Pro user", () => {
    entitlementState.value = paidProEntitlement;
    render(<MemoryRouter><Settings /></MemoryRouter>);
    expect(
      screen.queryByTestId("settings-subscription-staff-note"),
    ).not.toBeInTheDocument();
  });

  it("shows staff note only when entitlement.isStaff === true", () => {
    entitlementState.value = staffEntitlement;
    render(<MemoryRouter><Settings /></MemoryRouter>);
    const note = screen.getByTestId("settings-subscription-staff-note");
    expect(note).toBeInTheDocument();
    expect(note).toHaveTextContent(
      /internal staff.*pro capabilities.*10,000 ai credits\/month/i,
    );
  });
});
