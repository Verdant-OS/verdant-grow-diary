/**
 * Grow Detail blocked-state polish: loading, fetch error (retry), not-found.
 *
 * Presenter-only. No Supabase writes, no AI calls, no Action Queue writes,
 * no device control, no AI Doctor calls.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const refetch = vi.fn();

let mockState: {
  grow: unknown;
  loading: boolean;
  notFound: boolean;
  error: boolean;
};

vi.mock("@/hooks/useGrowDetailData", () => {
  return {
    useGrowDetailData: () => ({
      ...mockState,
      growId: "g1",
      counts: {
        plants: 0, tents: 0, diary: 0,
        actionsPending: 0, actionsTotal: 0, auditEvents: 0,
        alertsOpen: 0, alertsCritical: 0, alertsWarning: 0,
      },
      recent: { status: "ok", items: [] },
      status: {
        level: "unavailable",
        reason: "Status unavailable",
        pending: "unavailable",
        highestRisk: "unknown",
        lastDiaryAt: null,
      },
      outcomes: {
        status: "ready",
        summary: { improved: 0, unchanged: 0, worsened: 0, more_data_needed: 0 },
        recent: [],
        learning: { totals: { count: 0 } },
      },
      refetch,
    }),
    EMPTY_GROW_OUTCOMES_STATE: {},
  };
});

vi.mock("@/components/GrowBreadcrumbs", () => ({ default: () => null }));
vi.mock("@/components/ActionOutcomeLearningReport", () => ({ default: () => null }));

import GrowDetail from "@/pages/GrowDetail";

function renderAt() {
  return render(
    <MemoryRouter initialEntries={["/grows/g1"]}>
      <Routes>
        <Route path="/grows/:growId" element={<GrowDetail />} />
        <Route path="/grows" element={<div>Grows list</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Grow Detail blocked states", () => {
  it("renders an accessible loading state", () => {
    mockState = { grow: null, loading: true, notFound: false, error: false };
    renderAt();
    const status = screen.getByTestId("grow-detail-loading");
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveAttribute("aria-label", "Loading grow");
  });

  it("renders an error state with retry CTA that calls refetch", () => {
    mockState = { grow: null, loading: false, notFound: false, error: true };
    refetch.mockClear();
    renderAt();
    expect(screen.getByTestId("grow-detail-error")).toBeInTheDocument();
    expect(screen.getByText(/couldn't load this grow/i)).toBeInTheDocument();
    const retry = screen.getByTestId("grow-detail-retry");
    fireEvent.click(retry);
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: /back to grows/i })).toBeInTheDocument();
  });

  it("renders a not-found state with a back link", () => {
    mockState = { grow: null, loading: false, notFound: true, error: false };
    renderAt();
    expect(screen.getByTestId("grow-detail-not-found")).toBeInTheDocument();
    expect(screen.getByText(/grow not found/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to grows/i })).toBeInTheDocument();
  });

  it("never shows the not-found state while loading or erroring", () => {
    mockState = { grow: null, loading: true, notFound: false, error: false };
    const { unmount } = renderAt();
    expect(screen.queryByText(/grow not found/i)).not.toBeInTheDocument();
    unmount();
    mockState = { grow: null, loading: false, notFound: false, error: true };
    renderAt();
    expect(screen.queryByText(/grow not found/i)).not.toBeInTheDocument();
  });
});
