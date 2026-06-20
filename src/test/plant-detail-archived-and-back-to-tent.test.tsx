/**
 * PlantDetail blocked-state view-model + archived/back-to-tent tests.
 *
 * Pure helpers tested directly; integration tests render PlantDetail
 * through MemoryRouter to assert end-to-end behavior.
 *
 * Presenter-only. No Supabase writes, no AI calls, no Action Queue writes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  derivePlantDetailBlockedStateView,
  resolveBackContext,
} from "@/lib/plantDetailBlockedStateViewModel";
import { PLANT_DETAIL_LOAD_TIMEOUT_MS } from "@/lib/plantDetailLoadTimeoutRules";

const refetch = vi.fn().mockResolvedValue({ data: null });
let mockState: { data: unknown; isLoading: boolean; isError: boolean } = {
  data: null,
  isLoading: false,
  isError: false,
};

vi.mock("@/hooks/useGrowData", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useGrowData")>();
  return {
    ...actual,
    useGrowPlant: () => ({ ...mockState, refetch }),
    useGrowTent: () => ({ data: null }),
  };
});

vi.mock("@/components/QuickLogV2Fab", () => ({ default: () => null }));

import PlantDetail from "@/pages/PlantDetail";

function renderAt(path = "/plants/p1") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/plants/:id" element={<PlantDetail />} />
          <Route path="/plants" element={<div>Plants list</div>} />
          <Route path="/tents/:id" element={<div>Tent detail</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const archivedPlant = {
  id: "p-archived",
  name: "Archived Plant",
  strain: "OG",
  stage: "veg",
  startedAt: new Date(Date.now() - 86400000).toISOString(),
  tentId: "tent-7",
  growId: "grow-1",
  isArchived: true,
  lastNote: "",
  photo: null,
  health: "ok",
} as unknown as Record<string, unknown>;

const archivedPlantNoTent = {
  ...archivedPlant,
  id: "p-archived-no-tent",
  tentId: null,
};

describe("resolveBackContext", () => {
  it("prefers the plant's own tent id over the caller-supplied context", () => {
    const ctx = resolveBackContext({
      loadState: "ready",
      plant: { tentId: "from-plant" } as never,
      contextTentId: "from-ctx",
    });
    expect(ctx.primary).toEqual({
      testId: "plant-detail-back-to-tent",
      label: "Back to tent",
      path: "/tents/from-plant",
      kind: "tent",
    });
    expect(ctx.secondary?.kind).toBe("plants");
  });

  it("falls back to the caller-supplied context tent id when the plant has none", () => {
    const ctx = resolveBackContext({
      loadState: "loading-slow",
      plant: null,
      contextTentId: "tent-9",
    });
    expect(ctx.primary.path).toBe("/tents/tent-9");
    expect(ctx.secondary?.path).toBe("/plants");
  });

  it("falls back safely to Back to plants when no tent route is available", () => {
    const ctx = resolveBackContext({ loadState: "error", plant: null });
    expect(ctx.primary.kind).toBe("plants");
    expect(ctx.secondary).toBeNull();
  });
});

describe("derivePlantDetailBlockedStateView", () => {
  it("returns null for the ready+active path so the page renders normally", () => {
    expect(
      derivePlantDetailBlockedStateView({
        loadState: "ready",
        plant: { tentId: "t1", isArchived: false } as never,
      }),
    ).toBeNull();
  });

  it("returns null for plain loading so the skeleton can render", () => {
    expect(
      derivePlantDetailBlockedStateView({ loadState: "loading" }),
    ).toBeNull();
  });

  it("surfaces an archived state — never not-found — when the plant is archived", () => {
    const view = derivePlantDetailBlockedStateView({
      loadState: "ready",
      plant: archivedPlant as never,
    });
    expect(view).not.toBeNull();
    expect(view!.kind).toBe("archived");
    expect(view!.title).toMatch(/plant archived/i);
    expect(view!.showRetry).toBe(false);
    expect(view!.primaryBack.kind).toBe("tent");
    expect(view!.primaryBack.path).toBe("/tents/tent-7");
    expect(view!.secondaryBack?.kind).toBe("plants");
  });

  it("falls back to Back to plants in the archived state when no tent context exists", () => {
    const view = derivePlantDetailBlockedStateView({
      loadState: "ready",
      plant: archivedPlantNoTent as never,
    });
    expect(view!.kind).toBe("archived");
    expect(view!.primaryBack.kind).toBe("plants");
    expect(view!.secondaryBack).toBeNull();
  });

  it("uses 'Plant merged' copy for merged plants", () => {
    const merged = {
      ...archivedPlant,
      lastNote: "Merged into 11111111-1111-1111-1111-111111111111",
    };
    const view = derivePlantDetailBlockedStateView({
      loadState: "ready",
      plant: merged as never,
    });
    expect(view!.kind).toBe("archived");
    expect(view!.title).toMatch(/plant merged/i);
  });

  it("offers Retry + tent fallback on loading-slow when caller has tent context", () => {
    const view = derivePlantDetailBlockedStateView({
      loadState: "loading-slow",
      plant: null,
      contextTentId: "tent-9",
    });
    expect(view!.kind).toBe("loading-slow");
    expect(view!.showRetry).toBe(true);
    expect(view!.primaryBack.path).toBe("/tents/tent-9");
  });

  it("offers Retry + tent fallback on error when caller has tent context", () => {
    const view = derivePlantDetailBlockedStateView({
      loadState: "error",
      plant: null,
      contextTentId: "tent-2",
    });
    expect(view!.kind).toBe("error");
    expect(view!.showRetry).toBe(true);
    expect(view!.primaryBack.kind).toBe("tent");
  });
});

describe("PlantDetail blocked-state integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refetch.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the archived state with Back to tent when the plant is archived", () => {
    mockState = { data: archivedPlant, isLoading: false, isError: false };
    renderAt("/plants/p-archived");
    expect(screen.getByTestId("plant-detail-archived")).toBeInTheDocument();
    expect(screen.getByText(/plant archived/i)).toBeInTheDocument();
    expect(screen.queryByText(/plant not found/i)).toBeNull();
    const tentLink = screen.getByTestId("plant-detail-back-to-tent");
    expect(tentLink).toHaveAttribute("href", "/tents/tent-7");
    expect(screen.getByTestId("plant-detail-back-to-plants")).toHaveAttribute(
      "href",
      "/plants",
    );
  });

  it("falls back to Back to plants only when an archived plant has no tent", () => {
    mockState = {
      data: archivedPlantNoTent,
      isLoading: false,
      isError: false,
    };
    renderAt("/plants/p-archived-no-tent");
    expect(screen.getByTestId("plant-detail-archived")).toBeInTheDocument();
    expect(screen.queryByTestId("plant-detail-back-to-tent")).toBeNull();
    expect(screen.getByTestId("plant-detail-back-to-plants")).toBeInTheDocument();
  });

  it("loading-slow surfaces Retry + Back to tent when ?tentId is supplied", () => {
    mockState = { data: null, isLoading: true, isError: false };
    renderAt("/plants/p1?tentId=tent-9");
    expect(screen.getByTestId("plant-detail-loading")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(PLANT_DETAIL_LOAD_TIMEOUT_MS + 50);
    });
    expect(screen.getByTestId("plant-detail-loading-slow")).toBeInTheDocument();
    expect(screen.getByTestId("plant-detail-back-to-tent")).toHaveAttribute(
      "href",
      "/tents/tent-9",
    );
    expect(screen.getByTestId("plant-detail-back-to-plants")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("plant-detail-loading-slow-retry"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("error surfaces Retry + Back to tent when ?tentId is supplied", () => {
    mockState = { data: null, isLoading: false, isError: true };
    renderAt("/plants/p1?tentId=tent-3");
    expect(screen.getByTestId("plant-detail-error")).toBeInTheDocument();
    expect(screen.getByTestId("plant-detail-back-to-tent")).toHaveAttribute(
      "href",
      "/tents/tent-3",
    );
    fireEvent.click(screen.getByTestId("plant-detail-error-retry"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("error falls back safely to Back to plants only when no tent context is available", () => {
    mockState = { data: null, isLoading: false, isError: true };
    renderAt("/plants/p1");
    expect(screen.getByTestId("plant-detail-error")).toBeInTheDocument();
    expect(screen.queryByTestId("plant-detail-back-to-tent")).toBeNull();
    expect(screen.getByTestId("plant-detail-back-to-plants")).toBeInTheDocument();
  });

  it("not-found remains not-found and does not falsely fire while loading", () => {
    mockState = { data: null, isLoading: true, isError: false };
    const { unmount } = renderAt("/plants/p1");
    expect(screen.queryByTestId("plant-detail-not-found")).toBeNull();
    unmount();
    mockState = { data: null, isLoading: false, isError: false };
    renderAt("/plants/p1");
    expect(screen.getByTestId("plant-detail-not-found")).toBeInTheDocument();
    expect(screen.getByText(/plant not found/i)).toBeInTheDocument();
  });
});
