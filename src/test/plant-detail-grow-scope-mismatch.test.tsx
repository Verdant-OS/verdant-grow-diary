/**
 * Plant Detail grow-scope identity: URL/query growId must match the plant.
 *
 * Fail-closed when ?growId= is present and ≠ plant.grow_id. Matching growId
 * (or no growId) still renders. Presenter-only. No Supabase writes.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  derivePlantDetailBlockedStateView,
  isPlantDetailGrowScopeMismatch,
  readPlantGrowId,
} from "@/lib/plantDetailBlockedStateViewModel";

const PLANT_ID = "7c33c797-331f-4788-866d-63551e94ceb6";
const REAL_GROW_ID = "4cad3cae-21e3-42f8-8372-2f6237205db3";
const ORPHAN_GROW_ID = "00000000-0000-4000-8000-000000000099";

const goldenPlant = {
  id: PLANT_ID,
  name: "BREAK-4pm-2",
  strain: "OG",
  stage: "veg",
  startedAt: "2026-07-01T00:00:00.000Z",
  tentId: "tent-a",
  growId: REAL_GROW_ID,
  isArchived: false,
  lastNote: "",
  photo: null,
  health: "ok",
};

const refetch = vi.fn().mockResolvedValue({ data: null });
let mockState: { data: unknown; isLoading: boolean; isError: boolean } = {
  data: goldenPlant,
  isLoading: false,
  isError: false,
};

vi.mock("@/hooks/useGrowData", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useGrowData")>();
  return {
    ...actual,
    useGrowPlant: () => ({ ...mockState, refetch }),
    useGrowTent: () => ({ data: { id: "tent-a", name: "Fixture Tent A" } }),
  };
});

vi.mock("@/components/QuickLogV2Fab", () => ({ default: () => null }));
vi.mock("@/components/PlantQuickLog", () => ({ default: () => null }));
vi.mock("@/components/PlantDetailAiDoctorReadiness", () => ({ default: () => null }));
vi.mock("@/components/PlantDetailAiDoctorContextReadinessMount", () => ({
  default: () => null,
}));
vi.mock("@/components/PlantDetailAiDoctorLiveReview", () => ({ default: () => null }));
vi.mock("@/components/PlantDetailAiDoctorSafeReviewStart", () => ({ default: () => null }));
vi.mock("@/components/PlantAssignedTentActionsPanel", () => ({ default: () => null }));
vi.mock("@/components/PlantDetailQuickActions", () => ({ default: () => null }));

import PlantDetail from "@/pages/PlantDetail";

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/plants/:id" element={<PlantDetail />} />
          <Route path="/plants" element={<div>Plants list</div>} />
          <Route path="/tents/:id" element={<div>Tent detail</div>} />
          <Route path="/grows/:id" element={<div>Grow detail</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("isPlantDetailGrowScopeMismatch", () => {
  it("is false when query growId is absent or blank", () => {
    expect(isPlantDetailGrowScopeMismatch(goldenPlant as never, null)).toBe(false);
    expect(isPlantDetailGrowScopeMismatch(goldenPlant as never, "")).toBe(false);
    expect(isPlantDetailGrowScopeMismatch(goldenPlant as never, "   ")).toBe(false);
  });

  it("is false when query growId matches plant.growId or plant.grow_id", () => {
    expect(isPlantDetailGrowScopeMismatch(goldenPlant as never, REAL_GROW_ID)).toBe(false);
    expect(
      isPlantDetailGrowScopeMismatch({ grow_id: REAL_GROW_ID } as never, ` ${REAL_GROW_ID} `),
    ).toBe(false);
  });

  it("is true when query growId is present and does not match", () => {
    expect(isPlantDetailGrowScopeMismatch(goldenPlant as never, ORPHAN_GROW_ID)).toBe(true);
    expect(isPlantDetailGrowScopeMismatch({ growId: null } as never, ORPHAN_GROW_ID)).toBe(true);
    expect(isPlantDetailGrowScopeMismatch(null, ORPHAN_GROW_ID)).toBe(true);
  });

  it("reads camelCase and snake_case grow ids", () => {
    expect(readPlantGrowId(goldenPlant as never)).toBe(REAL_GROW_ID);
    expect(readPlantGrowId({ grow_id: REAL_GROW_ID } as never)).toBe(REAL_GROW_ID);
    expect(readPlantGrowId(null)).toBeNull();
  });
});

describe("derivePlantDetailBlockedStateView grow-scope mismatch", () => {
  it("fail-closes as not-found without tent/grow back links", () => {
    const view = derivePlantDetailBlockedStateView({
      loadState: "ready",
      plant: goldenPlant as never,
      contextTentId: "tent-a",
      contextGrowId: ORPHAN_GROW_ID,
    });
    expect(view?.kind).toBe("not-found");
    expect(view?.testId).toBe("plant-detail-not-found");
    expect(view?.title).toBe("Plant not found");
    expect(view?.primaryBack.kind).toBe("plants");
    expect(view?.primaryBack.path).toBe("/plants");
    expect(view?.secondaryBack).toBeNull();
  });

  it("does not leak archived identity under the wrong grow", () => {
    const view = derivePlantDetailBlockedStateView({
      loadState: "ready",
      plant: { ...goldenPlant, isArchived: true } as never,
      contextGrowId: ORPHAN_GROW_ID,
    });
    expect(view?.kind).toBe("not-found");
    expect(view?.archivedTimelineAction).toBeUndefined();
  });

  it("returns null (render plant) when growId matches or is omitted", () => {
    expect(
      derivePlantDetailBlockedStateView({
        loadState: "ready",
        plant: goldenPlant as never,
        contextGrowId: REAL_GROW_ID,
      }),
    ).toBeNull();
    expect(
      derivePlantDetailBlockedStateView({
        loadState: "ready",
        plant: goldenPlant as never,
      }),
    ).toBeNull();
  });
});

describe("PlantDetail grow-scope mismatch integration", () => {
  it("does not render plant body or tent links when query growId mismatches", () => {
    mockState = { data: goldenPlant, isLoading: false, isError: false };
    renderAt(`/plants/${PLANT_ID}?growId=${ORPHAN_GROW_ID}`);
    expect(screen.getByTestId("plant-detail-not-found")).toBeInTheDocument();
    expect(screen.getByText(/plant not found/i)).toBeInTheDocument();
    expect(screen.queryByText("BREAK-4pm-2")).toBeNull();
    expect(screen.queryByText("Fixture Tent A")).toBeNull();
    expect(screen.queryByTestId("plant-detail-back-to-tent")).toBeNull();
    expect(screen.getByTestId("plant-detail-back-to-plants")).toHaveAttribute("href", "/plants");
  });

  it("still renders plant detail when query growId matches", () => {
    mockState = { data: goldenPlant, isLoading: false, isError: false };
    renderAt(`/plants/${PLANT_ID}?growId=${REAL_GROW_ID}`);
    expect(screen.queryByTestId("plant-detail-not-found")).toBeNull();
    expect(screen.getByText("BREAK-4pm-2")).toBeInTheDocument();
  });

  it("still renders plant detail when query growId is omitted", () => {
    mockState = { data: goldenPlant, isLoading: false, isError: false };
    renderAt(`/plants/${PLANT_ID}`);
    expect(screen.queryByTestId("plant-detail-not-found")).toBeNull();
    expect(screen.getByText("BREAK-4pm-2")).toBeInTheDocument();
  });
});
