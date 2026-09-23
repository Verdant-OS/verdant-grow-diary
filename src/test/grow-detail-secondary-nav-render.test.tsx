/**
 * Grow Detail secondary navigation render pins.
 *
 * Follow-up to grow-detail-hub-links-render.test.tsx (#1605). Hub grid links
 * are covered there; this file pins the other grow-scoped outbound links that
 * only had source-scan coverage (grow-detail-recent.test.ts,
 * scoped-grow-navigation-contract.test.tsx).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";

const GROW = "4cad3cae-21e3-42f8-8372-2f6237205db3";

const refetch = vi.fn();
let pendingActions = 0;

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    entitlement: {
      effectivePlanId: "pro_monthly",
      displayPlanId: "pro_monthly",
      status: "active",
      isActive: true,
      capabilities: {},
      degraded: false,
      degradedReason: null,
    },
    loading: false,
    lookupFailed: false,
  }),
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
    counts: {
      plants: 2,
      tents: 1,
      diary: 5,
      actionsPending: pendingActions,
      actionsTotal: pendingActions,
      auditEvents: 0,
      alertsOpen: 0,
      alertsCritical: 0,
      alertsWarning: 0,
    },
    recent: { status: "ok", items: [] },
    status: {
      level: "good",
      reason: "Stable",
      pending: pendingActions,
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

describe("Grow Detail secondary nav — rendered hrefs", () => {
  beforeEach(() => {
    refetch.mockClear();
    pendingActions = 0;
  });

  it("carries growId on Recent activity View full Timeline link", () => {
    renderGrowDetail();

    const section = screen.getByLabelText("Recent activity");
    const link = within(section).getByRole("link", { name: /View full Timeline/i });
    expect(link.getAttribute("href")).toBe(`/timeline?growId=${GROW}`);
  });

  it("carries growId on Grow status card View Timeline link", () => {
    renderGrowDetail();

    const card = screen.getByTestId("grow-status-card");
    const link = within(card).getByRole("link", { name: /View Timeline/i });
    expect(link.getAttribute("href")).toBe(`/timeline?growId=${GROW}`);
  });

  it("carries growId on Review pending actions when pending count is positive", () => {
    pendingActions = 2;
    renderGrowDetail();

    const card = screen.getByTestId("grow-status-card");
    const link = within(card).getByRole("link", { name: /Review pending actions/i });
    expect(link.getAttribute("href")).toBe(`/actions?growId=${GROW}`);
  });

  it("does not render Review pending actions when pending count is zero", () => {
    pendingActions = 0;
    renderGrowDetail();

    const card = screen.getByTestId("grow-status-card");
    expect(within(card).queryByRole("link", { name: /Review pending actions/i })).toBeNull();
  });

  it("carries growId on Start Pheno Hunt and Log Breeding Event header CTAs", () => {
    renderGrowDetail();

    const pheno = screen.getByTestId("start-pheno-hunt-btn").closest("a");
    expect(pheno?.getAttribute("href")).toBe(`/pheno-hunts/new?growId=${GROW}`);

    const breeding = screen.getByTestId("start-breeding-log-btn").closest("a");
    expect(breeding?.getAttribute("href")).toBe(`/breeding/log/new?growId=${GROW}`);
  });
});
