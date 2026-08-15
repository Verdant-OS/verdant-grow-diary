import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import { FREE_CAPABILITIES } from "@/lib/entitlements/capabilities";
import { PLAN_CATALOG } from "@/lib/entitlements/planCatalog";

const testState = vi.hoisted(() => ({
  grows: [] as Array<{ id: string; name: string }>,
  tents: [] as Array<{ id: string; name: string }>,
  entitlementLoading: false,
  entitlementLookupFailed: false,
  growsLoading: false,
  growsError: null as string | null,
  tentsLoading: false,
  tentsError: false,
  capabilities: null as unknown,
  insert: vi.fn(),
  setActiveGrowId: vi.fn(),
  refreshGrows: vi.fn(async () => undefined),
  refetchTents: vi.fn(async () => undefined),
  refetchEntitlements: vi.fn(async () => false),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, loading: false }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: testState.grows,
    loading: testState.growsLoading,
    error: testState.growsError,
    activeGrowId: testState.grows[0]?.id ?? null,
    activeGrow: testState.grows[0] ?? null,
    setActiveGrowId: testState.setActiveGrowId,
    refresh: testState.refreshGrows,
  }),
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: testState.tents,
    isLoading: testState.tentsLoading,
    isError: testState.tentsError,
    refetch: testState.refetchTents,
  }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: testState.entitlementLoading,
    lookupFailed: testState.entitlementLookupFailed,
    entitlement: { capabilities: testState.capabilities },
    refetch: testState.refetchEntitlements,
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      insert: (payload: Record<string, unknown>) => {
        testState.insert(table, payload);
        return {
          select: () => ({
            single: async () => {
              if (table === "grows") {
                return { data: { id: "grow-created", name: payload.name }, error: null };
              }
              if (table === "tents") {
                return { data: { id: "tent-created", name: payload.name }, error: null };
              }
              return {
                data: {
                  id: "plant-created",
                  name: payload.name,
                  grow_id: payload.grow_id,
                  tent_id: payload.tent_id,
                },
                error: null,
              };
            },
          }),
        };
      },
    }),
  },
}));

import StartYourRoom from "@/pages/StartYourRoom";

function renderPage() {
  return render(
    <MemoryRouter>
      <StartYourRoom />
    </MemoryRouter>,
  );
}

describe("StartYourRoom entitlement creation gates", () => {
  beforeEach(() => {
    testState.grows = [];
    testState.tents = [];
    testState.entitlementLoading = false;
    testState.entitlementLookupFailed = false;
    testState.growsLoading = false;
    testState.growsError = null;
    testState.tentsLoading = false;
    testState.tentsError = false;
    testState.capabilities = FREE_CAPABILITIES;
    testState.insert.mockReset();
    testState.setActiveGrowId.mockReset();
    testState.refreshGrows.mockClear();
    testState.refetchTents.mockClear();
    testState.refetchEntitlements.mockClear();
  });

  it("does not insert another grow when a Free account already has one active grow", () => {
    testState.grows = [{ id: "grow-existing", name: "Existing Grow" }];
    renderPage();

    fireEvent.change(screen.getByTestId("start-room-grow-name"), {
      target: { value: "Bypass Grow" },
    });

    const submit = screen.getByTestId("start-room-grow-submit");
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(testState.insert).not.toHaveBeenCalled();
  });

  it("does not begin the room when a Free account already has one active tent", () => {
    testState.tents = [{ id: "tent-existing", name: "Existing Tent" }];
    renderPage();

    fireEvent.change(screen.getByTestId("start-room-grow-name"), {
      target: { value: "First Grow" },
    });
    const submit = screen.getByTestId("start-room-grow-submit");
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(testState.insert).not.toHaveBeenCalled();
  });

  it("fails closed before inserts when the entitlement lookup is unavailable", () => {
    testState.entitlementLookupFailed = true;
    renderPage();

    fireEvent.change(screen.getByTestId("start-room-grow-name"), {
      target: { value: "Unverified Grow" },
    });

    expect(screen.getByTestId("start-room-grow-submit")).toBeDisabled();
    expect(testState.insert).not.toHaveBeenCalled();
  });

  it("offers one retry that refreshes plan, grow, and tent verification", async () => {
    testState.entitlementLookupFailed = true;
    testState.refetchEntitlements.mockImplementation(async () => {
      testState.entitlementLookupFailed = false;
      return false;
    });
    renderPage();

    const retry = screen.getByTestId("start-room-creation-retry");
    fireEvent.click(retry);

    await waitFor(() => {
      expect(testState.refetchEntitlements).toHaveBeenCalledTimes(1);
      expect(testState.refreshGrows).toHaveBeenCalledTimes(1);
      expect(testState.refetchTents).toHaveBeenCalledTimes(1);
    });
    fireEvent.change(screen.getByTestId("start-room-grow-name"), {
      target: { value: "Recovered Grow" },
    });
    await waitFor(() => expect(screen.getByTestId("start-room-grow-submit")).toBeEnabled());
    expect(screen.queryByTestId("start-room-creation-retry")).not.toBeInTheDocument();
    expect(testState.insert).not.toHaveBeenCalled();
  });

  it("shows the upgrade path instead of Retry for a verified Free limit", () => {
    testState.grows = [{ id: "grow-existing", name: "Existing Grow" }];
    renderPage();

    expect(screen.getByTestId("start-room-creation-upgrade")).toHaveAttribute("href", "/pricing");
    expect(screen.queryByTestId("start-room-creation-retry")).not.toBeInTheDocument();
  });

  it("preserves unlimited paid grow creation", async () => {
    testState.grows = [{ id: "grow-existing", name: "Existing Grow" }];
    testState.capabilities = PLAN_CATALOG.pro_monthly;
    renderPage();

    fireEvent.change(screen.getByTestId("start-room-grow-name"), {
      target: { value: "Paid Grow" },
    });
    fireEvent.click(screen.getByTestId("start-room-grow-submit"));

    await waitFor(() => {
      expect(testState.insert).toHaveBeenCalledWith(
        "grows",
        expect.objectContaining({ name: "Paid Grow" }),
      );
    });
  });

  it("does not block a verified paid room on a tent-count read failure", async () => {
    testState.capabilities = PLAN_CATALOG.pro_monthly;
    testState.tentsError = true;
    renderPage();

    fireEvent.change(screen.getByTestId("start-room-grow-name"), {
      target: { value: "Paid Grow During Tent Read Outage" },
    });
    fireEvent.click(screen.getByTestId("start-room-grow-submit"));

    await waitFor(() => {
      expect(testState.insert).toHaveBeenCalledWith(
        "grows",
        expect.objectContaining({ name: "Paid Grow During Tent Read Outage" }),
      );
    });
  });
});
