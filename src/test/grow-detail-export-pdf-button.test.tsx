/**
 * GrowDetail — Export PDF button smoke test.
 *
 * Verifies the "Export PDF" button renders and calls the pure export
 * helper. All data hooks are mocked so no Supabase calls fire.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const exportSpy = vi.hoisted(() => vi.fn(() => "printed" as const));
vi.mock("@/lib/growDiaryPdfExport", () => ({
  exportGrowDiaryReportAsPdf: exportSpy,
}));

vi.mock("@/hooks/useGrowDetailData", () => ({
  useGrowDetailData: () => ({
    grow: {
      id: "g1",
      name: "OG Kush",
      stage: "veg",
      grow_type: "photo",
      is_archived: false,
      started_at: "2026-06-01T00:00:00Z",
      created_at: "2026-06-01T00:00:00Z",
      updated_at: "2026-07-01T00:00:00Z",
      notes: null,
    },
    growId: "g1",
    loading: false,
    notFound: false,
    error: false,
    counts: {
      plants: 1,
      tents: 1,
      diary: 4,
      actionsPending: 0,
      actionsTotal: 0,
      auditEvents: 0,
      alertsOpen: 0,
      alertsCritical: 0,
      alertsWarning: 0,
    },
    recent: { status: "ok", items: [] },
    status: {
      level: "good",
      reason: "OK",
      pending: 0,
      highestRisk: "low",
      lastDiaryAt: null,
    },
    outcomes: {
      status: "ready",
      summary: { improved: 0, unchanged: 0, worsened: 0, more_data_needed: 0 },
      recent: [],
      learning: { summary: null, mostConsistentImprovers: [], missingFollowUps: 0 },
    },
    refetch: vi.fn(),
  }),
}));

// Silence noisy sub-components that fetch or render maps.
vi.mock("@/components/StartPhenoHuntButton", () => ({ default: () => null }));
vi.mock("@/components/OneTentLoopNextStepCard", () => ({ default: () => null }));
vi.mock("@/components/GrowTargetsEditor", () => ({ default: () => null }));
vi.mock("@/components/ActionOutcomeLearningReport", () => ({ default: () => null }));
vi.mock("@/components/GrowBreadcrumbs", () => ({ default: () => null }));

import GrowDetail from "@/pages/GrowDetail";

beforeEach(() => {
  exportSpy.mockClear();
});

describe("GrowDetail — Export PDF button", () => {
  it("renders and calls export helper exactly once", () => {
    render(
      <MemoryRouter>
        <GrowDetail />
      </MemoryRouter>,
    );
    const btn = screen.getByTestId("grow-detail-export-pdf");
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(exportSpy).toHaveBeenCalledTimes(1);
    const arg = exportSpy.mock.calls[0][0] as { grow: { name: string } };
    expect(arg.grow.name).toBe("OG Kush");
  });
});
