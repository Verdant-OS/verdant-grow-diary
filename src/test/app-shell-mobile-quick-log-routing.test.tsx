import type { ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  default: ({
    open,
    defaultTargetKey,
    defaultAction,
    onOpenChange,
  }: {
    open: boolean;
    defaultTargetKey: string | null;
    defaultAction?: string;
    onOpenChange: (open: boolean) => void;
  }) => (
    <>
      <output
        data-testid="scoped-quick-log-state"
        data-open={String(open)}
        data-target-key={defaultTargetKey ?? ""}
        data-action={defaultAction ?? "note"}
      />
      {open ? (
        <div
          data-testid="scoped-quick-log"
          data-target-key={defaultTargetKey ?? ""}
          data-action={defaultAction ?? "note"}
        >
          Scoped Quick Log
          <button
            type="button"
            data-testid="close-scoped-quick-log"
            onClick={() => onOpenChange(false)}
          >
            Close scoped Quick Log
          </button>
        </div>
      ) : null}
    </>
  ),
}));

import AppShell from "@/components/AppShell";
import { QUICK_LOG_V2_OPEN_EVENT } from "@/lib/quickLogV2OpenIntent";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";

function TestContent() {
  const location = useLocation();
  return (
    <div>
      <span data-testid="current-path">{location.pathname}</span>
      <span data-testid="current-search">{location.search}</span>
      <Link to="/settings">Leave tent</Link>
      <Link to="/dashboard">Open dashboard</Link>
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

function dispatchRuntimeEvent(event: Event) {
  act(() => {
    window.dispatchEvent(event);
  });
}

describe("AppShell mobile Quick Log routing", () => {
  it("closes legacy Quick Log before opening one global V2 sheet for a valid typed Water intent", async () => {
    renderAt("/settings");
    dispatchRuntimeEvent(
      new CustomEvent(PLANT_QUICKLOG_PREFILL_EVENT, {
        detail: { plantId: "legacy-plant", eventType: "observation" },
      }),
    );
    expect(await screen.findByTestId("legacy-quick-log")).toBeInTheDocument();

    dispatchRuntimeEvent(
      new CustomEvent(QUICK_LOG_V2_OPEN_EVENT, {
        detail: { targetKey: "plant:plant-1", action: "water" },
      }),
    );

    await waitFor(() => expect(screen.queryByTestId("legacy-quick-log")).not.toBeInTheDocument());
    expect(screen.getByTestId("scoped-quick-log")).toHaveAttribute(
      "data-target-key",
      "plant:plant-1",
    );
    expect(screen.getByTestId("scoped-quick-log")).toHaveAttribute("data-action", "water");
  });

  it("ignores invalid typed detail and does not open V2", () => {
    renderAt("/settings");
    dispatchRuntimeEvent(
      new CustomEvent(QUICK_LOG_V2_OPEN_EVENT, {
        detail: { targetKey: "plant:", action: "water" },
      }),
    );
    expect(screen.queryByTestId("scoped-quick-log")).not.toBeInTheDocument();
  });

  it("clears a closed typed target before reopening from the route-scoped mobile FAB", () => {
    renderAt(`/tents/${TENT_ID}`);
    dispatchRuntimeEvent(
      new CustomEvent(QUICK_LOG_V2_OPEN_EVENT, {
        detail: { targetKey: "plant:typed-plant", action: "water" },
      }),
    );
    expect(screen.getByTestId("scoped-quick-log")).toHaveAttribute(
      "data-target-key",
      "plant:typed-plant",
    );
    expect(screen.getByTestId("scoped-quick-log")).toHaveAttribute("data-action", "water");

    fireEvent.click(screen.getByTestId("close-scoped-quick-log"));
    expect(screen.queryByTestId("scoped-quick-log")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("mobile-quick-log-fab"));

    expect(screen.getByTestId("scoped-quick-log")).toHaveAttribute(
      "data-target-key",
      `tent:${TENT_ID}`,
    );
    expect(screen.getByTestId("scoped-quick-log")).toHaveAttribute("data-action", "note");
  });

  it("discards a typed Water intent when navigating between unscoped routes", async () => {
    renderAt("/settings");
    dispatchRuntimeEvent(
      new CustomEvent(QUICK_LOG_V2_OPEN_EVENT, {
        detail: { targetKey: "plant:typed-plant", action: "water" },
      }),
    );
    expect(screen.getByTestId("scoped-quick-log")).toHaveAttribute(
      "data-target-key",
      "plant:typed-plant",
    );
    expect(screen.getByTestId("scoped-quick-log")).toHaveAttribute("data-action", "water");

    fireEvent.click(screen.getByRole("link", { name: "Open dashboard" }));

    await waitFor(() => expect(screen.getByTestId("current-path")).toHaveTextContent("/dashboard"));
    await waitFor(() => expect(screen.queryByTestId("scoped-quick-log")).not.toBeInTheDocument());
    expect(screen.getByTestId("scoped-quick-log-state")).toHaveAttribute("data-open", "false");
    expect(screen.getByTestId("scoped-quick-log-state")).toHaveAttribute("data-target-key", "");
    expect(screen.getByTestId("scoped-quick-log-state")).toHaveAttribute("data-action", "note");

    fireEvent.click(screen.getByTestId("mobile-quick-log-fab"));
    expect(screen.getByTestId("legacy-quick-log")).toBeInTheDocument();
    expect(screen.queryByTestId("scoped-quick-log")).not.toBeInTheDocument();
  });

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
