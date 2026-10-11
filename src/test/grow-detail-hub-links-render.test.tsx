/**
 * Grow Detail hub link render pins.
 *
 * scoped-grow-navigation-contract.test.tsx proves wiring via source scan but
 * cannot catch regressions where *Path(growId) is dropped at render time.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";

const GROW = "4cad3cae-21e3-42f8-8372-2f6237205db3";

const refetch = vi.fn();

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
    counts: {
      plants: 2,
      tents: 1,
      diary: 5,
      actionsPending: 0,
      actionsTotal: 1,
      auditEvents: 0,
      alertsOpen: 0,
      alertsCritical: 0,
      alertsWarning: 0,
    },
    recent: { status: "ok", items: [] },
    status: {
      level: "ok",
      reason: "Stable",
      pending: "none",
      highestRisk: "low",
      lastDiaryAt: null,
    },
    outcomes: {
      status: "ready",
      summary: { improved: 0, unchanged: 0, worsened: 0, more_data_needed: 0 },
      recent: [],
      learning: { totals: { count: 0 } },
    },
    refetch,
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

function hubHref(title: string): string | null {
  const section = screen.getByLabelText("Grow hub links");
  const link = within(section).getByRole("link", { name: new RegExp(title, "i") });
  return link.getAttribute("href");
}

function renderGrowDetail() {
  return render(
    <MemoryRouter initialEntries={[`/grows/${GROW}`]}>
      <Routes>
        <Route path="/grows/:growId" element={<GrowDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Grow Detail hub links — rendered hrefs", () => {
  beforeEach(() => {
    refetch.mockClear();
  });

  it("carries growId on Timeline, Plants, Tents, Action Queue, Alerts, and Dashboard hub links", () => {
    renderGrowDetail();

    expect(hubHref("Timeline")).toBe(`/timeline?growId=${GROW}`);
    expect(hubHref("Plants")).toBe(`/plants?growId=${GROW}`);
    expect(hubHref("Tents")).toBe(`/tents?growId=${GROW}`);
    expect(hubHref("Action Queue")).toBe(`/actions?growId=${GROW}`);
    expect(hubHref("Alerts")).toBe(`/alerts?growId=${GROW}`);
    expect(hubHref("Dashboard")).toBe(`/dashboard?growId=${GROW}`);
  });

  it("carries growId on Learning review hub link", () => {
    renderGrowDetail();

    expect(hubHref("Learning review")).toBe(`/grows/${GROW}/learning`);
  });
});
