import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const TENT_ID = "30000000-0000-4000-8000-000000000001";
const SECOND_TENT_ID = "30000000-0000-4000-8000-000000000002";

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: { id: "user-1", email: "grower@example.com", email_confirmed_at: "2026-07-01" },
    loading: false,
  }),
}));

vi.mock("@/hooks/useRequireAuth", () => ({
  useRequireAuth: () => ({ status: "authenticated" }),
}));
vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    entitlement: { isActive: true, effectivePlanId: "pro_monthly" },
  }),
}));
vi.mock("@/hooks/useAlertsList", () => ({ useAlertsList: () => ({ alerts: [] }) }));
vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  SidebarTrigger: () => null,
}));
vi.mock("@/components/AppSidebar", () => ({ default: () => null }));
vi.mock("@/components/MobileNav", () => ({ default: () => null }));
vi.mock("@/components/GlobalFastAddButton", () => ({ default: () => null }));
vi.mock("@/components/AuthStatusIndicator", () => ({ default: () => null }));
vi.mock("@/components/SignOutConfirmDialog", () => ({ default: () => null }));
vi.mock("@/components/VerificationPendingBanner", () => ({ default: () => null }));
vi.mock("@/components/SubscriptionPastDueBanner", () => ({
  SubscriptionPastDueBanner: () => null,
}));
vi.mock("@/components/GlobalSearchDialog", () => ({ default: () => null }));
vi.mock("@/components/LegalFooterLinks", () => ({ default: () => null }));
vi.mock("@/components/QuickLog", () => ({
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="legacy-quick-log">Legacy Quick Log</div> : null,
}));
vi.mock("@/components/QuickLogV2Sheet", () => ({
  default: ({ open, defaultTargetKey }: { open: boolean; defaultTargetKey: string | null }) =>
    open ? (
      <div data-testid="scoped-quick-log" data-target-key={defaultTargetKey ?? ""}>
        Scoped Quick Log
      </div>
    ) : null,
}));

import AppShell from "@/components/AppShell";

function TestContent() {
  const location = useLocation();
  return (
    <div>
      <span data-testid="current-path">{location.pathname}</span>
      <span data-testid="current-search">{location.search}</span>
      <Link to="/settings">Leave tent</Link>
      <Link to={`/tents/${SECOND_TENT_ID}`}>Open second tent</Link>
    </div>
  );
}

function renderAt(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route
          path="*"
          element={
            <AppShell>
              <TestContent />
            </AppShell>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AppShell mobile Quick Log routing", () => {
  it("opens tent-scoped V2 logging from a zero-plant Tent Detail route", () => {
    renderAt(`/tents/${TENT_ID}`);

    fireEvent.click(screen.getByTestId("mobile-quick-log-fab"));

    expect(screen.getByTestId("scoped-quick-log")).toHaveAttribute(
      "data-target-key",
      `tent:${TENT_ID}`,
    );
    expect(screen.queryByTestId("legacy-quick-log")).not.toBeInTheDocument();
  });

  it("preserves the existing unscoped Quick Log fallback away from Tent Detail", () => {
    renderAt("/settings");

    fireEvent.click(screen.getByTestId("mobile-quick-log-fab"));

    expect(screen.getByTestId("legacy-quick-log")).toBeInTheDocument();
    expect(screen.queryByTestId("scoped-quick-log")).not.toBeInTheDocument();
  });

  it("honors and consumes the saved Quick Log start-screen intent", async () => {
    renderAt("/dashboard?open=quick-log");

    await waitFor(() => expect(screen.getByTestId("legacy-quick-log")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("current-search").textContent).toBe(""));
    expect(screen.queryByTestId("scoped-quick-log")).not.toBeInTheDocument();
  });

  it("does not open Quick Log for an unrecognized query value", () => {
    renderAt("/dashboard?open=dashboard");
    expect(screen.queryByTestId("legacy-quick-log")).not.toBeInTheDocument();
    expect(screen.getByTestId("current-search")).toHaveTextContent("?open=dashboard");
  });

  it("closes scoped logging when the grower leaves or changes tents", async () => {
    renderAt(`/tents/${TENT_ID}`);
    fireEvent.click(screen.getByTestId("mobile-quick-log-fab"));
    expect(screen.getByTestId("scoped-quick-log")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Leave tent" }));
    await waitFor(() => expect(screen.getByTestId("current-path")).toHaveTextContent("/settings"));
    expect(screen.queryByTestId("scoped-quick-log")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Open second tent" }));
    await waitFor(() =>
      expect(screen.getByTestId("current-path")).toHaveTextContent(`/tents/${SECOND_TENT_ID}`),
    );
    expect(screen.queryByTestId("scoped-quick-log")).not.toBeInTheDocument();
  });
});
