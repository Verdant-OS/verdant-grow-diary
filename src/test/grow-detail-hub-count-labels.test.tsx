/**
 * Grow Detail hub cards omit a status when they have no count, and use a
 * singular noun when a real count is exactly 1.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";

const GROW = "4cad3cae-21e3-42f8-8372-2f6237205db3";

const counts = vi.hoisted(() => ({
  plants: 1 as number | "unavailable",
  tents: 1 as number | "unavailable",
  diary: 2 as number | "unavailable",
  actionsPending: 0 as number | "unavailable",
  actionsTotal: 3 as number | "unavailable",
  auditEvents: 0 as number | "unavailable",
  alertsOpen: 0 as number | "unavailable",
  alertsCritical: 0 as number | "unavailable",
  alertsWarning: 0 as number | "unavailable",
}));

vi.mock("@/hooks/useGrowDetailData", () => ({
  useGrowDetailData: () => ({
    grow: {
      id: GROW,
      name: "Render Grow",
      stage: "veg",
      grow_type: "indoor",
      is_archived: false,
      notes: null,
      started_at: "2026-01-01T00:00:00.000Z",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
    },
    growId: GROW,
    loading: false,
    notFound: false,
    error: false,
    counts,
    recent: { status: "ok", items: [] },
    status: {
      level: "good",
      reason: "Stable",
      pending: 0,
      highestRisk: "low",
      lastDiaryAt: null,
    },
    outcomes: {
      status: "ready",
      summary: { improved: 0, unchanged: 0, worsened: 0, more_data_needed: 0 },
      recent: [],
      learning: { totals: { count: 0 } },
    },
    refetch: vi.fn(),
    soleTentId: null,
  }),
  EMPTY_GROW_OUTCOMES_STATE: {},
}));

vi.mock("@/components/GrowBreadcrumbs", () => ({ default: () => null }));
vi.mock("@/components/ActionOutcomeLearningReport", () => ({ default: () => null }));
vi.mock("@/components/StartPhenoHuntButton", () => ({ default: () => null }));
vi.mock("@/components/StartBreedingLogButton", () => ({ default: () => null }));
vi.mock("@/components/OneTentLoopNextStepCard", () => ({ default: () => null }));
vi.mock("@/components/GrowTargetsEditor", () => ({ default: () => null }));
vi.mock("@/components/GrowFollowUpReviewSection", () => ({
  GrowFollowUpReviewSection: () => null,
}));
vi.mock("@/components/GrowRecoveryPrompt", () => ({ default: () => null }));
vi.mock("@/components/GrowPendingOutcomeNotice", () => ({ default: () => null }));

import GrowDetail from "@/pages/GrowDetail";

function renderGrowDetail() {
  return render(
    <MemoryRouter initialEntries={[`/grows/${GROW}`]}>
      <Routes>
        <Route path="/grows/:growId" element={<GrowDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

function hubLink(title: string) {
  const section = screen.getByLabelText("Grow hub links");
  return within(section).getByRole("link", { name: new RegExp(title, "i") });
}

describe("Grow Detail hub count labels", () => {
  beforeEach(() => {
    counts.plants = 1;
    counts.tents = 1;
    counts.diary = 2;
    counts.actionsTotal = 3;
  });

  it("omits a count on Dashboard and Learning review", () => {
    renderGrowDetail();

    expect(hubLink("Dashboard").textContent).not.toMatch(/Unavailable/i);
    expect(hubLink("Learning review").textContent).not.toMatch(/Unavailable/i);
    expect(screen.queryByTestId("count-dashboard")).toBeNull();
    expect(screen.queryByTestId("count-learning-review")).toBeNull();
  });

  it("uses the singular noun when the count is exactly 1", () => {
    renderGrowDetail();

    expect(screen.getByTestId("count-plants")).toHaveTextContent("1");
    expect(hubLink("Plants").textContent).toContain("1 plant");
    expect(hubLink("Plants").textContent).not.toContain("1 plants");
    expect(screen.getByTestId("count-tents")).toHaveTextContent("1");
    expect(hubLink("Tents").textContent).toContain("1 tent");
    expect(hubLink("Tents").textContent).not.toContain("1 tents");
  });

  it("keeps the plural label for other counts and Unavailable when a read failed", () => {
    counts.plants = 2;
    counts.tents = "unavailable";
    renderGrowDetail();

    expect(hubLink("Plants").textContent).toMatch(/2 plants/);
    expect(screen.getByTestId("count-tents")).toHaveTextContent("Unavailable");
    expect(hubLink("Tents").textContent).toMatch(/Unavailable tents/);
  });
});
