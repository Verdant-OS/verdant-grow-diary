/**
 * Plant Detail "Add first snapshot" / "Update" must reach a writable
 * manual-reading form (#2081 Codex P1/P2). The shared Quick Log editor defers
 * manual sensor persistence (`canPersistManualSensor = false`), so the CTA has
 * to keep opening PlantQuickLog, whose Manual readings fields save through the
 * single quicklog_save_manual path (mocked here at useQuickLogV2Save).
 *
 * Runs the real PlantDetail page and the real PlantQuickLog. Unrelated cards
 * are isolated at the child boundary.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { clearGrowDataMeta } from "@/hooks/useGrowData";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";
import type { Plant } from "@/mock";

const fixture = vi.hoisted(() => ({ fetchPlant: vi.fn(), save: vi.fn() }));
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
vi.mock("@/components/PlantManualSensorFreshnessCard", () => ({
  default: ({ onUpdate }: { onUpdate: () => void }) => (
    <button type="button" onClick={onUpdate}>
      Add first snapshot
    </button>
  ),
}));
vi.mock("@/components/PlantSensorSourceBreakdownCard", () => ({ default: () => null }));
vi.mock("@/components/PlantBlueprintOverlaySection", () => ({
  PlantBlueprintOverlaySection: () => null,
}));
vi.mock("@/components/PlantMemoryEpisodesSection", () => ({
  PlantMemoryEpisodesSection: () => null,
}));

vi.mock("@/components/AssignTentDialog", () => ({ default: () => null }));

// Real PlantQuickLog; only its IO seams are mocked.
vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({ save: fixture.save, saving: false, error: null }),
}));
vi.mock("@/hooks/usePlantManualSensorHistory", () => ({
  usePlantManualSensorLogs: () => ({ data: [] }),
}));
vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => ({ preference: "fahrenheit" }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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
const prefillEvents: unknown[] = [];
const onPrefill = (event: Event) => prefillEvents.push((event as CustomEvent).detail);

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
  clearGrowDataMeta();
  fixture.fetchPlant.mockReset().mockResolvedValue(plant);
  fixture.save.mockReset().mockResolvedValue({ ok: true, growEventId: "event-1" });
  prefillEvents.length = 0;
  window.addEventListener(PLANT_QUICKLOG_PREFILL_EVENT, onPrefill);
  Element.prototype.scrollIntoView ??= () => undefined;
});
afterEach(() => {
  window.removeEventListener(PLANT_QUICKLOG_PREFILL_EVENT, onPrefill);
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  clearGrowDataMeta();
});

describe("Plant Detail manual snapshot CTA", () => {
  it("opens a writable manual-reading form and saves the typed reading", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Add first snapshot" }));

    const humidity = await screen.findByLabelText("Humidity (%)");
    expect(humidity).toBeEnabled();
    fireEvent.change(humidity, { target: { value: "55" } });

    const save = screen.getByTestId("plant-quick-log-save");
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() => expect(fixture.save).toHaveBeenCalledTimes(1));
    expect(JSON.stringify(fixture.save.mock.calls[0][0])).toContain("55");
    // The deferred shared-editor handoff is not used for manual readings.
    expect(prefillEvents).toEqual([]);
  });
});
