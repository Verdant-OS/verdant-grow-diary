import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => {
  const tentId = "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e6f";
  const tent = {
    id: tentId,
    name: "Verified Tent",
    brand: "Gorilla",
    size: "4x4",
    stage: "veg",
    light: { on: true, schedule: "18/6", wattage: 240 },
    alertCount: 0,
    growId: "grow-a",
  };
  const plant = {
    id: "plant-a",
    name: "Plant A",
    tentId,
    growId: "grow-a",
  };
  const makeQuery = <T,>(data: T | undefined) => ({
    data,
    isLoading: false,
    isPending: false,
    isFetching: false,
    isError: false,
    isPlaceholderData: false,
    refetch: vi.fn().mockResolvedValue(undefined),
  });

  return {
    tentId,
    tent,
    plant,
    makeQuery,
    scope: {
      urlGrowId: "grow-a" as string | null,
      scopedGrowName: "Grow A" as string | null,
      isValidScopedGrow: true,
      backHref: "/grows/grow-a" as string | undefined,
    },
    growsState: {
      grows: [{ id: "grow-a", name: "Grow A" }],
      loading: false,
      error: null as string | null,
      refresh: vi.fn().mockResolvedValue(undefined),
    },
    queries: {
      tents: makeQuery([tent]),
      plants: makeQuery([plant]),
      assignments: makeQuery([plant]),
    },
    sensors: {
      byTent: { [tentId]: [] } as Record<string, unknown[]>,
      statusByTent: { [tentId]: "success" } as Record<
        string,
        "loading" | "error" | "refresh_error" | "success"
      >,
      retryTent: vi.fn().mockResolvedValue(undefined),
    },
  };
});

vi.mock("@/hooks/useGrowData", () => ({
  useGrowTents: () => mocks.queries.tents,
  useGrowPlants: (_tentId?: string, _growId?: string, options?: { includeArchived?: boolean }) =>
    options?.includeArchived ? mocks.queries.assignments : mocks.queries.plants,
  getGrowDataMeta: () => ({
    isDemoData: false,
    dataSource: "supabase",
    sourceReason: "supabase:rows",
  }),
}));

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadingsByTents: () => mocks.sensors,
}));

vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => mocks.scope,
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => mocks.growsState,
}));

vi.mock("@/hooks/useNowTick", () => ({
  useNowTick: () => new Date("2026-07-18T12:00:00Z").getTime(),
}));

vi.mock("@/components/CreateTentDialog", () => ({
  default: ({ defaultGrowId }: { defaultGrowId?: string }) => (
    <button data-testid="create-tent-dialog" data-grow-id={defaultGrowId ?? "unscoped"}>
      Create tent
    </button>
  ),
}));

vi.mock("@/components/TentCardActionsMenu", () => ({
  default: ({ assignedPlantCount }: { assignedPlantCount: number | null }) => (
    <div data-testid="tent-actions" data-assigned-plant-count={assignedPlantCount ?? "unknown"} />
  ),
}));

vi.mock("@/components/GrowBreadcrumbs", () => ({
  default: ({ growId }: { growId?: string | null }) => (
    <nav data-testid="grow-breadcrumbs" data-grow-id={growId ?? "none"} />
  ),
}));
vi.mock("@/components/GrowDataSourceDisclosure", () => ({ default: () => null }));

import Tents from "@/pages/Tents";

function successfulQuery<T>(data: T) {
  return mocks.makeQuery(data);
}

function renderTents() {
  return render(
    <MemoryRouter initialEntries={["/tents?growId=grow-a"]}>
      <Tents />
    </MemoryRouter>,
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
  mocks.queries.tents = successfulQuery([mocks.tent]);
  mocks.queries.plants = successfulQuery([mocks.plant]);
  mocks.queries.assignments = successfulQuery([mocks.plant]);
  mocks.sensors.byTent = { [mocks.tentId]: [] };
  mocks.sensors.statusByTent = { [mocks.tentId]: "success" };
  mocks.sensors.retryTent = vi.fn().mockResolvedValue(undefined);
});

