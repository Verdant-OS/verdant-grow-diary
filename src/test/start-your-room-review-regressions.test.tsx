import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import { FREE_CAPABILITIES } from "@/lib/entitlements/capabilities";
import { PLAN_CATALOG } from "@/lib/entitlements/planCatalog";

type PlantsPayload = {
  data: Array<{ id: string; name?: string; grow_id: string; tent_id: string }>;
  error: { message: string } | null;
};

const testState = vi.hoisted(() => ({
  grows: [] as Array<{ id: string; name: string }>,
  tents: [] as Array<{ id: string; name: string; grow_id?: string }>,
  activeGrowId: null as string | null,
  entitlementLoading: false,
  capabilities: null as unknown,
  plantsMode: "ok" as "ok" | "throw" | "error" | "defer",
  plantsResult: { data: [], error: null } as PlantsPayload,
  pendingPlants: [] as Array<(value: PlantsPayload) => void>,
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
    loading: false,
    error: null,
    activeGrowId: testState.activeGrowId,
    activeGrow: testState.grows.find((grow) => grow.id === testState.activeGrowId) ?? null,
    setActiveGrowId: vi.fn(),
    refresh: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: testState.tents,
    isLoading: false,
    isError: false,
    refetch: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: testState.entitlementLoading,
    lookupFailed: false,
    entitlement: { capabilities: testState.capabilities },
    refetch: vi.fn(async () => false),
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const inserted = (target: string, payload: Record<string, unknown>) => {
        testState.insert(target, payload);
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
      };
      if (table === "plants") {
        if (testState.plantsMode === "throw") {
          return {
            select: () => {
              throw new Error("plants unavailable");
            },
            insert: (payload: Record<string, unknown>) => inserted(table, payload),
          };
        }
        let filters = 0;
        const chain = {
          select: () => chain,
          eq: () => {
            filters += 1;
            if (filters < 2) return chain;
            if (testState.plantsMode === "defer") {
              return new Promise<PlantsPayload>((resolve) => {
                testState.pendingPlants.push(resolve);
              });
            }
            if (testState.plantsMode === "error") {
              return Promise.resolve({ data: null, error: { message: "plants read failed" } });
            }
            return Promise.resolve(testState.plantsResult);
          },
        };
        return {
          ...chain,
          insert: (payload: Record<string, unknown>) => inserted(table, payload),
        };
      }
      return { insert: (payload: Record<string, unknown>) => inserted(table, payload) };
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

describe("Start your room review regressions", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    testState.grows = [];
    testState.tents = [];
    testState.activeGrowId = null;
    testState.entitlementLoading = false;
    testState.capabilities = FREE_CAPABILITIES;
    testState.plantsMode = "ok";
    testState.plantsResult = { data: [], error: null };
    testState.pendingPlants = [];
    testState.insert.mockReset();
  });

  it("recovers a plant read cancelled by the same grow id", async () => {
    testState.grows = [{ id: "grow-1", name: "QA Mid" }];
    testState.activeGrowId = null;
    testState.plantsMode = "defer";
    const view = renderPage();

    await waitFor(() => expect(testState.pendingPlants.length).toBe(1));
    testState.activeGrowId = "grow-1";
    view.rerender(
      <MemoryRouter>
        <StartYourRoom />
      </MemoryRouter>,
    );
    await waitFor(() => expect(testState.pendingPlants.length).toBe(2));
    const latest = testState.pendingPlants[testState.pendingPlants.length - 1];
    latest({ data: [], error: null });

    expect(await screen.findByTestId("start-room-bound-grow")).toHaveTextContent(
      "Bound to grow: QA Mid",
    );
    expect(screen.queryByRole("status")).not.toHaveTextContent(
      "Checking your plan and active room limits…",
    );
  });

  it("waits for entitlement verification before keeping a partial resume", async () => {
    testState.grows = [{ id: "grow-1", name: "QA Mid" }];
    testState.activeGrowId = "grow-1";
    testState.capabilities = PLAN_CATALOG.pro_monthly;
    testState.entitlementLoading = true;
    testState.plantsResult = { data: [], error: null };
    const view = renderPage();

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Checking your plan and active room limits…",
    );
    expect(screen.queryByTestId("start-room-creation-upgrade")).not.toBeInTheDocument();
    expect(screen.queryByTestId("start-room-bound-grow")).not.toBeInTheDocument();

    testState.entitlementLoading = false;
    view.rerender(
      <MemoryRouter>
        <StartYourRoom />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("start-room-grow-name")).toBeInTheDocument();
    expect(screen.queryByTestId("start-room-bound-grow")).not.toBeInTheDocument();
  });

  it("shows the loading copy while plan verification is unresolved", async () => {
    testState.grows = [{ id: "grow-1", name: "QA Mid" }];
    testState.activeGrowId = "grow-1";
    testState.entitlementLoading = true;
    testState.plantsResult = { data: [], error: null };
    renderPage();

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Checking your plan and active room limits…",
    );
    expect(screen.queryByText("See plan options")).not.toBeInTheDocument();
    expect(screen.queryByTestId("start-room-grow-name")).not.toBeInTheDocument();
  });

  it("retries a failed plant read from the plan check", async () => {
    testState.grows = [{ id: "grow-1", name: "QA Mid" }];
    testState.activeGrowId = "grow-1";
    testState.plantsMode = "error";
    const view = renderPage();

    expect(await screen.findByTestId("start-room-creation-retry")).toBeInTheDocument();
    testState.plantsMode = "ok";
    testState.plantsResult = { data: [], error: null };
    fireEvent.click(screen.getByTestId("start-room-creation-retry"));
    view.rerender(
      <MemoryRouter>
        <StartYourRoom />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("start-room-bound-grow")).toHaveTextContent(
      "Bound to grow: QA Mid",
    );
    expect(testState.insert).not.toHaveBeenCalled();
  });

  it("finishes a resumed room with the grow and tent names", async () => {
    testState.grows = [{ id: "grow-1", name: "QA Mid" }];
    testState.tents = [{ id: "tent-1", name: "QA Tent", grow_id: "grow-1" }];
    testState.activeGrowId = "grow-1";
    testState.plantsResult = { data: [], error: null };
    renderPage();

    expect(await screen.findByTestId("start-room-bound-grow")).toHaveTextContent(
      "Bound to grow: QA Mid · tent QA Tent",
    );
    fireEvent.change(screen.getByTestId("start-room-plant-name"), {
      target: { value: "QA Plant" },
    });
    fireEvent.click(screen.getByTestId("start-room-submit"));

    expect(await screen.findByTestId("start-your-room-step-done")).toBeInTheDocument();
    expect(screen.getByText("Grow: QA Mid")).toBeInTheDocument();
    expect(screen.getByText("Tent: QA Tent")).toBeInTheDocument();
    expect(screen.getByText("Plant: QA Plant")).toBeInTheDocument();
    expect(screen.getByTestId("start-room-finish")).toBeEnabled();
    expect(testState.insert).toHaveBeenCalledWith(
      "plants",
      expect.objectContaining({ grow_id: "grow-1", tent_id: "tent-1", name: "QA Plant" }),
    );
  });

  it("blocks a second Free grow when the plants read fails and no tent exists", async () => {
    testState.grows = [{ id: "grow-1", name: "QA Mid" }];
    testState.tents = [];
    testState.activeGrowId = "grow-1";
    testState.plantsMode = "throw";
    renderPage();

    expect(await screen.findByTestId("start-room-grow-name")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("start-room-grow-name"), {
      target: { value: "Bypass Grow" },
    });
    fireEvent.change(screen.getByTestId("start-room-plant-name"), {
      target: { value: "Bypass Plant" },
    });
    const submit = screen.getByTestId("start-room-submit");
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    fireEvent.submit(submit.closest("form")!);
    expect(testState.insert).not.toHaveBeenCalled();
  });
});
