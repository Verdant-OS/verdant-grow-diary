import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { buildPrivateGrowQueryKey } from "@/lib/growDataQueryKeyRules";
import { clearGrowDataMeta } from "@/hooks/useGrowData";
import {
  PLANT_DETAIL_LOAD_TIMEOUT_MS,
  classifyPlantDetailLoadState,
} from "@/lib/plantDetailLoadTimeoutRules";
import type { Plant } from "@/mock";

const fixture = vi.hoisted(() => ({ fetchPlant: vi.fn() }));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "owner-1" } }) }));
vi.mock("@/lib/growRepo", () => ({ fetchPlant: fixture.fetchPlant }));
vi.mock("@/hooks/useGrowData", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useGrowData")>()),
  useGrowTent: () => ({ data: null }),
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

// Run the real plant query, source disclosure, routes, header and blocked-state
// presenter. Isolate unrelated cards and their IO at the child boundary.
vi.mock("@/components/PlantCultivarReferenceHint", () => ({ default: () => null }));
vi.mock("@/components/StageBadge", () => ({ default: () => null }));
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

vi.mock("@/components/AssignTentDialog", () => ({ default: () => null }));

import PlantDetail from "@/pages/PlantDetail";

const plant: Plant = {
  id: "plant-1",
  name: "Existing plant",
  strain: "Test cultivar",
  stage: "veg",
  startedAt: "2026-07-01T00:00:00.000Z",
  tentId: "tent-1",
  growId: "grow-1",
  isArchived: false,
  lastNote: "",
  photo: "",
  health: "healthy",
};
const plantKey = buildPrivateGrowQueryKey("owner-1", ["plant", plant.id]);
const clients: QueryClient[] = [];
function deferredPlant() {
  let resolve!: (value: Plant | null) => void;
  const promise = new Promise<Plant | null>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function renderPage(options: { cached?: Plant; path?: string } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  if (options.cached) client.setQueryData(plantKey, options.cached);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[options.path ?? "/plants/plant-1?tentId=tent-1"]}>
        <Routes>
          <Route path="/plants/:id" element={<PlantDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}
function expectNoFalseAbsence() {
  expect(screen.queryByText("Plant not found")).not.toBeInTheDocument();
  expect(screen.queryByText("No real plants yet")).not.toBeInTheDocument();
}
function expectWaiting() {
  expect(screen.getByTestId("plant-detail-paused")).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("Waiting for connection");
  expectNoFalseAbsence();
  expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
}

beforeEach(() => {
  clearGrowDataMeta();
  fixture.fetchPlant.mockReset().mockResolvedValue(plant);
  onlineManager.setOnline(true);
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  onlineManager.setOnline(true);
  clearGrowDataMeta();
  vi.useRealTimers();
});

describe("Plant Detail first paused read", () => {
  it("waits without claiming absence and resumes the exact plant on reconnect", async () => {
    onlineManager.setOnline(false);
    const client = renderPage();
    expect(client.getQueryState(plantKey)).toMatchObject({
      status: "pending",
      fetchStatus: "paused",
    });
    expect(fixture.fetchPlant).not.toHaveBeenCalled();
    expectWaiting();
    expect(screen.getByRole("link", { name: "Back to tent" })).toHaveAttribute(
      "href",
      "/tents/tent-1",
    );
    expect(screen.getByRole("link", { name: "Back to plants" })).toHaveAttribute("href", "/plants");
    act(() => onlineManager.setOnline(true));
    expect(await screen.findByRole("heading", { name: plant.name })).toBeVisible();
    expect(fixture.fetchPlant).toHaveBeenCalledExactlyOnceWith(plant.id);
    expectNoFalseAbsence();
  });
  it("does not turn a paused read into a timeout failure", () => {
    vi.useFakeTimers();
    onlineManager.setOnline(false);
    renderPage();
    act(() => {
      vi.advanceTimersByTime(PLANT_DETAIL_LOAD_TIMEOUT_MS * 2);
    });
    expectWaiting();
    expect(screen.queryByTestId("plant-detail-loading-slow")).not.toBeInTheDocument();
    expect(fixture.fetchPlant).not.toHaveBeenCalled();
  });
  it("moves from waiting to loading while the resumed read remains unresolved", async () => {
    const read = deferredPlant();
    fixture.fetchPlant.mockReturnValue(read.promise);
    onlineManager.setOnline(false);
    renderPage();
    expectWaiting();
    act(() => onlineManager.setOnline(true));
    expect(await screen.findByTestId("plant-detail-loading")).toHaveAttribute("aria-busy", "true");
    expectNoFalseAbsence();
    await act(async () => read.resolve(plant));
    expect(await screen.findByRole("heading", { name: plant.name })).toBeVisible();
  });
  it("shows not found only after reconnect completes a successful empty read", async () => {
    fixture.fetchPlant.mockResolvedValue(null);
    onlineManager.setOnline(false);
    renderPage();
    expectWaiting();
    act(() => onlineManager.setOnline(true));
    expect(await screen.findByText("Plant not found")).toBeVisible();
    expect(screen.getByText("No real plants yet")).toBeVisible();
    expect(fixture.fetchPlant).toHaveBeenCalledExactlyOnceWith(plant.id);
  });
  it("shows a failed read with Retry after reconnect and retries the same plant", async () => {
    fixture.fetchPlant
      .mockRejectedValueOnce(new Error("private read detail"))
      .mockResolvedValue(plant);
    onlineManager.setOnline(false);
    renderPage();
    expectWaiting();
    act(() => onlineManager.setOnline(true));
    expect(await screen.findByText("Couldn't load this plant")).toBeVisible();
    expectNoFalseAbsence();
    expect(screen.queryByText("private read detail")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: plant.name })).toBeVisible();
    expect(fixture.fetchPlant.mock.calls).toEqual([[plant.id], [plant.id]]);
  });
  it("keeps an already resolved plant visible during a paused refresh", async () => {
    onlineManager.setOnline(false);
    const client = renderPage({ cached: plant });
    await waitFor(() => expect(client.getQueryState(plantKey)?.fetchStatus).toBe("paused"));
    expect(screen.getByRole("heading", { name: plant.name })).toBeVisible();
    expectNoFalseAbsence();
    expect(fixture.fetchPlant).not.toHaveBeenCalled();
  });
  it("preserves archived state when the resumed read resolves an archived plant", async () => {
    fixture.fetchPlant.mockResolvedValue({ ...plant, isArchived: true });
    onlineManager.setOnline(false);
    renderPage();
    expectWaiting();
    act(() => onlineManager.setOnline(true));
    expect(await screen.findByText("Plant archived")).toBeVisible();
    expectNoFalseAbsence();
    expect(screen.getByRole("link", { name: "View archived timeline" })).toHaveAttribute(
      "href",
      "/plants/plant-1?tentId=tent-1&mode=archived-timeline",
    );
  });
  it("preserves the grow-scope guard after the plant actually resolves", async () => {
    onlineManager.setOnline(false);
    renderPage({ path: "/plants/plant-1?growId=other-grow&tentId=tent-1" });
    expectWaiting();
    act(() => onlineManager.setOnline(true));
    expect(await screen.findByText("Plant not found")).toBeVisible();
    expect(screen.queryByRole("heading", { name: plant.name })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Back to tent" })).not.toBeInTheDocument();
  });
});

describe("unresolved query classification", () => {
  it("keeps pending but not fetching reads unresolved", () => {
    expect(
      classifyPlantDetailLoadState({
        isLoading: false,
        isPending: true,
        isPaused: false,
        isError: false,
        hasPlant: false,
        loadTimedOut: false,
      }),
    ).toBe("loading");
  });
  it("does not let a prior timeout override first-read pause", () => {
    expect(
      classifyPlantDetailLoadState({
        isLoading: false,
        isPending: true,
        isPaused: true,
        isError: false,
        hasPlant: false,
        loadTimedOut: true,
      }),
    ).toBe("paused");
  });
  it("does not treat a paused first read as not-found when isLoading is false", () => {
    // React Query reports isLoading=false for paused queries even though the
    // first read is still unresolved — the bug this slice fixes.
    const state = classifyPlantDetailLoadState({
      isLoading: false,
      isPending: true,
      isPaused: true,
      isError: false,
      hasPlant: false,
      loadTimedOut: false,
    });
    expect(state).toBe("paused");
    expect(state).not.toBe("not-found");
  });

  it("does not treat isPaused alone as unresolved when the query is no longer pending", () => {
    // Guard against over-fitting on fetchStatus: a settled query must not
    // stay paused just because a stale isPaused flag was passed through.
    expect(
      classifyPlantDetailLoadState({
        isLoading: false,
        isPending: false,
        isPaused: true,
        isError: false,
        hasPlant: false,
        loadTimedOut: false,
      }),
    ).toBe("not-found");
  });
});
