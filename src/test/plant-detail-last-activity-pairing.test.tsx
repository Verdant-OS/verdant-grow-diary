import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { mapPlantRow } from "@/lib/growAdapters";
import type { PlantRow } from "@/lib/db";
import { clearGrowDataMeta } from "@/hooks/useGrowData";

const fixture = vi.hoisted(() => ({
  fetchPlant: vi.fn(),
  recentActivity: { data: [] as unknown[], isPending: false, isError: false },
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "owner-1" } }) }));
vi.mock("@/lib/growRepo", () => ({ fetchPlant: fixture.fetchPlant }));
vi.mock("@/hooks/useGrowData", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useGrowData")>()),
  useGrowTent: () => ({ data: null }),
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
vi.mock("@/hooks/usePlantRecentActivity", () => ({
  usePlantRecentActivity: () => fixture.recentActivity,
}));

// Keep the real profile grid Health row; isolate unrelated cards and IO.
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

/**
 * Codex review on #1683: "Last activity" showed `plants.last_note` (the
 * grower's Edit Plant "Notes" field, which Quick Log never updates) next to a
 * time taken from the newest diary entry. Text and time now come from the
 * same diary row, and the profile note is shown under "Notes".
 */
function renderWith(lastNote: string, rows: unknown[]) {
  fixture.recentActivity = { data: rows, isPending: false, isError: false };
  fixture.fetchPlant.mockResolvedValue(
    mapPlantRow({
      id: "plant-1",
      user_id: "owner-1",
      tent_id: "tent-1",
      name: "Aurora",
      strain: "Test cultivar",
      grow_id: "grow-1",
      stage: "veg",
      started_at: "2026-08-01T00:00:00Z",
      health: "healthy",
      photo_url: null,
      last_note: lastNote,
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
    } as unknown as PlantRow),
  );
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

beforeEach(() => {
  clearGrowDataMeta();
  fixture.fetchPlant.mockReset();
});
afterEach(() => cleanup());

describe("Plant Detail last activity", () => {
  it("describes the newest diary entry, not the profile note", async () => {
    const at = new Date(Date.now() - 2 * 3600_000).toISOString();
    renderWith("Transplanted into 3 gal back in July", [
      {
        id: "d-1",
        entry_at: at,
        note: "Watered 1 L to runoff",
        details: { event_type: "watering" },
      },
    ]);
    const summary = await screen.findByTestId("plant-detail-last-activity-summary");
    expect(summary.textContent).toBe("Watering: Watered 1 L to runoff");
    expect(summary.textContent).not.toContain("Transplanted");
    await waitFor(() =>
      expect(screen.getByTestId("plant-detail-last-activity-age").textContent).toBe(
        "Updated about 2 hours ago",
      ),
    );
    expect(screen.getByTestId("plant-detail-profile-note").textContent).toBe(
      "Transplanted into 3 gal back in July",
    );
  });

  it("with no diary entries it claims no activity and still shows the profile note", async () => {
    renderWith("Clone from mother A", []);
    await waitFor(() =>
      expect(screen.getByTestId("plant-detail-last-activity-age").textContent).toBe(
        "No activity logged yet.",
      ),
    );
    expect(screen.queryByTestId("plant-detail-last-activity-summary")).toBeNull();
    expect(screen.getByTestId("plant-detail-profile-note").textContent).toBe("Clone from mother A");
  });
});
