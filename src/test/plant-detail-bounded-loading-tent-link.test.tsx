/**
 * Plant Detail bounded-loading + tent→plant route regression.
 *
 * Covers the bug where the plant detail page sat on a permanent blank
 * skeleton when opened from the tent detail "Plants in this tent" card.
 *
 * Presenter-only. No Supabase writes, no AI calls, no Action Queue writes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  PLANT_DETAIL_LOAD_TIMEOUT_MS,
  classifyPlantDetailLoadState,
} from "@/lib/plantDetailLoadTimeoutRules";
import { plantDetailPath } from "@/lib/routes";

const refetch = vi.fn().mockResolvedValue({ data: null });

let mockState: {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
} = { data: null, isLoading: true, isError: false };

vi.mock("@/hooks/useGrowData", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useGrowData")>();
  return {
    ...actual,
    useGrowPlant: () => ({ ...mockState, refetch }),
    useGrowTent: () => ({ data: null }),
  };
});

vi.mock("@/components/QuickLogV2Fab", () => ({ default: () => null }));

// Surface any AI Doctor / live-review imports the test environment loads.
// These must never fire during a loading or error state — confirmed by
// only rendering bounded loading/error chrome.
const aiDoctorSpies = {
  liveReview: vi.fn(),
  safeReviewStart: vi.fn(),
  contextPanel: vi.fn(),
};
vi.mock("@/components/PlantDetailAiDoctorLiveReview", () => ({
  default: (...args: unknown[]) => {
    aiDoctorSpies.liveReview(...args);
    return null;
  },
}));
vi.mock("@/components/PlantDetailAiDoctorSafeReviewStart", () => ({
  default: (...args: unknown[]) => {
    aiDoctorSpies.safeReviewStart(...args);
    return null;
  },
}));
vi.mock("@/components/PlantDetailAiDoctorContextPanel", () => ({
  default: (...args: unknown[]) => {
    aiDoctorSpies.contextPanel(...args);
    return null;
  },
}));

import PlantDetail from "@/pages/PlantDetail";

function renderAt(id = "p1") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/plants/${id}`]}>
        <Routes>
          <Route path="/plants/:id" element={<PlantDetail />} />
          <Route path="/plants" element={<div>Plants list</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("plantDetailPath (tent→plant card link contract)", () => {
  it("produces the canonical /plants/:id route consumed by PlantDetail", () => {
    expect(plantDetailPath("plant-123")).toBe("/plants/plant-123");
  });

  it("URL-encodes ids so unusual plant ids never break navigation", () => {
    expect(plantDetailPath("a b/c")).toBe("/plants/a%20b%2Fc");
  });
});

describe("classifyPlantDetailLoadState", () => {
  it("classifies all blocked/ready states deterministically", () => {
    expect(
      classifyPlantDetailLoadState({
        isLoading: true,
        isError: false,
        hasPlant: false,
        loadTimedOut: false,
      }),
    ).toBe("loading");
    expect(
      classifyPlantDetailLoadState({
        isLoading: true,
        isError: false,
        hasPlant: false,
        loadTimedOut: true,
      }),
    ).toBe("loading-slow");
    expect(
      classifyPlantDetailLoadState({
        isLoading: false,
        isError: true,
        hasPlant: false,
        loadTimedOut: false,
      }),
    ).toBe("error");
    expect(
      classifyPlantDetailLoadState({
        isLoading: false,
        isError: false,
        hasPlant: false,
        loadTimedOut: false,
      }),
    ).toBe("not-found");
    expect(
      classifyPlantDetailLoadState({
        isLoading: false,
        isError: false,
        hasPlant: true,
        loadTimedOut: false,
      }),
    ).toBe("ready");
  });
});

describe("PlantDetail bounded loading", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refetch.mockClear();
    aiDoctorSpies.liveReview.mockClear();
    aiDoctorSpies.safeReviewStart.mockClear();
    aiDoctorSpies.contextPanel.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts on the loading skeleton when the plant query is pending", () => {
    mockState = { data: null, isLoading: true, isError: false };
    renderAt();
    expect(screen.getByTestId("plant-detail-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("plant-detail-loading-slow")).toBeNull();
  });

  it("does NOT stay on the blank skeleton forever — promotes to a bounded retry surface after the timeout", () => {
    mockState = { data: null, isLoading: true, isError: false };
    renderAt();
    expect(screen.getByTestId("plant-detail-loading")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(PLANT_DETAIL_LOAD_TIMEOUT_MS + 50);
    });
    const slow = screen.getByTestId("plant-detail-loading-slow");
    expect(slow).toBeInTheDocument();
    expect(slow).toHaveAttribute("role", "alert");
    expect(screen.queryByTestId("plant-detail-loading")).toBeNull();
    // Bounded retry: clicking Retry calls refetch.
    fireEvent.click(screen.getByTestId("plant-detail-loading-slow-retry"));
    expect(refetch).toHaveBeenCalledTimes(1);
    // Safe escape route always available.
    expect(
      screen.getByRole("link", { name: /back to plants/i }),
    ).toBeInTheDocument();
  });

  it("never mounts AI Doctor surfaces while loading or in a bounded-loading state (no unrelated fetch fan-out)", () => {
    mockState = { data: null, isLoading: true, isError: false };
    renderAt();
    expect(aiDoctorSpies.liveReview).not.toHaveBeenCalled();
    expect(aiDoctorSpies.safeReviewStart).not.toHaveBeenCalled();
    expect(aiDoctorSpies.contextPanel).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(PLANT_DETAIL_LOAD_TIMEOUT_MS + 50);
    });
    expect(screen.getByTestId("plant-detail-loading-slow")).toBeInTheDocument();
    expect(aiDoctorSpies.liveReview).not.toHaveBeenCalled();
    expect(aiDoctorSpies.safeReviewStart).not.toHaveBeenCalled();
    expect(aiDoctorSpies.contextPanel).not.toHaveBeenCalled();
  });
});
