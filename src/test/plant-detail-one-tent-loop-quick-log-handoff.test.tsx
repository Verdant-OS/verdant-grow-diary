/**
 * Plant Detail continuity regression: the One-Tent Loop Plant -> Quick Log
 * CTA dispatches the canonical exact-target Quick Log handoff on the current
 * route. The legacy plant-scoped sheet must not open from this entry point.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "@/lib/react-router-compat";
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
import OneTentLoopNextStepCard from "@/components/OneTentLoopNextStepCard";

const savedStatusNote = {
  id: "saved-status-note",
  plant_id: activePlant.id,
  grow_id: activePlant.growId,
  entry_at: "2026-09-03T02:00:00.000Z",
  note: "Response check: Same.",
  details: { event_type: "observation", response: "same" },
};

function LocationProbe() {
  const location = useLocation();
  return (
    <>
      <output data-testid="location-pathname">{location.pathname}</output>
      <output data-testid="location-hash">{location.hash}</output>
    </>
  );
}

function renderPlantDetail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(["plant_recent_activity", activePlant.id], []);
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/plants/plant-1"]}>
        <LocationProbe />
        <Routes>
          <Route path="/plants/:id" element={<PlantDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

describe("Plant Detail One-Tent Loop Quick Log handoff", () => {
  it("moves to Timeline after the saved Same check-in reaches the plant activity cache", async () => {
    const user = userEvent.setup();
    const { queryClient } = renderPlantDetail();
    const cardId = "plant-detail-one-tent-loop-next-step-card";
    expect(screen.getByTestId(`${cardId}-cta`)).toHaveTextContent("Add quick log");

    act(() => {
      queryClient.setQueryData(["plant_recent_activity", activePlant.id], [savedStatusNote]);
    });

    await waitFor(() => {
      expect(screen.getByTestId(cardId)).toHaveAttribute("data-next-step", "timeline");
      expect(screen.getByTestId(`${cardId}-cta`)).toHaveTextContent("View timeline");
    });
    expect(screen.getByTestId("location-pathname")).toHaveTextContent("/plants/plant-1");
    expect(screen.getByTestId("plant-quick-log-sheet")).toHaveAttribute("data-open", "false");
    expect(screen.getByTestId(`${cardId}-cta`)).toHaveAttribute(
      "href",
      "/plants/plant-1#plant-relative-timeline",
    );
    await user.click(screen.getByTestId(`${cardId}-cta`));
    await waitFor(() => {
      expect(screen.getByTestId("location-hash")).toHaveTextContent("#plant-relative-timeline");
      expect(document.getElementById("plant-relative-timeline")).toBeVisible();
    });
    expect(screen.queryByText("No timeline entries yet")).not.toBeInTheDocument();
    expect(screen.getByText("No recent watering or feed note")).toBeInTheDocument();
  });

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

describe("Plant next-step cached activity", () => {
  const cardId = "plant-activity-next-step";
  const queryKey = ["plant_recent_activity", activePlant.id];

  function renderCachedCard(data: unknown) {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKey, data);
    const view = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <OneTentLoopNextStepCard
            current="plant"
            ids={{
              plantId: activePlant.id,
              growId: activePlant.growId,
              tentId: activePlant.tentId,
            }}
            testId={cardId}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    return { ...view, queryClient };
  }

  it.each([
    ["non-array", { rows: [] }],
    ["null", null],
    ["one bad element", [savedStatusNote, null]],
    ["invalid date", [{ ...savedStatusNote, entry_at: "invalid" }]],
    ["another plant", [{ ...savedStatusNote, plant_id: "other-plant" }]],
  ])("does not advance or imply an empty history for %s", (_name, data) => {
    renderCachedCard(data);
    expect(screen.getByTestId(`${cardId}-disabled`)).toHaveTextContent(/activity is unavailable/i);
    expect(screen.queryByTestId(`${cardId}-cta`)).toBeNull();
  });

  it("recognizes a plain saved note without a feed or watering kind and makes no fetch", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      renderCachedCard([{ ...savedStatusNote, details: null }]);
      expect(screen.getByTestId(`${cardId}-cta`)).toHaveTextContent("View timeline");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("shows unavailable when a refetch throws, even after a previously saved note", async () => {
    const { queryClient } = renderCachedCard([savedStatusNote]);
    await act(async () => {
      await expect(
        queryClient.fetchQuery({
          queryKey,
          queryFn: async () => {
            throw new Error("activity read failed");
          },
          retry: false,
        }),
      ).rejects.toThrow("activity read failed");
    });
    expect(screen.getByTestId(`${cardId}-disabled`)).toHaveTextContent(/activity is unavailable/i);
    expect(screen.queryByTestId(`${cardId}-cta`)).toBeNull();
  });

  it("keeps another plant's cache update separate and restores Quick Log for empty success", () => {
    const { queryClient } = renderCachedCard([]);
    act(() => {
      queryClient.setQueryData(["plant_recent_activity", "other-plant"], [savedStatusNote]);
    });
    expect(screen.getByTestId(`${cardId}-cta`)).toHaveTextContent("Add quick log");
    act(() => {
      queryClient.setQueryData(queryKey, [savedStatusNote]);
    });
    expect(screen.getByTestId(`${cardId}-cta`)).toHaveTextContent("View timeline");
    act(() => {
      queryClient.setQueryData(queryKey, []);
    });
    expect(screen.getByTestId(`${cardId}-cta`)).toHaveTextContent("Add quick log");
  });
});
