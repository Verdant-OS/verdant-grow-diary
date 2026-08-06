/**
 * QA-LOOP-02 regression: legacy /action-queue URL must redirect to the
 * canonical /actions route so old bookmarks / docs / shared links don't 404.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "@/lib/react-router-compat";
import RouteAliasRedirect from "@/components/RouteAliasRedirect";
import {
  extractMountedAppRoutePaths,
  getRouteAliasRedirectTarget,
  readAllRouteModuleSources,
} from "./helpers/routeManifestSyncHarness";

// Lightweight stand-in for the real Action Queue page to avoid pulling in its
// data hooks. The redirect contract is what we're asserting.
function ActionQueueStub() {
  const location = useLocation();
  return (
    <div data-testid="actions-page">
      Action Queue
      {location.search}
      {location.hash}
    </div>
  );
}

function RedirectHarness({ initial }: { initial: string }) {
  return (
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/actions" element={<ActionQueueStub />} />
        <Route path="/action-queue" element={<RouteAliasRedirect to="/actions" />} />
        <Route path="*" element={<div data-testid="not-found">404</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("QA-LOOP-02 /action-queue legacy redirect", () => {
  it("redirects /action-queue to /actions with focus, alert, and hash intact", () => {
    render(<RedirectHarness initial="/action-queue?focus=aq1&alert=al1#row" />);
    expect(screen.getByTestId("actions-page")).toHaveTextContent(
      "Action Queue?focus=aq1&alert=al1#row",
    );
    expect(screen.queryByTestId("not-found")).not.toBeInTheDocument();
  });

  it("serves /actions directly without redirect", () => {
    render(<RedirectHarness initial="/actions" />);
    expect(screen.getByTestId("actions-page")).toBeInTheDocument();
  });

  it("confirms File routes wire the legacy alias to the scope-preserving redirect", () => {
    expect(extractMountedAppRoutePaths()).toContain("/action-queue");
    expect(getRouteAliasRedirectTarget("/action-queue")).toBe("/actions");
  });
});

describe("QA-LOOP-03 Settings mobile tile layout", () => {
  it("stacks the tile badge under the title on mobile via flex-col", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("src/pages/Settings.tsx", "utf8");
    // Confirms the responsive class that keeps the badge clear of the mobile FAB.
    expect(src).toMatch(/flex-col\s+sm:flex-row/);
  });

  it("renders every settings tile with a badge that is not absolutely positioned", async () => {
    vi.doMock("@/store/auth", () => ({
      useAuth: () => ({ user: { email: "g@example.com" }, signOut: vi.fn() }),
    }));
    vi.doMock("@/hooks/useMyEntitlements", () => ({
      useMyEntitlements: () => ({
        loading: false,
        lookupFailed: false,
        entitlement: { displayPlanId: "free", status: "active", isStaff: false },
        refetch: vi.fn(),
      }),
    }));
    vi.doMock("@/hooks/usePaddleCancelNotice", () => ({
      usePaddleCancelNotice: () => ({
        visible: false,
        accessUntilIso: null,
        accessUntilLabel: "",
        reason: null,
      }),
    }));
    vi.doMock("@/components/RewardedReferralCard", () => ({
      default: () => <div data-testid="rewarded-referral-card-stub">Referral card</div>,
    }));
    const Settings = (await import("@/pages/Settings")).default;
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>,
    );
    // Settings has grown from the original four tiles (Profile,
    // Notifications, Integrations + one preference tile) to six rendered
    // tiles (adds Start screen / Units / Subscription / Agent integrations
    // variants depending on state), plus the Preferences tile added with the
    // account-preferences feature (735edc2a; covered by
    // account-preferences.test.tsx), plus the Delete account tile added with
    // the account-deletion feature (95cac1da6), plus the Referrals share-card
    // tile added with the referral glue (a8459418a), plus Analytics consent
    // from the base-branch consent settings page. The layout contract under
    // test is the badge positioning, not the tile inventory — pin the
    // current count so silent tile additions still surface here deliberately.
    const badges = screen.getAllByTestId("settings-tile-badge");
    expect(badges).toHaveLength(10);
    for (const b of badges) {
      // Badge should be in-flow (no fixed/absolute) so the FAB cannot clip it.
      const cls = b.className;
      expect(cls).not.toMatch(/\babsolute\b/);
      expect(cls).not.toMatch(/\bfixed\b/);
    }
  }, 15_000);
});
