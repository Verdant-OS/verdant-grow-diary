import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import { FREE_CAPABILITIES } from "@/lib/entitlements/capabilities";
import { resolveStartYourRoomResume } from "@/lib/startYourRoomRules";

const testState = vi.hoisted(() => ({
  grows: [] as Array<{ id: string; name: string }>,
  tents: [] as Array<{ id: string; name: string; grow_id?: string }>,
  growsLoading: false,
  tentsLoading: false,
  plantsResult: {
    data: [] as Array<{ id: string; grow_id: string; tent_id: string }>,
    error: null as { message: string } | null,
  },
  plantsThrows: false,
  plantsSelectable: true,
  insert: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(async () => undefined) }),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, loading: false }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: testState.grows,
    loading: testState.growsLoading,
    error: null,
    activeGrowId: testState.grows[0]?.id ?? null,
    activeGrow: testState.grows[0] ?? null,
    setActiveGrowId: vi.fn(),
    refresh: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: testState.tents,
    isLoading: testState.tentsLoading,
    isError: false,
    refetch: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: { capabilities: FREE_CAPABILITIES },
    refetch: vi.fn(async () => false),
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "plants" && testState.plantsSelectable) {
        if (testState.plantsThrows) {
          return {
            select: () => {
              throw new Error("plants unavailable");
            },
          };
        }
        const chain = {
          select: () => chain,
          eq: () => chain,
          then: (
            resolve: (value: {
              data: typeof testState.plantsResult.data;
              error: typeof testState.plantsResult.error;
            }) => void,
          ) => resolve(testState.plantsResult),
        };
        return chain;
      }
      return {
        insert: (payload: Record<string, unknown>) => {
          testState.insert(table, payload);
          return {
            select: () => ({ single: async () => ({ data: null, error: { message: "unused" } }) }),
          };
        },
      };
    },
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

describe("resolveStartYourRoomResume", () => {
  it("returns done ids only for one grow with one linked tent and plant", () => {
    expect(
      resolveStartYourRoomResume({
        grows: [{ id: "g1" }],
        tents: [{ id: "t1", grow_id: "g1" }],
        plants: [{ id: "p1", grow_id: "g1", tent_id: "t1" }],
        activeGrowId: "g1",
      }),
    ).toEqual({ growId: "g1", tentId: "t1", plantId: "p1" });
    expect(
      resolveStartYourRoomResume({
        grows: [{ id: "g1" }],
        tents: [],
        plants: [],
        activeGrowId: "g1",
      }),
    ).toBeNull();
    expect(
      resolveStartYourRoomResume({
        grows: [{ id: "g1" }],
        tents: [{ id: "t1", grow_id: "g1" }],
        plants: null,
        activeGrowId: "g1",
      }),
    ).toBeNull();
  });
});

describe("Start your room resume", () => {
  beforeEach(() => {
    testState.grows = [];
    testState.tents = [];
    testState.growsLoading = false;
    testState.tentsLoading = false;
    testState.plantsResult = { data: [], error: null };
    testState.plantsThrows = false;
    testState.plantsSelectable = true;
    testState.insert.mockReset();
  });

  it("renders done and the plant link when grow, tent and plant exist, with no insert", async () => {
    testState.grows = [{ id: "grow-1", name: "QA Test" }];
    testState.tents = [{ id: "tent-1", name: "QA Test", grow_id: "grow-1" }];
    testState.plantsResult = {
      data: [{ id: "plant-1", grow_id: "grow-1", tent_id: "tent-1" }],
      error: null,
    };
    renderPage();

    expect(await screen.findByTestId("start-your-room-step-done")).toBeInTheDocument();
    expect(screen.getByTestId("start-room-plant-link")).toHaveAttribute(
      "href",
      "/plants/plant-1?open=quick-log",
    );
    expect(screen.queryByTestId("start-room-grow-name")).not.toBeInTheDocument();
    expect(testState.insert).not.toHaveBeenCalled();
  });

  it("stays done after a remount", async () => {
    testState.grows = [{ id: "grow-1", name: "QA Test" }];
    testState.tents = [{ id: "tent-1", name: "QA Test", grow_id: "grow-1" }];
    testState.plantsResult = {
      data: [{ id: "plant-1", grow_id: "grow-1", tent_id: "tent-1" }],
      error: null,
    };
    const view = renderPage();
    expect(await screen.findByTestId("start-your-room-step-done")).toBeInTheDocument();
    view.unmount();
    renderPage();
    expect(await screen.findByTestId("start-your-room-step-done")).toBeInTheDocument();
    expect(testState.insert).not.toHaveBeenCalled();
  });

  it("renders the grow step with submit disabled on Free for a grow only", () => {
    testState.plantsSelectable = false;
    testState.grows = [{ id: "grow-1", name: "Only grow" }];
    renderPage();
    expect(screen.getByTestId("start-your-room-step-grow")).toBeInTheDocument();
    expect(screen.getByTestId("start-room-grow-submit")).toBeDisabled();
  });

  it("renders the grow step with submit disabled on Free for a tent only", () => {
    testState.plantsSelectable = false;
    testState.tents = [{ id: "tent-1", name: "Only tent" }];
    renderPage();
    expect(screen.getByTestId("start-your-room-step-grow")).toBeInTheDocument();
    expect(screen.getByTestId("start-room-grow-submit")).toBeDisabled();
  });

  it("falls back to the grow step when the plants read fails", async () => {
    testState.grows = [{ id: "grow-1", name: "QA Test" }];
    testState.tents = [{ id: "tent-1", name: "QA Test", grow_id: "grow-1" }];
    testState.plantsThrows = true;
    renderPage();
    expect(await screen.findByTestId("start-your-room-step-grow")).toBeInTheDocument();
    expect(screen.queryByTestId("start-your-room-step-done")).not.toBeInTheDocument();
  });

  it("shows the loading state and no empty form while grows are loading", () => {
    testState.plantsSelectable = false;
    testState.growsLoading = true;
    renderPage();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Checking your plan and active room limits…",
    );
    expect(screen.queryByTestId("start-room-grow-name")).not.toBeInTheDocument();
    expect(screen.queryByTestId("start-your-room-step-grow")).not.toBeInTheDocument();
  });
});
