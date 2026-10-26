/**
 * Filming bug #5 (2026-10-22): the grow overview mixed date styles —
 * "1/1/2026, 12:00:00 AM" (toLocaleString, with seconds), date-only
 * toLocaleDateString, and other cards' "Jan 1, 2026, 12:00 AM". Every
 * timestamp on the page now uses the shared formatSnapshotTimestamp.
 */
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { formatSnapshotTimestamp } from "@/lib/dateFormat";
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
    recent: {
      status: "ok",
      items: [
        {
          id: "r1",
          kind: "diary",
          title: "Watered AF-01",
          detail: null,
          ts: "2026-10-21T18:30:45.000Z",
        },
      ],
    },
    status: {
      level: "good",
      reason: "Stable",
      pending: 0,
      highestRisk: "low",
      lastDiaryAt: "2026-10-21T18:30:45.000Z",
    },
    outcomes: {
      status: "ready",
      summary: { improved: 0, unchanged: 0, worsened: 0, more_data_needed: 0 },
      recent: [
        {
          diary_entry_id: "o1",
          action_queue_id: "a1",
          label: "Improved",
          metric: "rh",
          suggested_change: null,
          recorded_at: "2026-10-20T09:05:07.000Z",
        },
      ],
      learning: {
        totals: {
          total: 1,
          improved: 1,
          unchanged: 0,
          worsened: 0,
          more_data_needed: 0,
          unknown: 0,
        },
        needs_more_data: false,
        groups: [],
        examples: [
          {
            diary_entry_id: "o1",
            action_queue_id: "a1",
            source_alert_id: null,
            outcome_status: "improved",
            outcome_label: "Improved",
            metric: "rh",
            suggested_change: null,
            note_summary: null,
            recorded_at: "2026-10-20T09:05:07.000Z",
          },
        ],
      },
    },
    refetch: vi.fn(),
    soleTentId: null,
  }),
  EMPTY_GROW_OUTCOMES_STATE: {},
}));

vi.mock("@/components/GrowBreadcrumbs", () => ({ default: () => null }));
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

const NUMERIC_DATE = /\b\d{1,2}\/\d{1,2}\/\d{4}\b/;
const WITH_SECONDS = /\d{1,2}:\d{2}:\d{2}/;

describe("Grow overview uses one date format", () => {
  it("renders every timestamp with the shared snapshot formatter", () => {
    const { container } = renderGrowDetail();
    const text = container.textContent ?? "";
    expect(text).not.toMatch(NUMERIC_DATE);
    expect(text).not.toMatch(WITH_SECONDS);
    for (const ts of [
      "2026-01-01T00:00:00.000Z",
      "2026-01-02T00:00:00.000Z",
      "2026-10-21T18:30:45.000Z",
      "2026-10-20T09:05:07.000Z",
    ]) {
      expect(text).toContain(formatSnapshotTimestamp(ts));
    }
  });
});
