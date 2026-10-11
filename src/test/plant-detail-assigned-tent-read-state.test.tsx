import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { buildPrivateGrowQueryKey } from "@/lib/growDataQueryKeyRules";
import type { Tent } from "@/mock";

const fixture = vi.hoisted(() => ({
  tentId: "tent-1" as string | undefined,
  fetchTent: vi.fn(),
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "owner-1" } }) }));
vi.mock("@/lib/growRepo", () => ({ fetchTent: fixture.fetchTent }));
vi.mock("@/hooks/useGrowData", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useGrowData")>()),
  useGrowPlant: () => ({
    data: {
      id: "plant-1",
      name: "Test plant",
      strain: "Test cultivar",
      stage: "veg",
      startedAt: "2026-07-01T00:00:00.000Z",
      tentId: fixture.tentId,
      growId: "grow-1",
      isArchived: false,
      lastNote: "No recent note",
      photo: null,
      health: "ok",
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: true,
    lookupFailed: false,
    entitlement: { capabilities: {} },
  }),
}));
vi.mock("@/hooks/useAlertDoctorCreditGateReads", () => ({
  useAlertDoctorCreditGateReads: () => ({}),
}));
vi.mock("@/hooks/usePlantGalleryPhotoCount", () => ({ usePlantGalleryPhotoCount: () => 0 }));
vi.mock("@/lib/plantProfileMetadataUpdate", () => ({ updatePlantProfileMetadata: vi.fn() }));

// Isolate the page's Tent section from unrelated cards and their IO. The real
// useGrowTent, QueryClient, routes, section markup and Retry button run below.
vi.mock("@/components/PageHeader", () => ({ default: () => null }));
vi.mock("@/components/PlantCultivarReferenceHint", () => ({ default: () => null }));
vi.mock("@/components/StageBadge", () => ({ default: () => null }));
vi.mock("@/components/EmptyState", () => ({ default: () => null }));
vi.mock("@/components/GrowDataSourceDisclosure", () => ({ default: () => null }));
vi.mock("@/components/PlantDetailDataSourceDisclosure", () => ({ default: () => null }));
vi.mock("@/components/PlantGrowContextRescueCard", () => ({ default: () => null }));
vi.mock("@/components/PlantTentEnvironmentPanel", () => ({ default: () => null }));
vi.mock("@/components/WateringCadenceHistoryStrip", () => ({ default: () => null }));
vi.mock("@/components/DrybackMonitoringStrip", () => ({ default: () => null }));
vi.mock("@/components/PlantRecentActivityPanel", () => ({ default: () => null }));
vi.mock("@/components/PlantRelativeTimelineSection", () => ({ default: () => null }));
vi.mock("@/components/ManualSnapshotTimelineSection", () => ({ default: () => null }));
vi.mock("@/components/TimelineMemorySection", () => ({ default: () => null }));
vi.mock("@/components/QuickLogGroupedTimelineSection", () => ({ default: () => null }));
vi.mock("@/components/PlantDailyGrowCheckHistoryCard", () => ({ default: () => null }));
vi.mock("@/components/DailyGrowCheckOnboardingCard", () => ({ default: () => null }));
vi.mock("@/components/PlantDailyGrowCheckConsistencyCard", () => ({ default: () => null }));
vi.mock("@/components/PlantRecentMoveCard", () => ({ default: () => null }));
vi.mock("@/components/PlantAssignedTentAlertsPanel", () => ({ default: () => null }));
vi.mock("@/components/DeepLinkAnchorRestorer", () => ({ default: () => null }));
vi.mock("@/components/PlantAssignedTentActionsPanel", () => ({ default: () => null }));
vi.mock("@/components/PlantStatusStrip", () => ({ default: () => null }));
vi.mock("@/components/QuickLogV2Fab", () => ({ default: () => null }));
vi.mock("@/components/PlantQuickStatusStrip", () => ({ default: () => null }));
vi.mock("@/components/PlantLogStreakMarker", () => ({ default: () => null }));
vi.mock("@/components/PlantDetailQuickActions", () => ({ default: () => null }));
vi.mock("@/components/PlantDetailPhotoStrip", () => ({ default: () => null }));
vi.mock("@/components/PhotoDiagnosisReviewDialog", () => ({ default: () => null }));
vi.mock("@/components/PlantDetailRecentActivityRecap", () => ({ default: () => null }));
vi.mock("@/components/PlantDetailRecentActionResponse", () => ({ default: () => null }));
vi.mock("@/components/PlantPendingOutcomeNotice", () => ({ default: () => null }));
vi.mock("@/components/PendingCheckpointBanner", () => ({ default: () => null }));
vi.mock("@/components/PlantDetailHarvestWatchCard", () => ({ default: () => null }));
vi.mock("@/components/PlantDetailHarvestEvidenceReportMount", () => ({ default: () => null }));
vi.mock("@/components/PlantDetailWhatsMissing", () => ({ default: () => null }));
vi.mock("@/components/PlantDetailAiDoctorReadiness", () => ({ default: () => null }));
vi.mock("@/components/PlantDetailAiDoctorContextPanel", () => ({ default: () => null }));
vi.mock("@/components/PlantDetailAiDoctorLiveReview", () => ({ default: () => null }));
vi.mock("@/components/PlantDetailAiDoctorContextReadinessMount", () => ({ default: () => null }));
vi.mock("@/components/PlantProfileContextCard", () => ({ default: () => null }));
vi.mock("@/components/PlantDetailTimelineEvidenceReadinessLaunch", () => ({ default: () => null }));
vi.mock("@/components/PlantDetailAskDoctorHelper", () => ({ default: () => null }));
vi.mock("@/components/PlantDetailSectionNav", () => ({ default: () => null }));
vi.mock("@/components/PlantDetailDisclosureSection", () => ({ default: () => null }));
vi.mock("@/components/PlantCardActionsMenu", () => ({ default: () => null }));
vi.mock("@/components/OneTentLoopNextStepCard", () => ({ default: () => null }));
vi.mock("@/components/PlantAiDoctorSessionsPanel", () => ({ default: () => null }));
vi.mock("@/components/PlantPhoto", () => ({ default: () => null }));
vi.mock("@/components/PlantQuickLog", () => ({ default: () => null }));
vi.mock("@/components/PlantManualSensorFreshnessCard", () => ({ default: () => null }));
vi.mock("@/components/PlantSensorSourceBreakdownCard", () => ({ default: () => null }));
vi.mock("@/components/PlantBlueprintOverlaySection", () => ({
  PlantBlueprintOverlaySection: () => null,
}));
vi.mock("@/components/PlantMemoryEpisodesSection", () => ({
  PlantMemoryEpisodesSection: () => null,
}));
vi.mock("@/components/AssignTentDialog", () => ({
  default: ({
    plantId,
    growId,
    currentTentId,
  }: {
    plantId: string;
    growId: string | null;
    currentTentId: string | null;
  }) => (
    <button
      data-testid="assignment-dialog-context"
      data-plant={plantId}
      data-grow={growId}
      data-current-tent={currentTentId ?? ""}
    >
      {currentTentId ? "Move to tent" : "Assign to tent"}
    </button>
  ),
}));

