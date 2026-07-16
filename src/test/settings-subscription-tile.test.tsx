/**
 * Settings Subscription tile — presenter-only tests.
 *
 * Verifies plan rendering, feature list from PRICING_TIERS, upgrade CTA
 * for Free, and the Manage CTA for paid tiers. Manage mints a one-shot
 * Paddle customer-portal URL via the `paddle-portal-session` edge function
 * ONLY (the edge function is the security boundary) — no Paddle SDK
 * global, no direct billing fetch from the tile, portal opened in a new
 * tab with noopener. Cancel has no client-side control: it lives inside
 * the Paddle portal.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const entitlementMock = vi.hoisted(() => ({
  loading: false as boolean,
  displayPlanId: "free" as string | null,
}));

const portalMock = vi.hoisted(() => ({
  invoke: vi.fn(),
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

// The portal session is minted by the edge function via the supabase
// client; mock the client so the ONLY sanctioned billing path is visible
// to assertions (and the fetch guard below still catches any other call).
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: portalMock.invoke } },
}));

// Ensure no Paddle globals leak in.
beforeEach(() => {
  delete (window as any).Paddle;
  entitlementMock.loading = false;
  entitlementMock.displayPlanId = "free";
  portalMock.invoke.mockReset();
  portalMock.invoke.mockResolvedValue({
    data: { url: "https://customer-portal.paddle.com/session-abc" },
    error: null,
  });
  vi.stubGlobal("open", vi.fn());
  // Guard: fail if anyone calls fetch (would indicate a direct billing API
  // call bypassing the paddle-portal-session edge function).
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

  it("renders paid plan with Manage CTA and portal-based cancel guidance", () => {
    entitlementMock.displayPlanId = "pro_monthly";
    renderPage();
    expect(screen.getByTestId("settings-subscription-plan").textContent).toMatch(/pro/i);
    expect(screen.getByTestId("settings-subscription-manage")).toBeInTheDocument();
    // No client-side cancel control — cancel lives inside the Paddle portal.
    expect(screen.queryByTestId("settings-subscription-cancel")).toBeNull();
    expect(document.body.textContent).toMatch(/Paddle\s+customer portal/i);
    // Features from PRICING_TIERS surface (not hardcoded here).
    const features = screen.getByTestId("settings-subscription-features");
    expect(features.textContent?.toLowerCase()).toContain("cloud sync");
  });

  it("Manage mints a portal URL via the edge function only — no Paddle SDK, no direct fetch", async () => {
    entitlementMock.displayPlanId = "pro_monthly";
    renderPage();
    fireEvent.click(screen.getByTestId("settings-subscription-manage"));
    await waitFor(() =>
      expect(portalMock.invoke).toHaveBeenCalledWith("paddle-portal-session", { body: {} }),
    );
    // One-shot URL opened in a new tab that can never reach back into the app.
    await waitFor(() =>
      expect(window.open).toHaveBeenCalledWith(
        "https://customer-portal.paddle.com/session-abc",
        "_blank",
        "noopener,noreferrer",
      ),
    );
    expect((window as any).Paddle).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("portal failure surfaces a calm error — nothing opens, nothing is written", async () => {
    portalMock.invoke.mockResolvedValue({
      data: null,
      error: { context: { status: 500 } },
    });
    entitlementMock.displayPlanId = "pro_annual";
    renderPage();
    fireEvent.click(screen.getByTestId("settings-subscription-manage"));
    await waitFor(() =>
      expect(screen.getByTestId("settings-subscription-portal-error").textContent).toMatch(
        /couldn't open the billing portal/i,
      ),
    );
    expect(window.open).not.toHaveBeenCalled();
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
    expect(screen.getByTestId("settings-subscription-plan").textContent).toMatch(/unavailable/i);
  });

  it("does not include autopilot / device-control claims", () => {
    entitlementMock.displayPlanId = "pro_monthly";
    renderPage();
    const text = document.body.textContent?.toLowerCase() ?? "";
    expect(text).not.toMatch(/(includes|with|full)\s+autopilot/);
    expect(text).not.toContain("device control included");
  });
});