describe("Tents page async-state contract", () => {
  it("renders loading before empty and hides create while the primary query is pending", () => {
    mocks.queries.tents = {
      ...mocks.makeQuery(undefined),
      isLoading: true,
      isPending: true,
      isFetching: true,
    };

    renderTents();

    expect(screen.getByTestId("tents-loading")).toBeInTheDocument();
    expect(screen.queryByText("No tents yet")).not.toBeInTheDocument();
    expect(screen.queryByTestId("create-tent-dialog")).not.toBeInTheDocument();
  });

  it("renders a primary error with a primary-only retry", () => {
    const failedPrimary = { ...mocks.makeQuery(undefined), isError: true };
    mocks.queries.tents = failedPrimary;

    renderTents();

    expect(screen.getByText("Tents unavailable")).toBeInTheDocument();
    expect(screen.getByText("Tents unavailable").closest('[role="alert"]')).not.toBeNull();
    expect(screen.queryByText("No tents yet")).not.toBeInTheDocument();
    expect(screen.queryByTestId("create-tent-dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry tent list" }));
    expect(failedPrimary.refetch).toHaveBeenCalledTimes(1);
    expect(mocks.queries.plants.refetch).not.toHaveBeenCalled();
  });

  it("renders empty only after the primary query succeeds and then enables scoped create", () => {
    mocks.queries.tents = successfulQuery([]);

    renderTents();

    expect(screen.getByText("No tents yet")).toBeInTheDocument();
    expect(screen.queryByTestId("tents-loading")).not.toBeInTheDocument();
    expect(screen.getByTestId("create-tent-dialog")).toHaveAttribute("data-grow-id", "grow-a");
  });

  it("does not render cached empty as established when its refresh failed", () => {
    mocks.queries.tents = { ...successfulQuery([]), isError: true };

    renderTents();

    expect(screen.getByText("Tents unavailable")).toBeInTheDocument();
    expect(screen.queryByText("No tents yet")).not.toBeInTheDocument();
    expect(screen.queryByTestId("create-tent-dialog")).not.toBeInTheDocument();
  });

  it("does not render prior-scope tent cards while the next scope is placeholder-loading", () => {
    mocks.queries.tents = {
      ...successfulQuery([mocks.tent]),
      isFetching: true,
      isPlaceholderData: true,
    };

    renderTents();

    expect(screen.getByTestId("tents-loading")).toBeInTheDocument();
    expect(screen.queryByText("Verified Tent")).not.toBeInTheDocument();
    expect(screen.queryByText("No tents yet")).not.toBeInTheDocument();
  });

  it("keeps cached tent cards visible and labels a primary refresh failure", () => {
    const stalePrimary = { ...successfulQuery([mocks.tent]), isError: true };
    mocks.queries.tents = stalePrimary;

    renderTents();

    expect(screen.getByText("Verified Tent")).toBeInTheDocument();
    expect(screen.getByTestId("tents-primary-refresh-error")).toHaveTextContent(
      "Tent list refresh unavailable",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry tent list refresh" }));
    expect(stalePrimary.refetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("create-tent-dialog")).not.toBeInTheDocument();
  });

  it("never invents a visible zero while active plants are pending", () => {
    mocks.queries.plants = {
      ...mocks.makeQuery(undefined),
      isLoading: true,
      isPending: true,
    };

    renderTents();

    expect(screen.getByText("Verified Tent")).toBeInTheDocument();
    expect(screen.getByTestId("tents-plants-pending")).toHaveTextContent(
      "Active plant assignments still loading",
    );
    expect(screen.getByTestId(`tent-plant-count-status-${mocks.tentId}`)).toHaveTextContent(
      "Plant count loading",
    );
    expect(screen.queryByText("0 plants")).not.toBeInTheDocument();
    expect(screen.getByTestId("tent-actions")).toHaveAttribute("data-assigned-plant-count", "1");
  });

  it("does not consume prior-scope placeholder plant assignments", () => {
    mocks.queries.plants = {
      ...successfulQuery([mocks.plant]),
      isFetching: true,
      isPlaceholderData: true,
    };

    renderTents();

    expect(screen.getByTestId("tents-plants-pending")).toBeInTheDocument();
    expect(screen.getByTestId(`tent-plant-count-status-${mocks.tentId}`)).toHaveTextContent(
      "Plant count loading",
    );
    expect(screen.queryByText("1 plant")).not.toBeInTheDocument();
    expect(screen.getByTestId("tent-actions")).toHaveAttribute("data-assigned-plant-count", "1");
  });

  it("keeps cards visible, labels plant failure, and retries only plant assignments", () => {
    const failedPlants = { ...mocks.makeQuery(undefined), isError: true };
    mocks.queries.plants = failedPlants;

    renderTents();

    expect(screen.getByText("Verified Tent")).toBeInTheDocument();
    expect(screen.getByTestId("tents-plants-error")).toHaveTextContent(
      "Active plant assignments unavailable",
    );
    expect(screen.getByTestId(`tent-plant-count-status-${mocks.tentId}`)).toHaveTextContent(
      "Plant count unavailable",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry plant assignments" }));
    expect(failedPlants.refetch).toHaveBeenCalledTimes(1);
    expect(mocks.queries.tents.refetch).not.toHaveBeenCalled();
    expect(screen.getByTestId("tent-actions")).toHaveAttribute("data-assigned-plant-count", "1");
  });

  it("labels cached active assignments as last loaded without weakening the verified guard", () => {
    mocks.queries.plants = {
      ...successfulQuery([mocks.plant]),
      isError: true,
    };

    renderTents();

    expect(screen.getByTestId("tents-plants-stale")).toHaveTextContent(
      "showing last loaded display data",
    );
    expect(screen.getByTestId(`tent-plant-count-status-${mocks.tentId}`)).toHaveTextContent(
      "1 plant (last loaded)",
    );
    expect(screen.getByTestId("tent-actions")).toHaveAttribute("data-assigned-plant-count", "1");
  });

  it.each([
    ["pending", { data: undefined, isPending: true, isLoading: true }],
    ["error", { data: undefined, isError: true }],
    ["background refresh", { data: [mocks.plant], isFetching: true }],
  ])("fails destructive management closed while archived assignments are %s", (_label, state) => {
    mocks.queries.assignments = { ...mocks.makeQuery(state.data), ...state };

    renderTents();

    expect(screen.getByTestId("tent-actions")).toHaveAttribute(
      "data-assigned-plant-count",
      "unknown",
    );
  });

  it("counts an archived-only plant for the destructive-action guard", () => {
    mocks.queries.plants = successfulQuery([]);
    mocks.queries.assignments = successfulQuery([{ ...mocks.plant, isArchived: true }]);

    renderTents();

    expect(screen.getByTestId(`tent-plant-count-status-${mocks.tentId}`)).toHaveTextContent(
      "0 plants",
    );
    expect(screen.getByTestId("tent-actions")).toHaveAttribute("data-assigned-plant-count", "1");
  });

  it("retries only the include-archived assignment guard query", () => {
    const failedAssignments = { ...mocks.makeQuery(undefined), isError: true };
    mocks.queries.assignments = failedAssignments;

    renderTents();

    expect(screen.getByTestId("tents-assignment-guard-error")).toHaveTextContent(
      "Tent management checks unavailable",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry tent management checks" }));
    expect(failedAssignments.refetch).toHaveBeenCalledTimes(1);
    expect(mocks.queries.plants.refetch).not.toHaveBeenCalled();
    expect(mocks.queries.tents.refetch).not.toHaveBeenCalled();
  });

  it("routes a sensor retry only to the failed tent", () => {
    mocks.sensors.statusByTent = { [mocks.tentId]: "error" };

    renderTents();

    expect(screen.getByTestId(`tents-sensor-error-${mocks.tentId}`)).toHaveTextContent(
      "Verified Tent sensor readings unavailable",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry Verified Tent sensor readings" }));
    expect(mocks.sensors.retryTent).toHaveBeenCalledWith(mocks.tentId);
    expect(mocks.queries.tents.refetch).not.toHaveBeenCalled();
    expect(mocks.queries.plants.refetch).not.toHaveBeenCalled();
  });

  it("keeps cached sensor evidence visible and labels a refresh failure", () => {
    mocks.sensors.byTent = {
      [mocks.tentId]: [
        {
          id: "reading-a",
          tent_id: mocks.tentId,
          metric: "temperature_c",
          value: 24,
          source: "live",
          captured_at: "2026-07-18T11:55:00Z",
          ts: "2026-07-18T11:55:00Z",
          created_at: "2026-07-18T11:55:00Z",
        },
      ],
    };
    mocks.sensors.statusByTent = { [mocks.tentId]: "refresh_error" };

    renderTents();

    expect(screen.getByTestId(`tents-sensor-refresh-error-${mocks.tentId}`)).toHaveTextContent(
      "showing last loaded readings",
    );
    expect(screen.getByTestId(`tents-list-metric-${mocks.tentId}-temp`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry Verified Tent sensor readings" }));
    expect(mocks.sensors.retryTent).toHaveBeenCalledWith(mocks.tentId);
  });

  it("does not describe cached emptiness as current while sensor refresh is unavailable", () => {
    mocks.sensors.statusByTent = { [mocks.tentId]: "refresh_error" };

    renderTents();

    expect(screen.getByTestId(`tents-list-sensor-empty-${mocks.tentId}`)).toHaveTextContent(
      "Last loaded result had no readings; refresh unavailable",
    );
    expect(screen.queryByText("No sensor data yet")).not.toBeInTheDocument();
    expect(screen.getByTestId(`tents-sensor-refresh-error-${mocks.tentId}`)).toHaveTextContent(
      "last loaded result had no readings",
    );
  });
});

describe("Tents requested-grow scope contract", () => {
  it("waits for grow scope verification and never exposes a mismatched create action", () => {
    mocks.growsState.loading = true;
    mocks.scope.isValidScopedGrow = false;

    renderTents();

    expect(screen.getByTestId("tents-loading")).toHaveAttribute("data-loading-reason", "scope");
    expect(screen.queryByText("Verified Tent")).not.toBeInTheDocument();
    expect(screen.queryByTestId("create-tent-dialog")).not.toBeInTheDocument();
  });

  it("shows a grow-scope error with scope-only retry", () => {
    mocks.growsState.error = "raw backend text must not render";
    mocks.scope.isValidScopedGrow = false;

    renderTents();

    expect(screen.getByText("Grow scope unavailable")).toBeInTheDocument();
    expect(screen.getByText("Grow scope unavailable").closest('[role="alert"]')).not.toBeNull();
    expect(screen.queryByText(/raw backend text/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry grow scope" }));
    expect(mocks.growsState.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.queries.tents.refetch).not.toHaveBeenCalled();
    expect(mocks.queries.plants.refetch).not.toHaveBeenCalled();
  });

  it("rejects an invalid requested grow without silently showing another scope", () => {
    mocks.scope.isValidScopedGrow = false;

    renderTents();

    expect(screen.getByText("Grow unavailable")).toBeInTheDocument();
    expect(screen.getByText(/No other grow was selected in its place/)).toBeInTheDocument();
    expect(screen.queryByText("Verified Tent")).not.toBeInTheDocument();
    expect(screen.queryByTestId("create-tent-dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("grow-breadcrumbs")).toHaveAttribute("data-grow-id", "none");
  });
});
