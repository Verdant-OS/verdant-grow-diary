// Grow detail lists the grow's tents directly under the grow name, ahead of the
// status and hub panels (Cheek, 2026-11-28). jsdom has no layout, so this pins
// document order, links and states; viewport checks are on the pull request.
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import type { GrowTentListState } from "@/hooks/useGrowDetailData";
import { tentDetailPath } from "@/lib/routes";

const GROW = "4cad3cae-21e3-42f8-8372-2f6237205db3";
const state = vi.hoisted(() => ({
  tentList: { status: "loading" } as GrowTentListState,
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
      plants: 1,
      tents: 2,
      diary: 0,
      actionsPending: 0,
      actionsTotal: 0,
      auditEvents: 0,
      alertsOpen: 0,
      alertsCritical: 0,
      alertsWarning: 0,
    },
    recent: { status: "ok", items: [] },
    status: { level: "good", reason: "Stable", pending: 0, highestRisk: "low", lastDiaryAt: null },
    outcomes: {
      status: "ready",
      summary: { improved: 0, unchanged: 0, worsened: 0, more_data_needed: 0 },
      recent: [],
      learning: { totals: { count: 0 } },
    },
    refetch: vi.fn(),
    soleTentId: null,
    tentList: state.tentList,
  }),
  EMPTY_GROW_OUTCOMES_STATE: {},
}));

vi.mock("@/components/GrowBreadcrumbs", () => ({ default: () => null }));
vi.mock("@/components/ActionOutcomeLearningReport", () => ({ default: () => null }));
vi.mock("@/components/StartPhenoHuntButton", () => ({ default: () => null }));
vi.mock("@/components/StartBreedingLogButton", () => ({ default: () => null }));
vi.mock("@/components/OneTentLoopNextStepCard", () => ({
  default: () => <div data-testid="stub-one-tent-loop-next-step" />,
}));
vi.mock("@/components/GrowTargetsEditor", () => ({ default: () => null }));
vi.mock("@/components/GrowFollowUpReviewSection", () => ({
  GrowFollowUpReviewSection: () => null,
}));
vi.mock("@/components/GrowRecoveryPrompt", () => ({ default: () => null }));
vi.mock("@/components/GrowPendingOutcomeNotice", () => ({ default: () => null }));

import GrowDetail from "@/pages/GrowDetail";

function TentRoute() {
  return <div data-testid="tent-route" />;
}

function renderGrowDetail() {
  return render(
    <MemoryRouter initialEntries={[`/grows/${GROW}`]}>
      <Routes>
        <Route path="/grows/:growId" element={<GrowDetail />} />
        <Route path="/tents/:id" element={<TentRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

function precedes(a: Element, b: Element) {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

beforeEach(() => {
  state.tentList = { status: "loading" };
});
afterEach(() => cleanup());

describe("Grow detail puts tents first", () => {
  it("lists tent names right under the grow name, ahead of status and hub panels", () => {
    state.tentList = {
      status: "ok",
      tents: [
        { id: "tent-b", name: "Veg Alpha" },
        { id: "tent-a", name: "Flower Bravo" },
      ],
    };
    renderGrowDetail();
    const glance = screen.getByTestId("grow-detail-tents-glance");
    const header = screen.getByRole("heading", { level: 1, name: "Render Grow" });
    expect(precedes(header, glance)).toBe(true);
    for (const later of [
      screen.getByTestId("stub-one-tent-loop-next-step"),
      screen.getByLabelText("Grow hub links"),
    ]) {
      expect(precedes(glance, later)).toBe(true);
    }
    expect(within(glance).getByRole("heading", { level: 2, name: "Tents (2)" })).toBeVisible();
    const links = within(glance).getAllByTestId("grow-detail-tents-glance-item");
    expect(links.map((l) => l.textContent)).toEqual(["Flower Bravo", "Veg Alpha"]);
    expect(links[0]).toHaveAttribute("href", tentDetailPath("tent-a"));
  });

  it("opens a tent from its name with the keyboard", async () => {
    const user = userEvent.setup();
    state.tentList = { status: "ok", tents: [{ id: "tent-a", name: "Flower Bravo" }] };
    renderGrowDetail();
    screen.getByTestId("grow-detail-tents-glance-item").focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByTestId("tent-route")).toBeInTheDocument();
  });

  it("says no tents only after a complete read", () => {
    state.tentList = { status: "ok", tents: [] };
    renderGrowDetail();
    expect(screen.getByTestId("grow-detail-tents-glance-empty")).toHaveTextContent(
      "No tents in this grow yet.",
    );
  });

  it("does not claim none while loading or after a failed read", () => {
    renderGrowDetail();
    expect(screen.getByTestId("grow-detail-tents-glance-loading")).toHaveTextContent(
      "Loading tents…",
    );
    cleanup();
    state.tentList = { status: "unavailable" };
    renderGrowDetail();
    expect(screen.getByTestId("grow-detail-tents-glance-unknown")).toHaveTextContent(
      "Tent list not loaded.",
    );
    expect(screen.queryByTestId("grow-detail-tents-glance-empty")).toBeNull();
  });
});
