/**
 * Daily Check target-order and exact-target regression proof.
 *
 * The page only orchestrates existing read/write surfaces. These tests mock
 * every persistence-capable child and prove that route/selector state cannot
 * drift to a different plant or tent before those children receive props.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const useSensorReadingsMock = vi.hoisted(() =>
  vi.fn((_tentId?: string, _limit?: number) => ({ data: [] })),
);
const activityRenderMock = vi.hoisted(() => vi.fn());
const quickLogRenderMock = vi.hoisted(() => vi.fn());
const manualSaveTargetMock = vi.hoisted(() => vi.fn());

const baseMockPlants = [
  {
    id: "p-assigned",
    name: "Assigned plant with a deliberately long mobile proof name",
    strain: "Exact Target",
    grow_id: "g1",
    tent_id: "t2",
    stage: "veg",
    is_archived: false,
  },
  {
    id: "p-assigned-two",
    name: "Second scoped plant",
    strain: "Route Change",
    grow_id: "g1",
    tent_id: "t1",
    stage: "flower",
    is_archived: false,
  },
  {
    id: "p-untented",
    name: "Untented plant",
    strain: null,
    grow_id: "g1",
    tent_id: null,
    stage: "veg",
    is_archived: false,
  },
  {
    id: "p-other-grow",
    name: "Other grow plant",
    strain: null,
    grow_id: "g2",
    tent_id: "t1",
    stage: "veg",
    is_archived: false,
  },
  {
    id: "p-legacy",
    name: "Legacy unassigned grow plant",
    strain: null,
    grow_id: null,
    tent_id: "t1",
    stage: "veg",
    is_archived: false,
  },
  {
    id: "p-cross-tent",
    name: "Scoped plant assigned to another grow tent",
    strain: null,
    grow_id: "g1",
    tent_id: "t-g2",
    stage: "veg",
    is_archived: false,
  },
];
let mockPlants = baseMockPlants.map((plant) => ({ ...plant }));

const baseMockTents = [
  { id: "t1", name: "Default Tent", grow_id: "g1" },
  { id: "t2", name: "Assigned Tent", grow_id: "g1" },
  { id: "t-g2", name: "Other grow tent", grow_id: "g2" },
  { id: "t-legacy", name: "Legacy unassigned tent", grow_id: null },
];
let mockTents = baseMockTents.map((tent) => ({ ...tent }));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: mockTents, isLoading: false }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({ data: mockPlants, isLoading: false }),
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: useSensorReadingsMock,
}));

vi.mock("@/components/QuickLogAllActivitiesSection", () => ({
  default: ({
    growId,
    tentId,
    plantId,
    testIdPrefix,
  }: {
    growId: string | null;
    tentId: string | null;
    plantId: string | null;
    testIdPrefix: string;
  }) => (
    activityRenderMock({ growId, tentId, plantId }),
    (
      <div
        data-testid={testIdPrefix}
        data-grow-id={growId ?? ""}
        data-tent-id={tentId ?? ""}
        data-plant-id={plantId ?? ""}
      />
    )
  ),
}));

vi.mock("@/components/ManualSensorReadingCard", () => ({
  default: function StatefulManualSensorReadingCard({
    defaultTentId,
    tents,
  }: {
    defaultTentId?: string;
    tents: Array<{ id: string; name: string }>;
  }) {
    const [selectedTentId, setSelectedTentId] = useState(defaultTentId ?? tents[0]?.id ?? "");
    useEffect(() => {
      if (defaultTentId) setSelectedTentId(defaultTentId);
    }, [defaultTentId]);
    return (
      <div
        data-testid="mock-manual-card"
        data-default-tent-id={defaultTentId ?? ""}
        data-selected-tent-id={selectedTentId}
        data-tent-options={tents.map((tent) => tent.id).join(",")}
      >
        <button
          type="button"
          data-testid="mock-manual-save"
          onClick={() => manualSaveTargetMock(selectedTentId)}
        >
          Save stateful manual target
        </button>
      </div>
    );
  },
}));
vi.mock("@/components/QuickLog", () => ({
  default: ({
    open,
    prefill,
  }: {
    open?: boolean;
    prefill?: { growId: string | null; tentId: string | null; plantId: string | null };
  }) => (
    quickLogRenderMock({ open, prefill }),
    (
      <div
        data-testid="mock-quicklog"
        data-open={open ? "1" : "0"}
        data-prefill-grow-id={prefill?.growId ?? ""}
        data-prefill-tent-id={prefill?.tentId ?? ""}
        data-prefill-plant-id={prefill?.plantId ?? ""}
      />
    )
  ),
}));
vi.mock("@/components/PlantStatusStrip", () => ({
  default: ({ tentId }: { tentId: string | null }) => (
    <div data-testid="mock-status-strip" data-tent-id={tentId ?? ""} />
  ),
}));
vi.mock("@/components/PlantAssignedTentAlertsPanel", () => ({
  default: ({ tentId }: { tentId: string | null }) => (
    <div data-testid="mock-alerts-panel" data-tent-id={tentId ?? ""} />
  ),
}));
vi.mock("@/components/PlantAssignedTentActionsPanel", () => ({
  default: ({ tentId }: { tentId: string | null }) => (
    <div data-testid="mock-actions-panel" data-tent-id={tentId ?? ""} />
  ),
}));
vi.mock("@/components/DailyGrowCheckOnboardingCard", () => ({
  default: () => <div data-testid="mock-onboarding" />,
}));

let mockUrlGrowId: string | null = null;
vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: mockUrlGrowId,
    scopedGrow: null,
    scopedGrowName: null,
    isValidScopedGrow: false,
    backHref: undefined,
  }),
}));

import DailyCheck from "@/pages/DailyCheck";

let refreshDataInTest: (() => void) | null = null;

function RefreshableDailyCheck() {
  const [, setRevision] = useState(0);

  useEffect(() => {
    refreshDataInTest = () => setRevision((revision) => revision + 1);
    return () => {
      refreshDataInTest = null;
    };
  }, []);

  return <DailyCheck />;
}

function refreshData() {
  expect(refreshDataInTest).not.toBeNull();
  act(() => {
    refreshDataInTest?.();
  });
}

function renderRoute(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <RefreshableDailyCheck />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

let navigateInTest: ((path: string) => void) | null = null;

function NavigationCapture() {
  const navigate = useNavigate();

  useEffect(() => {
    navigateInTest = (path) => navigate(path);
    return () => {
      navigateInTest = null;
    };
  }, [navigate]);

  return null;
}

function renderNavigableRoute(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <NavigationCapture />
        <RefreshableDailyCheck />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function navigateRoute(path: string) {
  expect(navigateInTest).not.toBeNull();
  await act(async () => {
    navigateInTest?.(path);
  });
}

async function choosePlant(name: RegExp) {
  const trigger = screen.getByTestId("daily-grow-check-plant-select");
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.click(trigger);
  fireEvent.click(await screen.findByRole("option", { name }));
}

function expectBefore(earlier: HTMLElement, later: HTMLElement) {
  expect(earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
}

function expectEveryActivityRenderToUse(plantId: string | null, tentId: string | null) {
  expect(activityRenderMock).toHaveBeenCalled();
  for (const [props] of activityRenderMock.mock.calls) {
    expect(props).toMatchObject({ plantId, tentId });
  }
}

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

describe("DailyCheck target selector order and exact-target truth", () => {
  beforeEach(() => {
    mockUrlGrowId = null;
    mockPlants = baseMockPlants.map((plant) => ({ ...plant }));
    mockTents = baseMockTents.map((tent) => ({ ...tent }));
    refreshDataInTest = null;
    useSensorReadingsMock.mockClear();
    activityRenderMock.mockClear();
    quickLogRenderMock.mockClear();
    manualSaveTargetMock.mockClear();
  });

  it("renders one selector before activities, fast choices, and the guided heading", async () => {
    renderRoute("/daily-check");

    const selector = await screen.findByTestId("daily-grow-check-target-selector");
    const activities = screen.getByTestId("daily-check-all-activities");
    const choose = screen.getByTestId("daily-grow-check-choose");
    const guided = screen.getByTestId("daily-grow-check-guided-heading");

    expect(screen.getAllByTestId("daily-grow-check-target-selector")).toHaveLength(1);
    expect(screen.getAllByTestId("daily-grow-check-plant-select")).toHaveLength(1);
    expect(screen.getAllByTestId("daily-grow-check-tent-select")).toHaveLength(1);
    expectBefore(selector, activities);
    expectBefore(activities, choose);
    expectBefore(choose, guided);
  });

  it("disables the plant-note fast path without a selected plant and cannot open Quick Log", async () => {
    renderRoute("/daily-check");

    const choose = await screen.findByTestId("daily-grow-check-choose");
    const note = within(choose).getByTestId("daily-grow-check-choose-quicklog");
    expect(note).toBeDisabled();
    expect(screen.getByTestId("daily-grow-check-choose-no-plant")).toBeVisible();
    fireEvent.click(note);
    expect(screen.getByTestId("mock-quicklog")).toHaveAttribute("data-open", "0");
  });

  it("uses only the assigned plant tent across activities, reads, and Quick Log prefill", async () => {
    renderRoute("/daily-check?plantId=p-assigned");

    await waitFor(() =>
      expect(screen.getByTestId("daily-check-all-activities")).toHaveAttribute(
        "data-plant-id",
        "p-assigned",
      ),
    );
    expect(screen.getByTestId("daily-check-all-activities")).toHaveAttribute("data-tent-id", "t2");
    expect(screen.getByTestId("mock-quicklog")).toHaveAttribute(
      "data-prefill-plant-id",
      "p-assigned",
    );
    expect(screen.getByTestId("mock-quicklog")).toHaveAttribute("data-prefill-tent-id", "t2");
    expect(screen.getByTestId("daily-grow-check-tent-select")).toBeDisabled();
    expect(useSensorReadingsMock).toHaveBeenLastCalledWith("t2", 50);
  });

  it("clears the default tent for an untented route plant and keeps sensor entry disabled", async () => {
    renderRoute("/daily-check?plantId=p-untented");

    await waitFor(() =>
      expect(screen.getByTestId("daily-check-all-activities")).toHaveAttribute(
        "data-plant-id",
        "p-untented",
      ),
    );
    expect(screen.getByTestId("daily-check-all-activities")).toHaveAttribute("data-tent-id", "");
    expect(screen.getByTestId("mock-quicklog")).toHaveAttribute("data-prefill-tent-id", "");
    expect(screen.getByTestId("daily-grow-check-tent-select")).toBeDisabled();
    expect(screen.getByTestId("daily-grow-check-choose-snapshot")).toBeDisabled();
    expect(screen.getByTestId("daily-grow-check-choose-no-tent")).toBeVisible();
    expect(useSensorReadingsMock).toHaveBeenLastCalledWith(undefined, 50);
  });

  it("preserves an available tent-only selection when no plant is selected", async () => {
    renderRoute("/daily-check");

    await waitFor(() =>
      expect(screen.getByTestId("daily-check-all-activities")).toHaveAttribute(
        "data-tent-id",
        "t1",
      ),
    );
    expect(screen.getByTestId("daily-check-all-activities")).toHaveAttribute("data-plant-id", "");
    expect(screen.getByTestId("daily-grow-check-tent-select")).not.toBeDisabled();
    expect(screen.getByTestId("daily-grow-check-choose-snapshot")).not.toBeDisabled();
    expect(screen.getByTestId("daily-grow-check-start")).not.toBeDisabled();
  });

  it("preserves Start and Back semantics while every guided surface receives the exact tent", async () => {
    renderRoute("/daily-check?plantId=p-assigned");
    await waitFor(() => expect(screen.getByTestId("daily-grow-check-start")).not.toBeDisabled());

    fireEvent.click(screen.getByTestId("daily-grow-check-start"));
    expect(await screen.findByTestId("mock-status-strip")).toHaveAttribute("data-tent-id", "t2");
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(await screen.findByTestId("daily-grow-check-target-selector")).toBeVisible();

    fireEvent.click(screen.getByTestId("daily-grow-check-start"));
    fireEvent.click(screen.getByTestId("daily-grow-check-next"));
    expect(await screen.findByTestId("mock-manual-card")).toHaveAttribute(
      "data-default-tent-id",
      "t2",
    );
    fireEvent.click(screen.getByTestId("daily-grow-check-next"));
    fireEvent.click(screen.getByTestId("daily-grow-check-next"));
    fireEvent.click(screen.getByTestId("daily-grow-check-next"));
    expect(await screen.findByTestId("mock-alerts-panel")).toHaveAttribute("data-tent-id", "t2");
    expect(screen.getByTestId("mock-actions-panel")).toHaveAttribute("data-tent-id", "t2");
  });

  it("honors an exact valid plantId + method=note without changing its target", async () => {
    renderRoute("/daily-check?plantId=p-assigned&from=dashboard&method=note");

    await waitFor(() =>
      expect(screen.getByTestId("mock-quicklog")).toHaveAttribute("data-open", "1"),
    );
    expect(screen.getByTestId("mock-quicklog")).toHaveAttribute(
      "data-prefill-plant-id",
      "p-assigned",
    );
    expect(screen.getByTestId("mock-quicklog")).toHaveAttribute("data-prefill-tent-id", "t2");
  });

  it("switches valid route plants without rendering the previous target first", async () => {
    renderNavigableRoute("/daily-check?plantId=p-assigned");
    await waitFor(() =>
      expect(screen.getByTestId("daily-check-all-activities")).toHaveAttribute(
        "data-plant-id",
        "p-assigned",
      ),
    );

    activityRenderMock.mockClear();
    await navigateRoute("/daily-check?plantId=p-assigned-two");
    await waitFor(() =>
      expect(screen.getByTestId("daily-check-all-activities")).toHaveAttribute(
        "data-plant-id",
        "p-assigned-two",
      ),
    );
    expectEveryActivityRenderToUse("p-assigned-two", "t1");
    expect(screen.getByTestId("mock-quicklog")).toHaveAttribute(
      "data-prefill-plant-id",
      "p-assigned-two",
    );
  });

  it.each([
    ["unknown", "/daily-check?plantId=missing&method=note", null],
    ["out-of-scope", "/daily-check?plantId=p-other-grow&growId=g1&method=note", "g1"],
  ])(
    "clears a mounted valid target before rendering a new %s route",
    async (status, path, nextGrowId) => {
      renderNavigableRoute("/daily-check?plantId=p-assigned&method=note");
      await waitFor(() =>
        expect(screen.getByTestId("mock-quicklog")).toHaveAttribute("data-open", "1"),
      );

      activityRenderMock.mockClear();
      quickLogRenderMock.mockClear();
      mockUrlGrowId = nextGrowId;
      await navigateRoute(path);

      expect(await screen.findByTestId("daily-grow-check-plant-rejected")).toHaveAttribute(
        "data-rejection-status",
        status,
      );
      expectEveryActivityRenderToUse(null, null);
      expect(screen.getByTestId("mock-quicklog")).toHaveAttribute("data-open", "0");
      for (const [props] of quickLogRenderMock.mock.calls) {
        expect(props.prefill).toMatchObject({ plantId: null, tentId: null });
      }
    },
  );

  it("reconciles method changes on the same mounted plant route", async () => {
    renderNavigableRoute("/daily-check?plantId=p-assigned&from=dashboard&method=note");
    await waitFor(() =>
      expect(screen.getByTestId("mock-quicklog")).toHaveAttribute("data-open", "1"),
    );

    quickLogRenderMock.mockClear();
    await navigateRoute("/daily-check?plantId=p-assigned&from=dashboard&method=sensor");
    expect(await screen.findByTestId("mock-manual-card")).toHaveAttribute(
      "data-default-tent-id",
      "t2",
    );
    expect(screen.queryByTestId("daily-grow-check-open-quicklog")).not.toBeInTheDocument();
    for (const [props] of quickLogRenderMock.mock.calls) {
      expect(props).toMatchObject({ open: false });
      expect(props.prefill).toMatchObject({ plantId: "p-assigned", tentId: "t2" });
    }

    quickLogRenderMock.mockClear();
    await navigateRoute("/daily-check?plantId=p-assigned&from=dashboard&method=note");
    await waitFor(() =>
      expect(screen.getByTestId("mock-quicklog")).toHaveAttribute("data-open", "1"),
    );
    for (const [props] of quickLogRenderMock.mock.calls) {
      expect(props).toMatchObject({ open: true });
      expect(props.prefill).toMatchObject({ plantId: "p-assigned", tentId: "t2" });
    }
  });

  it("keeps local plant selection working while route identity is unchanged", async () => {
    renderNavigableRoute("/daily-check?plantId=p-assigned");
    await waitFor(() =>
      expect(screen.getByTestId("daily-check-all-activities")).toHaveAttribute(
        "data-plant-id",
        "p-assigned",
      ),
    );

    activityRenderMock.mockClear();
    await choosePlant(/Second scoped plant/i);
    await waitFor(() =>
      expect(screen.getByTestId("daily-check-all-activities")).toHaveAttribute(
        "data-plant-id",
        "p-assigned-two",
      ),
    );
    expectEveryActivityRenderToUse("p-assigned-two", "t1");
  });

  it("offers only plants from the current grow scope", async () => {
    mockUrlGrowId = "g1";
    renderNavigableRoute("/daily-check?growId=g1");
    const trigger = await screen.findByTestId("daily-grow-check-plant-select");
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.click(trigger);

    expect(await screen.findByRole("option", { name: /Assigned plant/i })).toBeVisible();
    expect(screen.getByRole("option", { name: /Second scoped plant/i })).toBeVisible();
    expect(screen.queryByRole("option", { name: /Other grow plant/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Legacy unassigned grow plant/i }),
    ).not.toBeInTheDocument();
  });

  it("scopes a tent-only check to tents owned by the URL grow", async () => {
    mockUrlGrowId = "g1";
    mockTents = [
      { ...baseMockTents[2] },
      { ...baseMockTents[3] },
      { ...baseMockTents[0] },
      { ...baseMockTents[1] },
    ];

    renderRoute("/daily-check?growId=g1");

    await waitFor(() =>
      expect(screen.getByTestId("daily-check-all-activities")).toHaveAttribute(
        "data-tent-id",
        "t1",
      ),
    );
    expect(screen.getByTestId("mock-quicklog")).toHaveAttribute("data-prefill-tent-id", "t1");

    const tentTrigger = screen.getByTestId("daily-grow-check-tent-select");
    fireEvent.pointerDown(tentTrigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.click(tentTrigger);
    expect(await screen.findByRole("option", { name: "Default Tent" })).toBeVisible();
    expect(screen.getByRole("option", { name: "Assigned Tent" })).toBeVisible();
    expect(screen.queryByRole("option", { name: "Other grow tent" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Legacy unassigned tent" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("daily-grow-check-choose-snapshot"));
    const card = await screen.findByTestId("mock-manual-card");
    expect(card).toHaveAttribute("data-default-tent-id", "t1");
    expect(card).toHaveAttribute("data-selected-tent-id", "t1");
    expect(card).toHaveAttribute("data-tent-options", "t1,t2");
    fireEvent.click(screen.getByTestId("mock-manual-save"));
    expect(manualSaveTargetMock).toHaveBeenCalledWith("t1");
    expect(useSensorReadingsMock).not.toHaveBeenCalledWith("t-g2", 50);
  });

  it("rejects a selected plant tent that belongs to another grow", async () => {
    mockUrlGrowId = "g1";

    renderRoute("/daily-check?growId=g1&plantId=p-cross-tent&method=sensor");

    await waitFor(() =>
      expect(screen.getByTestId("daily-check-all-activities")).toHaveAttribute(
        "data-plant-id",
        "p-cross-tent",
      ),
    );
    expect(screen.getByTestId("daily-check-all-activities")).toHaveAttribute("data-tent-id", "");
    expect(screen.getByTestId("mock-quicklog")).toHaveAttribute("data-prefill-tent-id", "");
    expect(screen.getByTestId("daily-grow-check-choose-snapshot")).toBeDisabled();
    expect(screen.queryByTestId("mock-manual-card")).not.toBeInTheDocument();
    expect(useSensorReadingsMock).not.toHaveBeenCalledWith("t-g2", 50);
  });

  it("rejects a routed cross-grow plant-to-tent edge without a URL grow scope", async () => {
    renderRoute("/daily-check?plantId=p-cross-tent&method=sensor");

    await waitFor(() =>
      expect(screen.getByTestId("daily-check-all-activities")).toHaveAttribute(
        "data-plant-id",
        "p-cross-tent",
      ),
    );
    expect(screen.getByTestId("daily-check-all-activities")).toHaveAttribute("data-tent-id", "");
    expect(screen.getByTestId("mock-quicklog")).toHaveAttribute(
      "data-prefill-plant-id",
      "p-cross-tent",
    );
    expect(screen.getByTestId("mock-quicklog")).toHaveAttribute("data-prefill-tent-id", "");
    expect(screen.getByTestId("daily-grow-check-choose-snapshot")).toBeDisabled();
    expect(screen.queryByTestId("mock-manual-card")).not.toBeInTheDocument();
    expect(useSensorReadingsMock).not.toHaveBeenCalledWith("t-g2", 50);

    const note = screen.getByTestId("daily-grow-check-choose-quicklog");
    expect(note).not.toBeDisabled();
    fireEvent.click(note);
    expect(screen.getByTestId("mock-quicklog")).toHaveAttribute("data-open", "1");
    expect(screen.getByTestId("mock-quicklog")).toHaveAttribute("data-prefill-tent-id", "");
  });

  it("rejects a locally selected cross-grow plant-to-tent edge", async () => {
    renderRoute("/daily-check");
    await choosePlant(/Scoped plant assigned to another grow tent/i);

    await waitFor(() =>
      expect(screen.getByTestId("daily-check-all-activities")).toHaveAttribute(
        "data-plant-id",
        "p-cross-tent",
      ),
    );
    expect(screen.getByTestId("daily-check-all-activities")).toHaveAttribute("data-tent-id", "");
    expect(screen.getByTestId("mock-quicklog")).toHaveAttribute(
      "data-prefill-plant-id",
      "p-cross-tent",
    );
    expect(screen.getByTestId("mock-quicklog")).toHaveAttribute("data-prefill-tent-id", "");
    expect(screen.getByTestId("daily-grow-check-choose-snapshot")).toBeDisabled();
    expect(screen.queryByTestId("mock-manual-card")).not.toBeInTheDocument();
    expect(useSensorReadingsMock).not.toHaveBeenCalledWith("t-g2", 50);
    expect(screen.getByTestId("daily-grow-check-choose-quicklog")).not.toBeDisabled();
  });

  it.each([
    ["untented", null],
    ["unavailable", "remove"],
    ["assigned tent unavailable", "remove-tent"],
  ])(
    "falls out of manual entry when a route plant becomes %s after data refresh",
    async (_state, mutation) => {
      renderRoute("/daily-check?plantId=p-assigned&method=sensor");
      expect(await screen.findByTestId("mock-manual-card")).toHaveAttribute(
        "data-selected-tent-id",
        "t2",
      );
      const staleManualSave = screen.getByTestId("mock-manual-save");

      activityRenderMock.mockClear();
      quickLogRenderMock.mockClear();
      useSensorReadingsMock.mockClear();
      manualSaveTargetMock.mockClear();
      if (mutation === "remove-tent") {
        mockTents = mockTents.filter((tent) => tent.id !== "t2");
      } else {
        mockPlants =
          mutation === "remove"
            ? mockPlants.filter((plant) => plant.id !== "p-assigned")
            : mockPlants.map((plant) =>
                plant.id === "p-assigned" ? { ...plant, tent_id: null } : plant,
              );
      }
      refreshData();

      await waitFor(() => expect(screen.queryByTestId("mock-manual-card")).not.toBeInTheDocument());
      expect(staleManualSave).not.toBeInTheDocument();
      expect(screen.getByTestId("daily-grow-check-choose-snapshot")).toBeDisabled();
      expectEveryActivityRenderToUse(mutation === "remove" ? null : "p-assigned", null);
      for (const [props] of quickLogRenderMock.mock.calls) {
        expect(props).toMatchObject({ open: false });
        expect(props.prefill).toMatchObject({
          plantId: mutation === "remove" ? null : "p-assigned",
          tentId: null,
        });
      }
      expect(useSensorReadingsMock).not.toHaveBeenCalledWith("t2", 50);
      expect(manualSaveTargetMock).not.toHaveBeenCalled();
    },
  );

  it("reconciles a route plant tent reassignment before the old target can save", async () => {
    renderRoute("/daily-check?plantId=p-assigned&method=sensor");
    expect(await screen.findByTestId("mock-manual-card")).toHaveAttribute(
      "data-selected-tent-id",
      "t2",
    );
    const staleManualSave = screen.getByTestId("mock-manual-save");

    activityRenderMock.mockClear();
    quickLogRenderMock.mockClear();
    useSensorReadingsMock.mockClear();
    manualSaveTargetMock.mockClear();
    mockPlants = mockPlants.map((plant) =>
      plant.id === "p-assigned" ? { ...plant, tent_id: "t1" } : plant,
    );
    refreshData();

    const card = await screen.findByTestId("mock-manual-card");
    expect(card).toHaveAttribute("data-default-tent-id", "t1");
    expect(card).toHaveAttribute("data-selected-tent-id", "t1");
    expect(card).toHaveAttribute("data-tent-options", "t1");
    expect(staleManualSave).not.toBeInTheDocument();
    expectEveryActivityRenderToUse("p-assigned", "t1");
    for (const [props] of quickLogRenderMock.mock.calls) {
      expect(props.prefill).toMatchObject({ plantId: "p-assigned", tentId: "t1" });
    }
    expect(useSensorReadingsMock).toHaveBeenCalledWith("t1", 50);
    expect(useSensorReadingsMock).not.toHaveBeenCalledWith("t2", 50);
    fireEvent.click(screen.getByTestId("mock-manual-save"));
    expect(manualSaveTargetMock).toHaveBeenCalledTimes(1);
    expect(manualSaveTargetMock).toHaveBeenCalledWith("t1");
  });

  it("fails closed when a locally selected plant loses its assigned tent after refresh", async () => {
    renderRoute("/daily-check");
    await choosePlant(/Assigned plant with a deliberately long mobile proof name/i);
    fireEvent.click(screen.getByTestId("daily-grow-check-choose-snapshot"));
    expect(await screen.findByTestId("mock-manual-card")).toHaveAttribute(
      "data-selected-tent-id",
      "t2",
    );
    const staleManualSave = screen.getByTestId("mock-manual-save");

    activityRenderMock.mockClear();
    quickLogRenderMock.mockClear();
    useSensorReadingsMock.mockClear();
    manualSaveTargetMock.mockClear();
    mockPlants = mockPlants.map((plant) =>
      plant.id === "p-assigned" ? { ...plant, tent_id: null } : plant,
    );
    refreshData();

    await waitFor(() => expect(screen.queryByTestId("mock-manual-card")).not.toBeInTheDocument());
    expect(staleManualSave).not.toBeInTheDocument();
    expect(screen.getByTestId("daily-grow-check-choose-snapshot")).toBeDisabled();
    expectEveryActivityRenderToUse("p-assigned", null);
    expect(useSensorReadingsMock).not.toHaveBeenCalledWith("t2", 50);
    expect(manualSaveTargetMock).not.toHaveBeenCalled();
  });

  it("uses the scoped empty state when the current grow has no selectable plants", async () => {
    mockUrlGrowId = "g-empty";
    mockTents = [{ id: "t-empty", name: "Empty grow tent", grow_id: "g-empty" }];
    renderNavigableRoute("/daily-check?growId=g-empty");
    expect(await screen.findByTestId("daily-grow-check-empty-no-plants-actions")).toBeVisible();
    expect(screen.queryByTestId("daily-grow-check-target-selector")).not.toBeInTheDocument();
  });

  it("locks manual sensor entry to the selected plant's one assigned tent", async () => {
    renderRoute("/daily-check?plantId=p-assigned&method=sensor");
    const card = await screen.findByTestId("mock-manual-card");
    expect(card).toHaveAttribute("data-default-tent-id", "t2");
    expect(card).toHaveAttribute("data-tent-options", "t2");
  });

  it("keeps all manual sensor tent options for an explicit tent-only check", async () => {
    renderRoute("/daily-check");
    await waitFor(() =>
      expect(screen.getByTestId("daily-grow-check-choose-snapshot")).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByTestId("daily-grow-check-choose-snapshot"));
    const card = await screen.findByTestId("mock-manual-card");
    expect(card).toHaveAttribute("data-default-tent-id", "t1");
    expect(card).toHaveAttribute("data-tent-options", "t1,t2,t-g2,t-legacy");
  });

  it("never mounts manual sensor choices for an untented route plant", async () => {
    renderRoute("/daily-check?plantId=p-untented&method=sensor");
    expect(await screen.findByTestId("daily-grow-check-choose-snapshot")).toBeDisabled();
    expect(screen.queryByTestId("mock-manual-card")).not.toBeInTheDocument();
  });

  it.each([
    ["unknown", "/daily-check?plantId=missing&method=note"],
    ["out-of-scope", "/daily-check?plantId=p-other-grow&growId=g1&method=note"],
    ["out-of-scope", "/daily-check?plantId=p-legacy&growId=g1&method=note"],
  ])("fails closed for %s route targets", async (status, path) => {
    if (status === "out-of-scope") mockUrlGrowId = "g1";
    renderRoute(path);

    const rejection = await screen.findByTestId("daily-grow-check-plant-rejected");
    expect(rejection).toHaveAttribute("data-rejection-status", status);
    expect(screen.getByTestId("mock-quicklog")).toHaveAttribute("data-open", "0");
    expect(screen.getByTestId("mock-quicklog")).toHaveAttribute("data-prefill-plant-id", "");
    expect(screen.getByTestId("daily-check-all-activities")).toHaveAttribute("data-plant-id", "");
    expect(screen.getByTestId("daily-check-all-activities")).toHaveAttribute("data-tent-id", "");
    expect(screen.getByTestId("daily-grow-check-choose-snapshot")).toBeDisabled();
  });

  it("uses the effective tent in the post-submit timeline continuity link", async () => {
    renderRoute("/daily-check?plantId=p-assigned");
    await waitFor(() =>
      expect(screen.getByTestId("daily-check-all-activities")).toHaveAttribute(
        "data-tent-id",
        "t2",
      ),
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent("verdant:entry-created", {
          detail: { createdAt: "2026-07-20T12:00:00.000Z" },
        }),
      );
    });
    const timeline = await screen.findByTestId("daily-grow-check-post-submit-timeline");
    const href = timeline.getAttribute("href");
    expect(href).toContain("plantId=p-assigned");
    expect(href).toContain("tentId=t2");
    expect(href).not.toContain("tentId=t1");
  });
});
