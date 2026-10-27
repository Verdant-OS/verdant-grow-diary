/**
 * Every mapped plant-detail hash target must carry the same sticky-header
 * offset (`scroll-mt-16`) on the element that owns the id.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { describe, expect, it, vi } from "vitest";

import { PLANT_DETAIL_KNOWN_ANCHOR_IDS } from "@/lib/plantDetailDisclosureRules";

const activePlant = {
  id: "plant-1",
  name: "Offset Plant",
  strain: "Test cultivar",
  stage: "flower",
  startedAt: "2026-07-01T00:00:00.000Z",
  tentId: "tent-1",
  growId: "grow-1",
  isArchived: false,
  lastNote: "No recent note",
  photo: null,
  health: "ok",
};

vi.mock("@/hooks/useGrowData", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useGrowData")>();
  return {
    ...actual,
    useGrowPlant: () => ({
      data: activePlant,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }),
    useGrowTent: () => ({ data: { id: "tent-1", name: "Current Tent" } }),
  };
});

vi.mock("@/hooks/usePlantRecentActivity", () => ({
  usePlantRecentActivity: () => ({
    data: [],
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
    isPending: false,
    fetchStatus: "idle",
  }),
}));

vi.mock("@/components/QuickLogV2Fab", () => ({ default: () => null }));
vi.mock("@/components/PlantQuickLog", () => ({ default: () => null }));
vi.mock("@/components/PlantDetailPhotoStrip", () => ({ default: () => null }));
vi.mock("@/components/PlantRelativeTimelineSection", () => ({ default: () => null }));
vi.mock("@/components/ManualSnapshotTimelineSection", () => ({ default: () => null }));
vi.mock("@/components/TimelineMemorySection", () => ({ default: () => null }));
vi.mock("@/components/QuickLogGroupedTimelineSection", () => ({ default: () => null }));
vi.mock("@/components/PlantAssignedTentAlertsPanel", () => ({ default: () => null }));
vi.mock("@/components/PlantAssignedTentActionsPanel", () => ({ default: () => null }));
vi.mock("@/components/PlantDetailHarvestWatchCard", () => ({ default: () => null }));
vi.mock("@/components/PlantDetailHarvestEvidenceReportMount", () => ({ default: () => null }));
vi.mock("@/components/PlantDetailAiDoctorReadiness", () => ({ default: () => null }));
vi.mock("@/components/PlantDetailAiDoctorContextPanel", () => ({ default: () => null }));
vi.mock("@/components/PlantDetailAiDoctorLiveReview", () => ({ default: () => null }));
vi.mock("@/components/PlantDetailAiDoctorContextReadinessMount", () => ({ default: () => null }));
vi.mock("@/components/PlantDetailTimelineEvidenceReadinessLaunch", () => ({ default: () => null }));
vi.mock("@/components/PlantDetailAskDoctorHelper", () => ({ default: () => null }));
vi.mock("@/components/PlantAiDoctorSessionsPanel", () => ({ default: () => null }));

import PlantDetail from "@/pages/PlantDetail";

describe("plant detail hash scroll offset", () => {
  it("gives every mapped hash target scroll-mt-16", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/plants/plant-1"]}>
          <Routes>
            <Route path="/plants/:id" element={<PlantDetail />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Offset Plant")).toBeInTheDocument();
    });

    expect(PLANT_DETAIL_KNOWN_ANCHOR_IDS.length).toBeGreaterThan(0);
    for (const anchorId of PLANT_DETAIL_KNOWN_ANCHOR_IDS) {
      const node = document.getElementById(anchorId);
      expect(node, anchorId).not.toBeNull();
      expect(node?.className, anchorId).toMatch(/\bscroll-mt-16\b/);
    }
  });
});