import PlantDetail from "@/pages/PlantDetail";

const assignedTent: Tent = {
  id: "tent-1",
  name: "Assigned canopy",
  brand: "",
  size: "",
  stage: "veg",
  light: { on: false, schedule: "", wattage: 0 },
  alertCount: 0,
  growId: "grow-1",
};
const tentKey = buildPrivateGrowQueryKey("owner-1", ["tent", assignedTent.id]);
const clients: QueryClient[] = [];

function deferredTent() {
  let resolve!: (value: Tent | null) => void;
  const promise = new Promise<Tent | null>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function renderPage(cached?: Tent) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  if (cached) client.setQueryData(tentKey, cached);
  const page = () => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/plants/plant-1"]}>
        <Routes>
          <Route path="/plants/:id" element={<PlantDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(page());
  return { ...view, client, rerenderPage: () => view.rerender(page()) };
}
function section() {
  return within(screen.getByTestId("plant-detail-tent"));
}
function expectAssignment(tentId = assignedTent.id) {
  expect(section().queryByText("No tent assigned.")).not.toBeInTheDocument();
  expect(section().getByRole("link", { name: /view tent/i })).toHaveAttribute(
    "href",
    "/tents/" + tentId,
  );
  const dialog = section().getByTestId("assignment-dialog-context");
  expect(dialog).toHaveAttribute("data-current-tent", tentId);
  expect(dialog).toHaveAttribute("data-plant", "plant-1");
  expect(dialog).toHaveAttribute("data-grow", "grow-1");
  expect(dialog).toHaveTextContent("Move to tent");
}

beforeEach(() => {
  fixture.tentId = assignedTent.id;
  fixture.fetchTent.mockReset().mockResolvedValue(assignedTent);
  onlineManager.setOnline(true);
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  onlineManager.setOnline(true);
});

describe("Plant Detail assigned-tent read states", () => {
  it("preserves genuine unassigned copy and an empty assignment context without querying", () => {
    fixture.tentId = undefined;
    renderPage();
    expect(section().getByText("No tent assigned.")).toBeVisible();
    expect(section().queryByRole("link", { name: /view tent/i })).toBeNull();
    expect(section().getByTestId("assignment-dialog-context")).toHaveAttribute(
      "data-current-tent",
      "",
    );
    expect(fixture.fetchTent).not.toHaveBeenCalled();
  });
  it("retains assignment while the first details read is loading", async () => {
    const read = deferredTent();
    fixture.fetchTent.mockReturnValue(read.promise);
    renderPage();
    expect(section().getByRole("status")).toHaveTextContent("Loading assigned tent details");
    expectAssignment();
    await act(async () => read.resolve(assignedTent));
    expect(await section().findByText(assignedTent.name)).toBeVisible();
    expectAssignment();
  });
  it("waits for connection when the first read is paused and resumes on reconnect", async () => {
    onlineManager.setOnline(false);
    const { client } = renderPage();
    expect(client.getQueryState(tentKey)?.fetchStatus).toBe("paused");
    expect(section().getByRole("status")).toHaveTextContent(
      "Waiting for connection to load assigned tent details",
    );
    expectAssignment();
    expect(fixture.fetchTent).not.toHaveBeenCalled();
    act(() => onlineManager.setOnline(true));
    expect(await section().findByText(assignedTent.name)).toBeVisible();
    expectAssignment();
    expect(fixture.fetchTent).toHaveBeenCalledExactlyOnceWith(assignedTent.id);
  });
  it("shows unavailable after a failed first read and retries the same assigned tent", async () => {
    fixture.fetchTent
      .mockRejectedValueOnce(new Error("private query detail"))
      .mockResolvedValue(assignedTent);
    renderPage();
    await waitFor(() =>
      expect(section().getByRole("status")).toHaveTextContent("Assigned tent details unavailable"),
    );
    expectAssignment();
    expect(screen.queryByText(/private query detail/)).toBeNull();
    fireEvent.click(section().getByRole("button", { name: "Retry" }));
    expect(await section().findByText(assignedTent.name)).toBeVisible();
    expect(fixture.fetchTent.mock.calls).toEqual([[assignedTent.id], [assignedTent.id]]);
    expect(section().queryByRole("button", { name: "Retry" })).toBeNull();
    expectAssignment();
  });
  it("treats a successful null row as unavailable details, preserving the assignment", async () => {
    fixture.fetchTent.mockResolvedValue(null);
    renderPage();
    await waitFor(() =>
      expect(section().getByRole("status")).toHaveTextContent("Assigned tent details unavailable"),
    );
    expectAssignment();
    fixture.fetchTent.mockResolvedValue(assignedTent);
    fireEvent.click(section().getByRole("button", { name: "Retry" }));
    expect(await section().findByText(assignedTent.name)).toBeVisible();
  });
  it("retains the resolved tent name, link and move context", async () => {
    renderPage();
    expect(await section().findByText(assignedTent.name)).toBeVisible();
    expectAssignment();
    expect(section().queryByRole("status")).toBeNull();
  });
  it("marks cached details after a failed refresh and clears the warning only after recovery", async () => {
    fixture.fetchTent
      .mockRejectedValueOnce(new Error("refresh failed"))
      .mockResolvedValue({ ...assignedTent, name: "Updated canopy" });
    renderPage(assignedTent);
    await waitFor(() =>
      expect(section().getByRole("status")).toHaveTextContent(
        "Could not refresh assigned tent details. Showing cached details.",
      ),
    );
    expect(section().getByText(assignedTent.name)).toBeVisible();
    expectAssignment();
    fireEvent.click(section().getByRole("button", { name: "Retry" }));
    expect(await section().findByText("Updated canopy")).toBeVisible();
    expect(section().queryByRole("status")).toBeNull();
    expectAssignment();
  });
  it("marks cached details while a refresh is paused", () => {
    onlineManager.setOnline(false);
    renderPage(assignedTent);
    expect(section().getByRole("status")).toHaveTextContent(
      "Waiting for connection to refresh assigned tent details. Showing cached details.",
    );
    expect(section().getByText(assignedTent.name)).toBeVisible();
    expectAssignment();
  });
  it("marks cached details while a refresh is in flight", async () => {
    const read = deferredTent();
    fixture.fetchTent.mockReturnValue(read.promise);
    renderPage(assignedTent);
    expect(section().getByRole("status")).toHaveTextContent(
      "Refreshing assigned tent details. Showing cached details.",
    );
    expectAssignment();
    await act(async () => read.resolve(assignedTent));
  });
  it("does not display a different tent row or route the assignment to it", async () => {
    fixture.fetchTent.mockResolvedValue({
      ...assignedTent,
      id: "other-tent",
      name: "Wrong canopy",
    });
    renderPage();
    await waitFor(() =>
      expect(section().getByRole("status")).toHaveTextContent("Assigned tent details unavailable"),
    );
    expect(section().queryByText("Wrong canopy")).toBeNull();
    expectAssignment();
  });
  it("ignores a late response for the previous assignment after the plant moves", async () => {
    const firstRead = deferredTent();
    const nextRead = deferredTent();
    fixture.fetchTent.mockImplementation((id: string) =>
      id === assignedTent.id ? firstRead.promise : nextRead.promise,
    );
    const { rerenderPage } = renderPage();
    expectAssignment();
    fixture.tentId = "tent-2";
    rerenderPage();
    expectAssignment("tent-2");
    await act(async () => firstRead.resolve(assignedTent));
    expect(section().queryByText(assignedTent.name)).toBeNull();
    expect(section().getByRole("status")).toHaveTextContent("Loading assigned tent details");
    expectAssignment("tent-2");
    await act(async () => nextRead.resolve({ ...assignedTent, id: "tent-2", name: "Next canopy" }));
    expect(await section().findByText("Next canopy")).toBeVisible();
    expectAssignment("tent-2");
    expect(fixture.fetchTent.mock.calls).toEqual([[assignedTent.id], ["tent-2"]]);
  });
});
