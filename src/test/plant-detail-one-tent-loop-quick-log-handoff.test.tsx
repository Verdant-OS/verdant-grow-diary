/**
 * Plant Detail continuity regression: the One-Tent Loop Plant -> Quick Log
 * CTA dispatches the canonical exact-target Quick Log handoff on the current
 * route. The legacy plant-scoped sheet must not open from this entry point.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";

const activePlant = {
  id: "plant-1",
  name: "Current Plant",
  strain: "Test cultivar",
  stage: "veg",
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

vi.mock("@/components/QuickLogV2Fab", () => ({ default: () => null }));
vi.mock("@/components/PlantQuickLog", () => ({
  default: ({ open }: { open: boolean }) => (
    <div data-testid="plant-quick-log-sheet" data-open={String(open)} />
  ),
}));
vi.mock("@/components/PlantDetailAiDoctorReadiness", () => ({ default: () => null }));
vi.mock("@/components/PlantDetailAiDoctorContextReadinessMount", () => ({ default: () => null }));
vi.mock("@/components/PlantDetailAiDoctorLiveReview", () => ({ default: () => null }));
vi.mock("@/components/PlantDetailAiDoctorSafeReviewStart", () => ({ default: () => null }));
vi.mock("@/components/PlantAssignedTentActionsPanel", () => ({ default: () => null }));
vi.mock("@/components/PlantDetailQuickActions", () => ({ default: () => null }));

import PlantDetail from "@/pages/PlantDetail";

function LocationProbe() {
  return <output data-testid="location-pathname">{useLocation().pathname}</output>;
}

function renderPlantDetail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/plants/plant-1"]}>
        <LocationProbe />
        <Routes>
          <Route path="/plants/:id" element={<PlantDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Plant Detail One-Tent Loop Quick Log handoff", () => {
  it("dispatches the exact canonical target without navigating or opening the legacy sheet", async () => {
    const user = userEvent.setup();
    const listener = vi.fn();
    window.addEventListener(PLANT_QUICKLOG_PREFILL_EVENT, listener);
    renderPlantDetail();

    try {
      const sheet = screen.getByTestId("plant-quick-log-sheet");
      expect(sheet).toHaveAttribute("data-open", "false");
      expect(screen.getByTestId("location-pathname")).toHaveTextContent("/plants/plant-1");

      await user.click(screen.getByTestId("plant-detail-one-tent-loop-next-step-card-cta"));

      expect(listener).toHaveBeenCalledTimes(1);
      expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({
        plantId: "plant-1",
        plantName: null,
        growId: "grow-1",
        tentId: "tent-1",
        tentName: null,
        eventType: "observation",
        suggestSnapshot: true,
      });
      expect(sheet).toHaveAttribute("data-open", "false");
      expect(screen.getByTestId("location-pathname")).toHaveTextContent("/plants/plant-1");
      expect(screen.getByTestId("plant-detail-one-tent-loop-next-step-card")).toBeInTheDocument();
    } finally {
      window.removeEventListener(PLANT_QUICKLOG_PREFILL_EVENT, listener);
    }
  });
});
