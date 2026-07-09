/**
 * Settings Subscription tile — presenter-only tests.
 *
 * Verifies plan rendering, feature list from PRICING_TIERS, upgrade CTA
 * for Free, manage/cancel placeholder for paid tiers, and that no billing
 * API / Paddle call is made.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const entitlementMock = vi.hoisted(() => ({
  loading: false as boolean,
  displayPlanId: "free" as string | null,
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: entitlementMock.loading,
    entitlement: { displayPlanId: entitlementMock.displayPlanId },
  }),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "u1", email: "u@example.com" }, signOut: vi.fn() }),
}));

// Ensure no Paddle globals leak in.
beforeEach(() => {
  delete (window as any).Paddle;
  entitlementMock.loading = false;
  entitlementMock.displayPlanId = "free";
  // Guard: fail if anyone calls fetch (would indicate a billing API call).
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("fetch should not be called from Settings subscription tile");
    }),
  );
});

import Settings from "@/pages/Settings";

function renderPage() {
  return render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>,
  );
}

describe("Settings — Subscription tile", () => {
  it("renders Free plan and Upgrade CTA", () => {
    entitlementMock.displayPlanId = "free";
    renderPage();
    expect(screen.getByTestId("settings-subscription-plan").textContent).toMatch(/free/i);
    expect(screen.getByTestId("settings-subscription-upgrade")).toBeInTheDocument();
    expect(screen.queryByTestId("settings-subscription-manage")).toBeNull();
  });

  it("renders paid plan with manage + cancel placeholders", () => {
    entitlementMock.displayPlanId = "pro_monthly";
    renderPage();
    expect(screen.getByTestId("settings-subscription-plan").textContent).toMatch(/pro/i);
    expect(screen.getByTestId("settings-subscription-manage")).toBeInTheDocument();
    expect(screen.getByTestId("settings-subscription-cancel")).toBeInTheDocument();
    // Features from PRICING_TIERS surface (not hardcoded here).
    const features = screen.getByTestId("settings-subscription-features");
    expect(features.textContent?.toLowerCase()).toContain("cloud sync");
  });

  it("Manage placeholder opens informational dialog, does not call Paddle or fetch", () => {
    entitlementMock.displayPlanId = "pro_monthly";
    renderPage();
    fireEvent.click(screen.getByTestId("settings-subscription-manage"));
    const dialog = screen.getByTestId("settings-subscription-dialog");
    expect(dialog.textContent).toMatch(/coming soon/i);
    expect((window as any).Paddle).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("Cancel placeholder does not actually cancel or write account status", () => {
    entitlementMock.displayPlanId = "pro_annual";
    renderPage();
    fireEvent.click(screen.getByTestId("settings-subscription-cancel"));
    expect(screen.getByTestId("settings-subscription-dialog").textContent).toMatch(
      /coming soon|contact support/i,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("Loading/unknown state renders safely", () => {
    entitlementMock.loading = true;
    renderPage();
    expect(screen.getByTestId("settings-subscription-plan").textContent).toMatch(/loading/i);
  });

  it("Unknown plan (no tier match) shows 'Plan status unavailable'", () => {
    entitlementMock.displayPlanId = "some_unknown_plan";
    renderPage();
    expect(screen.getByTestId("settings-subscription-plan").textContent).toMatch(
      /unavailable/i,
    );
  });

  it("does not include autopilot / device-control claims", () => {
    entitlementMock.displayPlanId = "pro_monthly";
    renderPage();
    const text = document.body.textContent?.toLowerCase() ?? "";
    expect(text).not.toMatch(/(includes|with|full)\s+autopilot/);
    expect(text).not.toContain("device control included");
  });
});
