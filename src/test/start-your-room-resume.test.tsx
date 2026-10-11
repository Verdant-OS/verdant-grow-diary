import { fireEvent, render, screen } from "@testing-library/react";
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
    data: [] as Array<{ id: string; name?: string; grow_id: string; tent_id: string }>,
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
            select: () => ({
              single: async () => ({
                data: {
                  id: payload.id,
                  name: payload.name,
                  user_id: payload.user_id,
                  grow_id: payload.grow_id,
                  tent_id: payload.tent_id,
                },
                error: null,
              }),
            }),
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
    ).toEqual({
      step: "done",
      growId: "g1",
      growName: "",
      tentId: "t1",
      tentName: "",
      plantId: "p1",
      plantName: "",
    });
    expect(
      resolveStartYourRoomResume({
        grows: [{ id: "g1", name: "QA Mid" }],
        tents: [],
        plants: [],
        activeGrowId: "g1",
      }),
    ).toMatchObject({ step: "tent", growId: "g1", growName: "QA Mid" });
    expect(
      resolveStartYourRoomResume({
        grows: [{ id: "g1", name: "QA Mid" }],
        tents: [{ id: "t1", grow_id: "g1", name: "Tent" }],
        plants: [],
        activeGrowId: "g1",
      }),
    ).toMatchObject({ step: "plant", growId: "g1", tentId: "t1" });
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
    testState.tents = [{ id: "tent-1", name: "QA Tent", grow_id: "grow-1" }];
    testState.plantsResult = {
      data: [{ id: "plant-1", name: "QA Plant", grow_id: "grow-1", tent_id: "tent-1" }],
      error: null,
    };
    renderPage();

    expect(await screen.findByTestId("start-your-room-step-done")).toBeInTheDocument();
    expect(screen.getByText("Grow: QA Test")).toBeInTheDocument();
    expect(screen.getByText("Tent: QA Tent")).toBeInTheDocument();
    expect(screen.getByText("Plant: QA Plant")).toBeInTheDocument();
    expect(screen.getByTestId("start-room-finish")).toBeEnabled();
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

  it("opens the tent step bound to QA Mid after a remount when only that grow exists", async () => {
    testState.grows = [{ id: "grow-mid", name: "QA Mid" }];
    testState.plantsResult = { data: [], error: null };
    const view = renderPage();
    expect(await screen.findByTestId("start-your-room-step-tent")).toBeInTheDocument();
    expect(screen.getByTestId("start-room-bound-grow")).toHaveTextContent("Bound to grow: QA Mid");
    expect(screen.queryByTestId("start-room-grow-submit")).not.toBeInTheDocument();
    view.unmount();
    renderPage();
    expect(await screen.findByTestId("start-your-room-step-tent")).toBeInTheDocument();
    expect(screen.getByTestId("start-room-bound-grow")).toHaveTextContent("Bound to grow: QA Mid");
    expect(testState.insert).not.toHaveBeenCalled();
  });

  it("opens the plant step when a grow and tent exist and no plant does", async () => {
    testState.grows = [{ id: "grow-1", name: "QA Mid" }];
    testState.tents = [{ id: "tent-1", name: "QA Tent", grow_id: "grow-1" }];
    testState.plantsResult = { data: [], error: null };
    renderPage();
    expect(await screen.findByTestId("start-your-room-step-plant")).toBeInTheDocument();
    expect(screen.getByText(/Bound to grow \+ tent:/)).toHaveTextContent("QA Mid · QA Tent");
    expect(screen.queryByTestId("start-room-grow-name")).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId("start-room-plant-name"), {
      target: { value: "QA Plant" },
    });
    expect(screen.getByTestId("start-room-plant-submit")).toBeEnabled();
    expect(testState.insert).not.toHaveBeenCalled();
  });

  it("keeps the resumed grow and tent names after a tent is created", async () => {
    testState.grows = [{ id: "grow-mid", name: "QA Mid" }];
    testState.plantsResult = { data: [], error: null };
    renderPage();
    expect(await screen.findByTestId("start-your-room-step-tent")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("start-room-tent-name"), {
      target: { value: "Bound Tent" },
    });
    fireEvent.click(screen.getByTestId("start-room-tent-submit"));
    expect(await screen.findByTestId("start-your-room-step-plant")).toBeInTheDocument();
    expect(screen.getByText(/Bound to grow \+ tent:/)).toHaveTextContent("QA Mid · Bound Tent");
    fireEvent.change(screen.getByTestId("start-room-plant-name"), {
      target: { value: "QA Plant" },
    });
    expect(screen.getByTestId("start-room-plant-submit")).toBeEnabled();
    expect(testState.insert).toHaveBeenCalledWith(
      "tents",
      expect.objectContaining({ grow_id: "grow-mid", name: "Bound Tent" }),
    );
    expect(testState.insert).not.toHaveBeenCalledWith("grows", expect.anything());
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
    fireEvent.change(screen.getByTestId("start-room-grow-name"), {
      target: { value: "Second Grow" },
    });
    expect(screen.getByTestId("start-room-grow-submit")).toBeDisabled();
    fireEvent.click(screen.getByTestId("start-room-grow-submit"));
    expect(testState.insert).not.toHaveBeenCalledWith("grows", expect.anything());
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
