/**
 * PlantDetail archived-timeline read-only mode.
 *
 * Verifies:
 *  - Archived blocked state surfaces a "View archived timeline" link
 *    that targets `?mode=archived-timeline` and preserves tent context.
 *  - Navigating into that mode renders a clear read-only banner.
 *  - Read-only mode does NOT mount Quick Log / Fast Add write controls.
 *  - Read-only mode does NOT mount AI Doctor launch/readiness surfaces.
 *  - Read-only mode does NOT expose Action Queue write controls.
 *  - Default `/plants/:id` archived view stays the dedicated blocked
 *    state (no writable detail page is rendered).
 *
 * Presenter-only. No Supabase writes, no AI calls, no Action Queue writes.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  derivePlantDetailBlockedStateView,
} from "@/lib/plantDetailBlockedStateViewModel";

let mockState: { data: unknown; isLoading: boolean; isError: boolean } = {
  data: null,
  isLoading: false,
  isError: false,
};

vi.mock("@/hooks/useGrowData", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useGrowData")>();
  return {
    ...actual,
    useGrowPlant: () => ({ ...mockState, refetch: vi.fn() }),
    useGrowTent: () => ({ data: null }),
  };
});

vi.mock("@/components/QuickLogV2Fab", () => ({
  default: () => <div data-testid="quick-log-v2-fab-mounted" />,
}));
vi.mock("@/components/PlantQuickLog", () => ({
  default: () => <div data-testid="plant-quick-log-mounted" />,
}));
vi.mock("@/components/PlantDetailAiDoctorReadiness", () => ({
  default: () => <div data-testid="ai-doctor-readiness-mounted" />,
}));
vi.mock("@/components/PlantDetailAiDoctorContextReadinessMount", () => ({
  default: () => <div data-testid="ai-doctor-context-readiness-mounted" />,
}));
vi.mock("@/components/PlantDetailAiDoctorLiveReview", () => ({
  default: () => <div data-testid="ai-doctor-live-review-mounted" />,
}));
vi.mock("@/components/PlantDetailAiDoctorSafeReviewStart", () => ({
  default: () => <div data-testid="ai-doctor-safe-review-start-mounted" />,
}));
vi.mock("@/components/PlantAssignedTentActionsPanel", () => ({
  default: () => <div data-testid="assigned-tent-actions-mounted" />,
}));
vi.mock("@/components/PlantDetailQuickActions", () => ({
  default: () => <div data-testid="plant-detail-quick-actions-mounted" />,
}));

import PlantDetail from "@/pages/PlantDetail";

const archivedPlant = {
  id: "p-archived",
  name: "Archived Plant",
  strain: "OG",
  stage: "veg",
  startedAt: new Date(Date.now() - 86_400_000).toISOString(),
  tentId: "tent-7",
  growId: "grow-1",
  isArchived: true,
  lastNote: "",
  photo: null,
  health: "ok",
} as unknown as Record<string, unknown>;

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/plants/:id" element={<PlantDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("derivePlantDetailBlockedStateView archivedTimelineAction", () => {
  it("emits a View archived timeline action that preserves tent context", () => {
    const view = derivePlantDetailBlockedStateView({
      loadState: "ready",
      plant: archivedPlant as never,
    });
    expect(view!.kind).toBe("archived");
    expect(view!.archivedTimelineAction).not.toBeNull();
    expect(view!.archivedTimelineAction!.testId).toBe(
      "plant-detail-view-archived-timeline",
    );
    expect(view!.archivedTimelineAction!.path).toBe(
      "/plants/p-archived?tentId=tent-7&mode=archived-timeline",
    );
  });

  it("falls back to mode-only path when no tent context is available", () => {
    const view = derivePlantDetailBlockedStateView({
      loadState: "ready",
      plant: { ...archivedPlant, tentId: null } as never,
    });
    expect(view!.archivedTimelineAction!.path).toBe(
      "/plants/p-archived?mode=archived-timeline",
    );
  });
});

describe("PlantDetail archived screen → archived timeline", () => {
  it("shows the View archived timeline link on the dedicated archived screen", () => {
    mockState = { data: archivedPlant, isLoading: false, isError: false };
    renderAt("/plants/p-archived");
    expect(screen.getByTestId("plant-detail-archived")).toBeInTheDocument();
    const link = screen.getByTestId("plant-detail-view-archived-timeline");
    expect(link).toHaveAttribute(
      "href",
      "/plants/p-archived?tentId=tent-7&mode=archived-timeline",
    );
    // Default archived view is the blocked state — not the writable page.
    expect(screen.queryByTestId("quick-log-v2-fab-mounted")).toBeNull();
    expect(screen.queryByTestId("plant-detail-quick-actions-mounted")).toBeNull();
  });
});

describe("PlantDetail archived-timeline read-only mode", () => {
  it("renders the read-only banner and suppresses write/AI/action surfaces", () => {
    mockState = { data: archivedPlant, isLoading: false, isError: false };
    renderAt("/plants/p-archived?tentId=tent-7&mode=archived-timeline");

    expect(
      screen.getByTestId("plant-detail-archived-timeline-readonly"),
    ).toBeInTheDocument();
    const banner = screen.getByTestId("plant-detail-archived-timeline-banner");
    expect(banner).toHaveTextContent(/archived timeline.*read-only/i);

    // Back to tent link is present.
    expect(screen.getByTestId("plant-detail-back-to-tent")).toHaveAttribute(
      "href",
      "/tents/tent-7",
    );

    // No write surfaces.
    expect(screen.queryByTestId("quick-log-v2-fab-mounted")).toBeNull();
    expect(screen.queryByTestId("plant-quick-log-mounted")).toBeNull();
    expect(screen.queryByTestId("plant-detail-quick-log-open")).toBeNull();
    expect(screen.queryByTestId("plant-detail-quick-actions-mounted")).toBeNull();

    // No AI Doctor launch / readiness surfaces.
    expect(screen.queryByTestId("ai-doctor-readiness-mounted")).toBeNull();
    expect(
      screen.queryByTestId("ai-doctor-context-readiness-mounted"),
    ).toBeNull();
    expect(screen.queryByTestId("ai-doctor-live-review-mounted")).toBeNull();
    expect(
      screen.queryByTestId("ai-doctor-safe-review-start-mounted"),
    ).toBeNull();

    // No Action Queue write surface.
    expect(screen.queryByTestId("assigned-tent-actions-mounted")).toBeNull();

    // Archived-state default blocked screen is NOT shown here.
    expect(screen.queryByTestId("plant-detail-archived")).toBeNull();
  });

  it("ignores archived-timeline mode for active plants (writable page still gated by mode=off)", () => {
    mockState = {
      data: { ...archivedPlant, isArchived: false },
      isLoading: false,
      isError: false,
    };
    renderAt("/plants/p-archived?mode=archived-timeline");
    // Active plant → no archived blocked state, no read-only mode either.
    expect(
      screen.queryByTestId("plant-detail-archived-timeline-readonly"),
    ).toBeNull();
    expect(screen.queryByTestId("plant-detail-archived")).toBeNull();
  });
});
