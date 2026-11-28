/**
 * QA pass 2026-11-19, B1: Start your room opened Quick Log on Plant Detail and
 * the new grower never reached the dashboard. The first close of that Quick
 * Log (saved or dismissed) now lands on "/".
 */
import { type ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "@/lib/react-router-compat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  START_ROOM_DASHBOARD_HANDOFF_KEY,
  START_ROOM_DASHBOARD_HREF,
  markStartRoomDashboardHandoff,
  startRoomHandoffMemory,
  takeStartRoomDashboardHandoff,
  type HandoffStorage,
} from "@/lib/startRoomDashboardHandoff";

const PLANT_ID = "40000000-0000-4000-8000-000000000001";
const OTHER_PLANT_ID = "40000000-0000-4000-8000-000000000002";

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
    entitlement: { isActive: false, effectivePlanId: "free" },
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
vi.mock("@/components/QuickLogV2Sheet", () => ({
  default: ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) =>
    open ? (
      <div data-testid="quick-log-v2-sheet">
        <label>
          Note (optional)
          <textarea aria-label="Note (optional)" />
        </label>
        <button type="button" onClick={() => onOpenChange(false)}>
          Save
        </button>
        <button type="button" onClick={() => onOpenChange(false)}>
          Dismiss
        </button>
      </div>
    ) : null,
}));
vi.mock("@/components/QuickLog", () => ({
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="legacy-quick-log">legacy</div> : null,
}));

import AppShell from "@/components/AppShell";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";

function CurrentPath() {
  const location = useLocation();
  return <span data-testid="current-path">{location.pathname}</span>;
}

function renderAt(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route
          path="*"
          element={
            <AppShell>
              <CurrentPath />
            </AppShell>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

function memoryStorage(): HandoffStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

describe("start room dashboard hand-off marker", () => {
  it("is taken once for the plant it names", () => {
    const storage = memoryStorage();
    expect(markStartRoomDashboardHandoff(storage, PLANT_ID)).toBe(true);
    expect(takeStartRoomDashboardHandoff(storage, PLANT_ID)).toBe(true);
    expect(storage.data.has(START_ROOM_DASHBOARD_HANDOFF_KEY)).toBe(false);
    expect(takeStartRoomDashboardHandoff(storage, PLANT_ID)).toBe(false);
  });

  it("is cleared without handing off when another plant's Quick Log opens", () => {
    const storage = memoryStorage();
    markStartRoomDashboardHandoff(storage, PLANT_ID);
    expect(takeStartRoomDashboardHandoff(storage, OTHER_PLANT_ID)).toBe(false);
    expect(storage.data.has(START_ROOM_DASHBOARD_HANDOFF_KEY)).toBe(false);
  });

  it("refuses invalid ids and missing storage", () => {
    const storage = memoryStorage();
    expect(markStartRoomDashboardHandoff(storage, "../evil")).toBe(false);
    expect(markStartRoomDashboardHandoff(storage, null)).toBe(false);
    expect(markStartRoomDashboardHandoff(null, PLANT_ID)).toBe(false);
    expect(takeStartRoomDashboardHandoff(null, PLANT_ID)).toBe(false);
    storage.setItem(START_ROOM_DASHBOARD_HANDOFF_KEY, "not a plant id");
    expect(takeStartRoomDashboardHandoff(storage, "not a plant id")).toBe(false);
  });

  it("never hands off when the marker cannot be removed", () => {
    const storage = memoryStorage();
    markStartRoomDashboardHandoff(storage, PLANT_ID);
    const stuck: HandoffStorage = {
      ...storage,
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(takeStartRoomDashboardHandoff(stuck, PLANT_ID)).toBe(false);
  });

  it("lands on the signed-in dashboard route", () => {
    expect(START_ROOM_DASHBOARD_HREF).toBe("/");
  });
});

describe("AppShell after the first onboarding Quick Log", () => {
  beforeEach(() => {
    startRoomHandoffMemory.removeItem(START_ROOM_DASHBOARD_HANDOFF_KEY);
  });
  afterEach(() => {
    startRoomHandoffMemory.removeItem(START_ROOM_DASHBOARD_HANDOFF_KEY);
    expect(window.sessionStorage.getItem(START_ROOM_DASHBOARD_HANDOFF_KEY)).toBeNull();
  });

  it.each(["Save", "Dismiss"])("lands on the dashboard after %s", async (closeLabel) => {
    startRoomHandoffMemory.setItem(START_ROOM_DASHBOARD_HANDOFF_KEY, PLANT_ID);
    renderAt(`/plants/${PLANT_ID}?open=quick-log`);

    await screen.findByTestId("quick-log-v2-sheet");
    expect(screen.getAllByLabelText("Note (optional)")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Save" })).toHaveLength(1);
    expect(screen.queryByText("Short note")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save log" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("legacy-quick-log")).not.toBeInTheDocument();
    expect(startRoomHandoffMemory.getItem(START_ROOM_DASHBOARD_HANDOFF_KEY)).toBeNull();
    expect(screen.getByTestId("current-path")).toHaveTextContent(`/plants/${PLANT_ID}`);

    fireEvent.click(screen.getByRole("button", { name: closeLabel }));

    await waitFor(() => expect(screen.getByTestId("current-path")).toHaveTextContent(/^\/$/));
    expect(screen.queryByTestId("quick-log-v2-sheet")).not.toBeInTheDocument();
  });

  it("stays on Plant Detail without the hand-off marker", async () => {
    renderAt(`/plants/${PLANT_ID}?open=quick-log`);

    await screen.findByTestId("quick-log-v2-sheet");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByTestId("quick-log-v2-sheet")).not.toBeInTheDocument());
    expect(screen.getByTestId("current-path")).toHaveTextContent(`/plants/${PLANT_ID}`);
  });

  it("stays when the marker names a different plant", async () => {
    startRoomHandoffMemory.setItem(START_ROOM_DASHBOARD_HANDOFF_KEY, OTHER_PLANT_ID);
    renderAt(`/plants/${PLANT_ID}?open=quick-log`);

    await screen.findByTestId("quick-log-v2-sheet");
    expect(startRoomHandoffMemory.getItem(START_ROOM_DASHBOARD_HANDOFF_KEY)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    await waitFor(() => expect(screen.queryByTestId("quick-log-v2-sheet")).not.toBeInTheDocument());
    expect(screen.getByTestId("current-path")).toHaveTextContent(`/plants/${PLANT_ID}`);
  });

  it("hands off only once: a later Quick Log on the dashboard stays put", async () => {
    startRoomHandoffMemory.setItem(START_ROOM_DASHBOARD_HANDOFF_KEY, PLANT_ID);
    renderAt(`/plants/${PLANT_ID}?open=quick-log`);
    await screen.findByTestId("quick-log-v2-sheet");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByTestId("current-path")).toHaveTextContent(/^\/$/));

    act(() => {
      window.dispatchEvent(
        new CustomEvent(PLANT_QUICKLOG_PREFILL_EVENT, { detail: { plantId: PLANT_ID } }),
      );
    });
    await screen.findByTestId("quick-log-v2-sheet");
    expect(screen.getAllByLabelText("Note (optional)")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Save" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    await waitFor(() => expect(screen.queryByTestId("quick-log-v2-sheet")).not.toBeInTheDocument());
    expect(screen.getByTestId("current-path")).toHaveTextContent(/^\/$/);
  });
});
