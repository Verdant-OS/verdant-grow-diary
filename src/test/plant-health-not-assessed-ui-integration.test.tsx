/**
 * #2171 integration: corrupted or missing stored health must read "Not assessed yet"
 * on /plants and on the plant profile, never as "unknown" or a raw ISO timestamp.
 * Complements plant-health-status-label.test.ts (pure rules) and the locked
 * page-level pins in plant-detail-health-display / plant-health-unknown-rendering.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { mapPlantRow } from "@/lib/growAdapters";
import type { PlantRow } from "@/lib/db";
import type { Plant } from "@/mock";
import { clearGrowDataMeta } from "@/hooks/useGrowData";
import { PLANT_HEALTH_NOT_ASSESSED_LABEL } from "@/lib/plantHealthRules";

const CORRUPTED_HEALTH = "2026-10-21T15:51:54.957+00:00";

const plantDetailFixture = vi.hoisted(() => ({
  fetchPlant: vi.fn(),
  plants: [] as Plant[],
}));

vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "owner-1" } }) }));
vi.mock("@/lib/growRepo", () => ({ fetchPlant: plantDetailFixture.fetchPlant }));
vi.mock("@/hooks/useGrowData", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useGrowData")>()),
  useGrowTent: () => ({ data: null }),
  useGrowPlants: () => ({
    data: plantDetailFixture.plants,
    status: "success",
    fetchStatus: "idle",
    isLoading: false,
    isPending: false,
    isError: false,
    isFetching: false,
    isPlaceholderData: false,
    error: null,
    refetch: vi.fn(),
  }),
  useGrowTents: () => ({
    data: [],
    status: "success",
    fetchStatus: "idle",
    isLoading: false,
    isPending: false,
    isError: false,
    isFetching: false,
    isPlaceholderData: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: { capabilities: {} },
  }),
}));
vi.mock("@/hooks/useAlertDoctorCreditGateReads", () => ({
  useAlertDoctorCreditGateReads: () => ({}),
}));
vi.mock("@/hooks/usePlantGalleryPhotoCount", () => ({ usePlantGalleryPhotoCount: () => 0 }));
vi.mock("@/lib/plantProfileMetadataUpdate", () => ({ updatePlantProfileMetadata: vi.fn() }));
vi.mock("@/hooks/use-diary-entries", () => ({
  useDiaryEntries: () => ({
    data: [],
    status: "success",
    fetchStatus: "idle",
    isLoading: false,
    isPending: false,
    isError: false,
    isFetching: false,
    isPlaceholderData: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({
    data: [],
    status: "success",
    fetchStatus: "idle",
    isLoading: false,
    isPending: false,
    isError: false,
    isFetching: false,
    isPlaceholderData: false,
    error: null,
    refetch: vi.fn(),
  }),
  useSensorReadingsByTents: () => ({
    byTent: {},
    statusByTent: {},
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: null,
    scopedGrow: null,
    scopedGrowName: null,
    isValidScopedGrow: false,
    backHref: null,
  }),
}));
vi.mock("@/store/grows", () => ({ useGrows: () => ({ grows: [], loading: false, error: null }) }));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => undefined }));
vi.mock("@/components/CreatePlantDialog", () => ({ default: () => null }));

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
vi.mock("@/components/AssignTentDialog", () => ({ default: () => null }));
vi.mock("@/components/PlantBlueprintOverlaySection", () => ({
  PlantBlueprintOverlaySection: () => null,
}));
vi.mock("@/components/PlantMemoryEpisodesSection", () => ({
  PlantMemoryEpisodesSection: () => null,
}));

import PlantDetail from "@/pages/PlantDetail";
import Plants from "@/pages/Plants";

function sourceRow(health: unknown): PlantRow {
  return {
    id: "plant-1",
    user_id: "owner-1",
    tent_id: "tent-1",
    name: "Aurora",
    strain: "Test cultivar",
    grow_id: "grow-1",
    stage: "veg",
    started_at: "2026-08-01T00:00:00Z",
    health,
    photo_url: null,
    last_note: "Last note",
    is_archived: false,
    schema_version: 1,
    medium: null,
    pot_size: null,
    pheno_hunt_id: null,
    plant_type: "unknown",
    candidate_label: null,
    candidate_number: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-09-16T00:00:00Z",
  } as unknown as PlantRow;
}

function sourcePlant(health: unknown): Plant {
  return mapPlantRow(sourceRow(health));
}

function renderPlantDetail(health: unknown) {
  const plant = mapPlantRow(sourceRow(health));
  plantDetailFixture.fetchPlant.mockResolvedValue(plant);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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

function renderPlantsList(health: unknown) {
  plantDetailFixture.plants = [sourcePlant(health)];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/plants"]}>
        <Plants />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  clearGrowDataMeta();
  plantDetailFixture.fetchPlant.mockReset();
  plantDetailFixture.plants = [];
});
afterEach(() => {
  cleanup();
  clearGrowDataMeta();
});

describe("plant health not assessed UI integration (#2171)", () => {
  it("plant profile shows Not assessed yet for a corrupted ISO health value", async () => {
    renderPlantDetail(CORRUPTED_HEALTH);
    await waitFor(() => expect(screen.getByText("Aurora")).toBeInTheDocument());
    const value = screen.getByTestId("plant-detail-health");
    expect(value.textContent).toBe(PLANT_HEALTH_NOT_ASSESSED_LABEL);
    expect(value.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("plants list card shows Not assessed yet for a corrupted ISO health value", () => {
    renderPlantsList(CORRUPTED_HEALTH);
    expect(
      screen.getByText(`Plant health: ${PLANT_HEALTH_NOT_ASSESSED_LABEL}`),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Plant health: 2026-/)).not.toBeInTheDocument();
    expect(
      screen.getByLabelText(
        `Plant health status: ${PLANT_HEALTH_NOT_ASSESSED_LABEL}. Sensor status is shown separately.`,
      ),
    ).toBeInTheDocument();
  });
});
