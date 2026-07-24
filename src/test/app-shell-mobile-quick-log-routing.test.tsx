import type { ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
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
  default: ({ open, prefill }: { open: boolean; prefill?: { logged_at?: string | null } | null }) =>
    open ? (
      <div
        data-testid="legacy-quick-log"
        data-logged-at={prefill?.logged_at ?? ""}
      >
        Legacy Quick Log
      </div>
    ) : null,
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
  const navigate = useNavigate();
  return (
    <div>
      <span data-testid="current-path">{location.pathname}</span>
      <span data-testid="current-search">{location.search}</span>
      <span data-testid="current-hash">{location.hash}</span>
      <span data-testid="current-key">{location.key}</span>
      <Link to="/settings">Leave tent</Link>
      <Link to="/dashboard">Open dashboard</Link>
      <Link to={`/tents/${SECOND_TENT_ID}`}>Open second tent</Link>
      <Link to="/daily-check?plantId=plant-b&growId=grow-1">Open plant B</Link>
      <button
        type="button"
        onClick={() =>
          navigate("/daily-check?plantId=plant-c&growId=grow-1", { replace: true })
        }
      >
        Replace with plant C
      </button>
      <button type="button" onClick={() => navigate(-1)}>
        Go back
      </button>
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

  it("discards typed Water across same-path push, replace, and back navigations", async () => {
    renderAt("/daily-check?plantId=plant-a&growId=grow-1");
    const initialKey = screen.getByTestId("current-key").textContent;
    const openWater = (plantId: string) =>
      dispatchRuntimeEvent(
        new CustomEvent(QUICK_LOG_V2_OPEN_EVENT, {
          detail: { targetKey: `plant:${plantId}`, action: "water" },
        }),
      );
    const expectFreshClosedState = async () => {
      await waitFor(() =>
        expect(screen.queryByTestId("scoped-quick-log")).not.toBeInTheDocument(),
      );
      expect(screen.getByTestId("scoped-quick-log-state")).toHaveAttribute(
        "data-open",
        "false",
      );
      expect(screen.getByTestId("scoped-quick-log-state")).toHaveAttribute(
        "data-target-key",
        "",
      );
      expect(screen.getByTestId("scoped-quick-log-state")).toHaveAttribute(
        "data-action",
        "note",
      );
    };

    openWater("plant-a");
    expect(screen.getByTestId("scoped-quick-log")).toHaveAttribute(
      "data-target-key",
      "plant:plant-a",
    );

    fireEvent.click(screen.getByRole("link", { name: "Open plant B" }));
    await waitFor(() =>
      expect(screen.getByTestId("current-search")).toHaveTextContent(
        "?plantId=plant-b&growId=grow-1",
      ),
    );
    expect(screen.getByTestId("current-key").textContent).not.toBe(initialKey);
    await expectFreshClosedState();

    openWater("plant-b");
    expect(screen.getByTestId("scoped-quick-log")).toHaveAttribute(
      "data-target-key",
      "plant:plant-b",
    );
    const plantBKey = screen.getByTestId("current-key").textContent;

    fireEvent.click(screen.getByRole("button", { name: "Replace with plant C" }));
    await waitFor(() =>
      expect(screen.getByTestId("current-search")).toHaveTextContent(
        "?plantId=plant-c&growId=grow-1",
      ),
    );
    expect(screen.getByTestId("current-key").textContent).not.toBe(plantBKey);
    await expectFreshClosedState();

    openWater("plant-c");
    expect(screen.getByTestId("scoped-quick-log")).toHaveAttribute(
      "data-target-key",
      "plant:plant-c",
    );

    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    await waitFor(() =>
      expect(screen.getByTestId("current-search")).toHaveTextContent(
        "?plantId=plant-a&growId=grow-1",
      ),
    );
    expect(screen.getByTestId("current-key").textContent).toBe(initialKey);
    await expectFreshClosedState();
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


describe("AppShell 'Captured' (logged_at) stamping — every legacy launcher", () => {
  it("stamps logged_at = click moment when the dispatcher carried none (dashboard/tray parity)", async () => {
    renderAt("/settings");
    dispatchRuntimeEvent(
      new CustomEvent(PLANT_QUICKLOG_PREFILL_EVENT, {
        detail: { plantId: "plant-x", eventType: "training" },
      }),
    );
    const modal = await screen.findByTestId("legacy-quick-log");
    const stamped = modal.getAttribute("data-logged-at") ?? "";
    expect(stamped).not.toBe("");
    expect(Number.isFinite(Date.parse(stamped))).toBe(true);
  });

  it("preserves a dispatcher-provided logged_at untouched (GlobalSearch / Fast Add path)", async () => {
    renderAt("/settings");
    const SEED = "2026-07-24T06:30:00.000Z";
    dispatchRuntimeEvent(
      new CustomEvent(PLANT_QUICKLOG_PREFILL_EVENT, {
        detail: { plantId: "plant-x", eventType: "training", logged_at: SEED },
      }),
    );
    const modal = await screen.findByTestId("legacy-quick-log");
    expect(modal.getAttribute("data-logged-at")).toBe(SEED);
  });
});
