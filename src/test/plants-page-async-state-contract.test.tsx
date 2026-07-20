import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => {
  const makeQuery = <T,>(data: T | undefined) => ({
    data,
    isLoading: false,
    isPending: false,
    isFetching: false,
    isError: false,
    isPlaceholderData: false,
    refetch: vi.fn().mockResolvedValue(undefined),
  });

  const plant = {
    id: "plant-a",
    name: "Scope A Plant",
    strain: "Blue Dream",
    stage: "veg",
    health: "healthy",
    tentId: "tent-a",
    growId: "grow-a",
    isArchived: false,
    photo: null,
    startedAt: null,
    lastNote: "",
  };
  const plantB = {
    ...plant,
    id: "plant-b",
    name: "Scope B Plant",
    tentId: "tent-b",
    growId: "grow-b",
  };

  return {
    makeQuery,
    plant,
    plantB,
    scope: {
      urlGrowId: "grow-a" as string | null,
      scopedGrowName: "Grow A" as string | null,
      isValidScopedGrow: true,
      backHref: "/grows/grow-a",
    },
    growsState: {
      grows: [{ id: "grow-a", name: "Grow A" }],
      loading: false,
      error: null as string | null,
      refresh: vi.fn().mockResolvedValue(undefined),
    },
    queries: {
      active: makeQuery([plant]),
      archivedByGrow: new Map<string, ReturnType<typeof makeQuery>>(),
      workspace: makeQuery([plant]),
      tents: makeQuery([{ id: "tent-a", name: "Tent A" }]),
      diary: makeQuery([]),
      sensors: makeQuery([]),
    },
  };
});

vi.mock("@/hooks/useGrowData", () => ({
  useGrowPlants: (_tentId?: string, growId?: string, options?: { includeArchived?: boolean }) => {
    if (options?.includeArchived) {
      return mocks.queries.archivedByGrow.get(growId ?? "all") ?? mocks.makeQuery(undefined);
    }
    return growId ? mocks.queries.active : mocks.queries.workspace;
  },
  useGrowTents: () => mocks.queries.tents,
  getGrowDataMeta: () => undefined,
}));

vi.mock("@/hooks/use-diary-entries", () => ({
  useDiaryEntries: () => mocks.queries.diary,
}));

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => mocks.queries.sensors,
}));

vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => mocks.scope,
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => mocks.growsState,
}));

vi.mock("@/components/CreatePlantDialog", () => ({
  default: () => <button data-testid="create-plant-dialog">Create plant</button>,
}));
vi.mock("@/components/PlantCardActionsMenu", () => ({ default: () => null }));
vi.mock("@/components/PlantPhoto", () => ({ default: () => null }));
vi.mock("@/components/GrowDataSourceDisclosure", () => ({ default: () => null }));

import Plants from "@/pages/Plants";

function successfulQuery<T>(data: T) {
  return mocks.makeQuery(data);
}

function renderPlants() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/plants?growId=grow-a"]}>
        <Plants />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.scope.urlGrowId = "grow-a";
  mocks.scope.scopedGrowName = "Grow A";
  mocks.scope.isValidScopedGrow = true;
  mocks.scope.backHref = "/grows/grow-a";
  mocks.growsState.grows = [{ id: "grow-a", name: "Grow A" }];
  mocks.growsState.loading = false;
  mocks.growsState.error = null;
  mocks.growsState.refresh = vi.fn().mockResolvedValue(undefined);
  mocks.queries.active = successfulQuery([mocks.plant]);
  mocks.queries.workspace = successfulQuery([mocks.plant]);
  mocks.queries.tents = successfulQuery([{ id: "tent-a", name: "Tent A" }]);
  mocks.queries.diary = successfulQuery([]);
  mocks.queries.sensors = successfulQuery([]);
  mocks.queries.archivedByGrow = new Map([["grow-a", successfulQuery([mocks.plant])]]);
});

