/**
 * #2151 follow-up: Plant Detail's photo-history lookup (an unbounded
 * diary_entries read plus private-photo signing) runs only for the active
 * plant view, not for loading, not-found or archived URLs, and the photo
 * strip reuses the page's single lookup instead of mounting a second one.
 * The hero fallback renders the already-validated diary display URL directly.
 */
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { clearGrowDataMeta } from "@/hooks/useGrowData";
import type { Plant } from "@/mock";

const fixture = vi.hoisted(() => ({ fetchPlant: vi.fn() }));
const probes = vi.hoisted(() => ({
  hookCalls: [] as Array<{ plantId: string | null; enabled: boolean | undefined }>,
  stripProps: [] as Array<Record<string, unknown>>,
  stripResult: {
    diary: {},
    display: {},
    items: [] as unknown[],
    hasPlantContext: true,
  },
}));
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
vi.mock("@/components/PlantDetailPhotoStrip", () => ({
  default: (props: Record<string, unknown>) => {
    probes.stripProps.push(props);
    return null;
  },
}));
vi.mock("@/hooks/usePlantDetailPhotoStripItems", () => ({
  usePlantDetailPhotoStripItems: (plantId: string | null, options?: { enabled?: boolean }) => {
    probes.hookCalls.push({ plantId, enabled: options?.enabled });
    return probes.stripResult;
  },
}));
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
const clients: QueryClient[] = [];
function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/plants/plant-1?tentId=tent-1"]}>
        <Routes>
          <Route path="/plants/:id" element={<PlantDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  probes.hookCalls.length = 0;
  probes.stripProps.length = 0;
  fixture.fetchPlant.mockReset().mockResolvedValue(plant);
  onlineManager.setOnline(true);
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  clearGrowDataMeta();
  onlineManager.setOnline(true);
});

describe("Plant Detail photo-history lookup is deferred to the active view", () => {
  it("keeps the lookup disabled while the plant is loading", () => {
    fixture.fetchPlant.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(probes.hookCalls.length).toBeGreaterThan(0);
    expect(probes.hookCalls.every((call) => call.enabled === false)).toBe(true);
  });

  it("never enables the lookup for a not-found plant URL", async () => {
    fixture.fetchPlant.mockResolvedValue(null);
    renderPage();
    await screen.findByText("Plant not found");
    expect(probes.hookCalls.every((call) => call.enabled === false)).toBe(true);
  });

  it("never enables the lookup for an archived plant URL", async () => {
    fixture.fetchPlant.mockResolvedValue({ ...plant, isArchived: true });
    renderPage();
    await waitFor(() => expect(fixture.fetchPlant).toHaveBeenCalled());
    await waitFor(() =>
      expect(probes.hookCalls.some((call) => call.plantId === plant.id)).toBe(true),
    );
    expect(probes.hookCalls.every((call) => call.enabled === false)).toBe(true);
    expect(probes.stripProps).toHaveLength(0);
  });

  it("enables one lookup for the active plant and hands it to the photo strip", async () => {
    renderPage();
    await waitFor(() => expect(probes.stripProps.length).toBeGreaterThan(0));
    const last = probes.hookCalls[probes.hookCalls.length - 1];
    expect(last).toEqual({ plantId: plant.id, enabled: true });
    expect(probes.stripProps[probes.stripProps.length - 1]?.photoStrip).toBe(probes.stripResult);
  });
});
