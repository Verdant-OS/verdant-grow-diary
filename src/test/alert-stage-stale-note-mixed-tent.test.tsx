/**
 * Reviewer C on #3021, round 3: in a Veg tent that also holds a Flower plant,
 * the Flower plant's Tent Alerts panel said a Veg-range alert saved under a
 * minute ago "may no longer apply". The plant vote abstains in a mixed tent,
 * so Veg still governs that tent's alerts and the alert is current.
 *
 * The staleness note now compares the alert with the stage the tent's alerts
 * are judged by today (resolveTentAlertStageForView), never with one plant's
 * own stage. These tests cover the panel and Plant Detail; the rule itself is
 * covered in alert-tent-alert-stage-for-view.test.ts.
 */
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { mapPlantRow } from "@/lib/growAdapters";
import type { PlantRow } from "@/lib/db";

// Target-range reason format (no band numbers: derived-vpd-status-ui keeps
// VPD band tuples out of .tsx files).
const VEG_VPD = "VPD is above the veg target range.";
const SEEDLING_VPD = "VPD is above the seedling target range.";
const STALE_NOTE_TO_FLOWER =
  "Checked against Seedling targets. This tent's alerts now use Flower targets, so this alert may no longer apply.";

const GROW = "11111111-1111-4111-8111-111111111111";
const VEG_TENT = "22222222-2222-4222-8222-222222222222";
const FLOWER_TENT = "33333333-3333-4333-8333-333333333333";

/** Veg grow; a Veg tent holding one Flower and one Veg plant; a Flower tent. */
const TENTS = [
  { id: VEG_TENT, stage: "veg" },
  { id: FLOWER_TENT, stage: "flower" },
];
const PLANTS = [
  { grow_id: GROW, tent_id: VEG_TENT, stage: "flower" },
  { grow_id: GROW, tent_id: VEG_TENT, stage: "veg" },
  { grow_id: GROW, tent_id: FLOWER_TENT, stage: "flower" },
];

const mocks = vi.hoisted(() => ({
  rows: [] as unknown[],
  fetchPlant: vi.fn(),
  grows: [] as unknown[],
  tents: [] as unknown[],
  plants: [] as unknown[],
}));

vi.mock("@/hooks/usePlantAssignedTentAlerts", () => ({
  usePlantAssignedTentAlerts: () => ({ status: "ok", rows: mocks.rows }),
}));

function alertRow(reason: string, tentId: string) {
  return {
    id: "alert-1",
    title: "VPD high",
    reason,
    severity: "warning" as const,
    severityLabel: "Warning",
    severityRank: 2,
    metric: "vpd",
    status: "open" as const,
    firstSeenAt: new Date(Date.now() - 30_000).toISOString(),
    // Saved less than a minute ago: the alert is current.
    lastSeenAt: new Date(Date.now() - 30_000).toISOString(),
    tentId,
    growId: GROW,
  };
}

describe("PlantAssignedTentAlertsPanel shows the note only when the tent moved on", () => {
  async function renderPanel(tentAlertStage: string | null) {
    const { default: Panel } = await import("@/components/PlantAssignedTentAlertsPanel");
    return render(
      <MemoryRouter initialEntries={["/plants/plant-1"]}>
        <Panel
          tentId={VEG_TENT}
          tentName="Veg Tent"
          growId={GROW}
          plantId="plant-1"
          tentAlertStage={tentAlertStage}
        />
      </MemoryRouter>,
    );
  }

  afterEach(cleanup);

  it("no note on a fresh Veg-range alert when the tent's alerts use Veg", async () => {
    mocks.rows = [alertRow(VEG_VPD, VEG_TENT)];
    await renderPanel("veg");
    expect(screen.getByTestId("plant-assigned-tent-alert-row")).toBeInTheDocument();
    expect(screen.queryByTestId("plant-assigned-tent-alert-stage-stale")).toBeNull();
  });

  it("the note reaches the row when the tent's alerts now use another stage", async () => {
    mocks.rows = [alertRow(SEEDLING_VPD, VEG_TENT)];
    await renderPanel("flower");
    expect(screen.getByTestId("plant-assigned-tent-alert-stage-stale")).toHaveTextContent(
      STALE_NOTE_TO_FLOWER,
    );
  });

  it("no note while the tent's stage is unknown", async () => {
    mocks.rows = [alertRow(SEEDLING_VPD, VEG_TENT)];
    await renderPanel(null);
    expect(screen.queryByTestId("plant-assigned-tent-alert-stage-stale")).toBeNull();
  });
});

vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "owner-1" } }) }));
vi.mock("@/store/grows", () => ({ useGrows: () => ({ grows: mocks.grows }) }));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({ data: mocks.plants, isError: false }),
}));
vi.mock("@/lib/growRepo", () => ({ fetchPlant: mocks.fetchPlant }));
vi.mock("@/hooks/useGrowData", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useGrowData")>()),
  useGrowTent: () => ({ data: null }),
  useGrowTents: () => ({ data: mocks.tents, isError: false }),
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
vi.mock("@/components/ui/card", () => {
  const P = ({ children, ...r }: { children?: ReactNode; [k: string]: unknown }) => (
    <div {...r}>{children}</div>
  );
  return { Card: P, CardContent: P, CardHeader: P, CardTitle: P };
});
for (const name of [
  "PlantCultivarReferenceHint",
  "StageBadge",
  "PlantDetailDataSourceDisclosure",
  "PlantGrowContextRescueCard",
  "PlantTentEnvironmentPanel",
  "WateringCadenceHistoryStrip",
  "DrybackMonitoringStrip",
  "PlantRecentActivityPanel",
  "PlantRelativeTimelineSection",
  "ManualSnapshotTimelineSection",
  "TimelineMemorySection",
  "QuickLogGroupedTimelineSection",
  "PlantDailyGrowCheckHistoryCard",
  "DailyGrowCheckOnboardingCard",
  "PlantDailyGrowCheckConsistencyCard",
  "PlantRecentMoveCard",
  "DeepLinkAnchorRestorer",
  "PlantAssignedTentActionsPanel",
  "PlantStatusStrip",
  "QuickLogV2Fab",
  "PlantQuickStatusStrip",
  "PlantLogStreakMarker",
  "PlantDetailQuickActions",
  "PlantDetailPhotoStrip",
  "PhotoDiagnosisReviewDialog",
  "PlantDetailRecentActivityRecap",
  "PlantDetailRecentActionResponse",
  "PlantPendingOutcomeNotice",
  "PendingCheckpointBanner",
  "PlantDetailHarvestWatchCard",
  "PlantDetailHarvestEvidenceReportMount",
  "PlantDetailWhatsMissing",
  "PlantDetailAiDoctorReadiness",
  "PlantDetailAiDoctorContextPanel",
  "PlantDetailAiDoctorLiveReview",
  "PlantDetailAiDoctorContextReadinessMount",
  "PlantProfileContextCard",
  "PlantDetailTimelineEvidenceReadinessLaunch",
  "PlantDetailAskDoctorHelper",
  "PlantDetailSectionNav",
  "PlantDetailDisclosureSection",
  "PlantCardActionsMenu",
  "OneTentLoopNextStepCard",
  "PlantAiDoctorSessionsPanel",
  "PlantPhoto",
  "PlantQuickLog",
  "PlantManualSensorFreshnessCard",
  "PlantSensorSourceBreakdownCard",
  "AssignTentDialog",
]) {
  vi.doMock(`@/components/${name}`, () => ({ default: () => null }));
}
vi.mock("@/components/PlantBlueprintOverlaySection", () => ({
  PlantBlueprintOverlaySection: () => null,
}));
vi.mock("@/components/PlantMemoryEpisodesSection", () => ({
  PlantMemoryEpisodesSection: () => null,
}));

function plantRow(tentId: string): PlantRow {
  return {
    id: "plant-1",
    user_id: "owner-1",
    tent_id: tentId,
    name: "Aurora",
    strain: "Test cultivar",
    grow_id: GROW,
    stage: "flower",
    started_at: "2026-08-01T00:00:00Z",
    health: null,
    photo_url: null,
    last_note: null,
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

describe("Plant Detail passes the tent's alert stage to the Tent Alerts panel", () => {
  beforeEach(() => {
    mocks.grows = [{ id: GROW, stage: "veg" }];
    mocks.tents = TENTS;
    mocks.plants = PLANTS;
  });
  afterEach(cleanup);

  async function renderPlantDetail(tentId: string) {
    mocks.fetchPlant.mockResolvedValue(mapPlantRow(plantRow(tentId)));
    const { default: PlantDetail } = await import("@/pages/PlantDetail");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/plants/plant-1"]}>
          <Routes>
            <Route path="/plants/:id" element={<PlantDetail />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("plant-assigned-tent-alert-row")).toBeVisible());
  }

  it("C's repro: a Flower plant in a Veg tent gets no note on a fresh Veg-range alert", async () => {
    mocks.rows = [alertRow(VEG_VPD, VEG_TENT)];
    await renderPlantDetail(VEG_TENT);
    expect(screen.queryByTestId("plant-assigned-tent-alert-stage-stale")).toBeNull();
  });

  it("the note reaches Plant Detail when the tent's alerts moved past the alert's stage", async () => {
    mocks.rows = [alertRow(SEEDLING_VPD, FLOWER_TENT)];
    await renderPlantDetail(FLOWER_TENT);
    expect(screen.getByTestId("plant-assigned-tent-alert-stage-stale")).toHaveTextContent(
      STALE_NOTE_TO_FLOWER,
    );
  });
});