describe("Plants page async-state contract", () => {
  it("renders loading before empty while the primary plant query is pending", () => {
    mocks.queries.archivedByGrow.set("grow-a", {
      ...mocks.makeQuery(undefined),
      isLoading: true,
      isPending: true,
      isFetching: true,
    });

    renderPlants();

    expect(screen.getByTestId("plants-loading")).toBeInTheDocument();
    expect(screen.queryByText(/No plants/i)).not.toBeInTheDocument();
  });

  it("renders a primary error with a primary-only retry, never an empty state", () => {
    const failedPrimary = {
      ...mocks.makeQuery(undefined),
      isError: true,
    };
    mocks.queries.archivedByGrow.set("grow-a", failedPrimary);

    renderPlants();

    expect(screen.getByText("Plants unavailable")).toBeInTheDocument();
    expect(screen.queryByText(/No plants/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("plants-retry-primary"));
    expect(failedPrimary.refetch).toHaveBeenCalledTimes(1);
    expect(mocks.queries.active.refetch).not.toHaveBeenCalled();
    expect(mocks.queries.workspace.refetch).not.toHaveBeenCalled();
    expect(mocks.queries.tents.refetch).not.toHaveBeenCalled();
    expect(mocks.queries.diary.refetch).not.toHaveBeenCalled();
    expect(mocks.queries.sensors.refetch).not.toHaveBeenCalled();
  });

  it("renders the empty state only after the primary query succeeds with no rows", () => {
    mocks.queries.active = successfulQuery([]);
    mocks.queries.archivedByGrow.set("grow-a", successfulQuery([]));

    renderPlants();

    expect(screen.queryByTestId("plants-loading")).not.toBeInTheDocument();
    expect(screen.queryByText("Plants unavailable")).not.toBeInTheDocument();
    expect(screen.getByText(/No plants/i)).toBeInTheDocument();
  });

  it("keeps valid plant cards visible and labels failed supplemental sections", () => {
    mocks.queries.tents = { ...mocks.makeQuery(undefined), isError: true };
    mocks.queries.diary = { ...mocks.makeQuery(undefined), isError: true };
    mocks.queries.sensors = { ...mocks.makeQuery(undefined), isError: true };

    renderPlants();

    expect(screen.getByText("Scope A Plant")).toBeInTheDocument();
    expect(screen.getByTestId("plants-limited-data")).toBeInTheDocument();
    expect(screen.getByTestId("plants-supplemental-error-tents")).toHaveTextContent(
      "Tent names and filters",
    );
    expect(screen.getByTestId("plants-supplemental-error-diary")).toHaveTextContent(
      "Daily check notes",
    );
    expect(screen.getByTestId("plants-supplemental-error-sensors")).toHaveTextContent(
      "Manual sensor check status",
    );
    expect(
      screen.getByRole("button", { name: "Retry tent names and filters" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry daily check notes" })).toBeInTheDocument();
  });

  it("keeps cached supplemental data visible and labels only its failed refresh", () => {
    mocks.queries.tents = {
      ...successfulQuery([{ id: "tent-a", name: "Tent A" }]),
      isError: true,
    };

    renderPlants();

    expect(screen.getByText("Scope A Plant")).toBeInTheDocument();
    expect(screen.getAllByText(/Tent A/).length).toBeGreaterThan(0);
    expect(screen.getByTestId("plants-supplemental-stale-tents")).toHaveTextContent(
      "refresh failed; showing last loaded data",
    );
    expect(screen.queryByTestId("plants-supplemental-error-tents")).not.toBeInTheDocument();
  });

  it("keeps cached primary cards visible when only the primary refresh fails", () => {
    const stalePrimary = {
      ...successfulQuery([mocks.plant]),
      isError: true,
    };
    mocks.queries.archivedByGrow.set("grow-a", stalePrimary);

    renderPlants();

    expect(screen.getByText("Scope A Plant")).toBeInTheDocument();
    expect(screen.getByTestId("plants-primary-refresh-error")).toHaveTextContent(
      "Plant list refresh unavailable",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry plant list refresh" }));
    expect(stalePrimary.refetch).toHaveBeenCalledTimes(1);
  });

  it("retries only the selected failed supplemental query", () => {
    const failedTents = { ...mocks.makeQuery(undefined), isError: true };
    mocks.queries.tents = failedTents;

    renderPlants();

    fireEvent.click(screen.getByTestId("plants-retry-tents"));
    expect(failedTents.refetch).toHaveBeenCalledTimes(1);
    expect(mocks.queries.archivedByGrow.get("grow-a")?.refetch).not.toHaveBeenCalled();
    expect(mocks.queries.diary.refetch).not.toHaveBeenCalled();
    expect(mocks.queries.sensors.refetch).not.toHaveBeenCalled();
  });

  it("does not render prior-scope cards while the next scope is placeholder-loading", () => {
    const view = renderPlants();
    expect(screen.getByText("Scope A Plant")).toBeInTheDocument();

    mocks.scope.urlGrowId = "grow-b";
    mocks.scope.scopedGrowName = "Grow B";
    mocks.scope.backHref = "/grows/grow-b";
    mocks.queries.archivedByGrow.set("grow-b", {
      ...successfulQuery([mocks.plant]),
      isFetching: true,
      isPlaceholderData: true,
    });
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/plants?growId=grow-b"]}>
          <Plants />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("plants-loading")).toBeInTheDocument();
    expect(screen.queryByText("Scope A Plant")).not.toBeInTheDocument();
    expect(screen.queryByText(/No plants/i)).not.toBeInTheDocument();
  });

  it("does not consume placeholder tent data after the new primary scope succeeds", () => {
    mocks.queries.archivedByGrow.set("grow-a", successfulQuery([mocks.plant]));
    mocks.queries.tents = {
      ...successfulQuery([{ id: "old-tent", name: "Old Scope Tent" }]),
      isFetching: true,
      isPlaceholderData: true,
    };

    renderPlants();

    expect(screen.getByText("Scope A Plant")).toBeInTheDocument();
    expect(screen.queryByText(/Old Scope Tent/)).not.toBeInTheDocument();
    expect(screen.getByTestId("plants-supplemental-pending-tents")).toHaveTextContent(
      "Tent names and filters still loading",
    );
  });

  it("reconciles an old tent selection before rendering a new grow scope", () => {
    const view = renderPlants();
    fireEvent.click(screen.getByTestId("plants-tent-filter-tent-a"));
    expect(screen.getByText("Scope A Plant")).toBeInTheDocument();

    mocks.scope.urlGrowId = "grow-b";
    mocks.scope.scopedGrowName = "Grow B";
    mocks.scope.backHref = "/grows/grow-b";
    mocks.growsState.grows = [{ id: "grow-b", name: "Grow B" }];
    mocks.queries.active = successfulQuery([mocks.plantB]);
    mocks.queries.workspace = successfulQuery([mocks.plantB]);
    mocks.queries.archivedByGrow.set("grow-b", successfulQuery([mocks.plantB]));
    mocks.queries.tents = successfulQuery([{ id: "tent-b", name: "Tent B" }]);

    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/plants?growId=grow-b"]}>
          <Plants />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText("Scope B Plant")).toBeInTheDocument();
    expect(screen.queryByText(/No plants/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("plants-tent-filter-all")).toHaveAttribute("data-count", "1");
  });

  it("blocks create actions until a requested grow scope is verified", () => {
    mocks.growsState.loading = true;

    renderPlants();

    expect(screen.getByTestId("plants-loading")).toHaveAttribute("data-loading-reason", "scope");
    expect(screen.queryByTestId("create-plant-dialog")).not.toBeInTheDocument();
  });

  it("renders a calm scope error with a scope-only retry", () => {
    mocks.growsState.error = "private database detail";

    renderPlants();

    expect(screen.getByText("Grow scope unavailable")).toBeInTheDocument();
    expect(screen.queryByText("private database detail")).not.toBeInTheDocument();
    expect(screen.queryByTestId("create-plant-dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("plants-retry-scope"));
    expect(mocks.growsState.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.queries.archivedByGrow.get("grow-a")?.refetch).not.toHaveBeenCalled();
  });

  it("does not silently replace an invalid requested grow with another grow", () => {
    mocks.scope.isValidScopedGrow = false;
    mocks.scope.scopedGrowName = null;
    mocks.growsState.grows = [{ id: "different-grow", name: "Different Grow" }];

    renderPlants();

    expect(screen.getByText("Grow unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Scope A Plant")).not.toBeInTheDocument();
    expect(screen.queryByTestId("create-plant-dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View all plants" })).toHaveAttribute(
      "href",
      "/plants",
    );
  });
});
