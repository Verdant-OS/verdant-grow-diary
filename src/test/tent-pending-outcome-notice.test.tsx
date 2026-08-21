/**
 * TentPendingOutcomeNotice — render + safety tests.
 * Mocks the shared Dashboard pending-outcome loader; pure filtering is
 * covered in tent-pending-outcome-notice-rules.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { stripSourceComments } from "./utils/stripSourceComments";

vi.mock("@/hooks/useDashboardPendingOutcomeReviews", () => ({
  useDashboardPendingOutcomeReviews: vi.fn(),
}));

import { useDashboardPendingOutcomeReviews } from "@/hooks/useDashboardPendingOutcomeReviews";
import TentPendingOutcomeNotice from "@/components/TentPendingOutcomeNotice";

const ROOT = resolve(__dirname, "../..");
const COMP = stripSourceComments(
  readFileSync(resolve(ROOT, "src/components/TentPendingOutcomeNotice.tsx"), "utf8"),
);
const PAGE = stripSourceComments(readFileSync(resolve(ROOT, "src/pages/TentDetail.tsx"), "utf8"));

function renderNotice() {
  return render(
    <MemoryRouter>
      <TentPendingOutcomeNotice growId="g1" tentId="tent-1" />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(useDashboardPendingOutcomeReviews).mockReset();
});

describe("TentPendingOutcomeNotice render", () => {
  it("renders nothing when the filtered list is empty", () => {
    vi.mocked(useDashboardPendingOutcomeReviews).mockReturnValue({
      status: "ok",
      items: [
        {
          action_queue_id: "a1",
          completed_at: "2026-05-28T10:00:00Z",
          approved_at: null,
          plant_id: "plant-1",
          tent_id: "other-tent",
          grow_id: "g1",
          suggested_change: "Lower RH",
          hours_since_completed: 30,
        },
      ],
    });
    const { container } = renderNotice();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while loading / idle / unavailable", () => {
    for (const status of ["idle", "loading", "unavailable"] as const) {
      vi.mocked(useDashboardPendingOutcomeReviews).mockReturnValue({
        status,
      } as never);
      const { container, unmount } = renderNotice();
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it("happy path: lists tent-scoped pending outcomes linking to ActionDetail", () => {
    vi.mocked(useDashboardPendingOutcomeReviews).mockReturnValue({
      status: "ok",
      items: [
        {
          action_queue_id: "a1",
          completed_at: "2026-05-28T10:00:00Z",
          approved_at: null,
          plant_id: "plant-1",
          tent_id: "tent-1",
          grow_id: "g1",
          suggested_change: "Lower RH by 5%",
          hours_since_completed: 30,
        },
        {
          action_queue_id: "a2",
          completed_at: "2026-05-27T10:00:00Z",
          approved_at: null,
          plant_id: "plant-2",
          tent_id: "other",
          grow_id: "g1",
          suggested_change: "Raise temp",
          hours_since_completed: 54,
        },
      ],
    });
    renderNotice();
    expect(screen.getByTestId("tent-pending-outcome-notice")).toBeInTheDocument();
    expect(screen.getByTestId("tent-pending-outcome-notice-count")).toHaveTextContent(
      /1 completed action is waiting/i,
    );
    expect(screen.getByText("Lower RH by 5%")).toBeInTheDocument();
    expect(screen.queryByText("Raise temp")).not.toBeInTheDocument();
    const cta = screen.getByTestId("tent-pending-outcome-notice-cta");
    expect(cta).toHaveAttribute("href", "/actions/a1#outcome-section");
  });
});

describe("TentPendingOutcomeNotice safety", () => {
  it("never renders an approve or execute control", () => {
    vi.mocked(useDashboardPendingOutcomeReviews).mockReturnValue({
      status: "ok",
      items: [
        {
          action_queue_id: "a1",
          completed_at: "2026-05-28T10:00:00Z",
          approved_at: null,
          plant_id: "plant-1",
          tent_id: "tent-1",
          grow_id: "g1",
          suggested_change: "Lower RH by 5%",
          hours_since_completed: 30,
        },
      ],
    });
    renderNotice();
    expect(screen.queryByRole("button", { name: /approve/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /execute/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /complete/i })).toBeNull();
    expect(screen.queryByTestId(/approve|execute|complete/i)).toBeNull();
    expect(screen.getByTestId("tent-pending-outcome-notice-cta").tagName).toBe("A");
  });

  it("component source has no mutation verbs or transition controls", () => {
    expect(COMP).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
    expect(COMP).not.toMatch(/action_queue_transition|approveAction|completeAction|executeAction/);
    expect(COMP).not.toMatch(/service_role/);
  });

  it("TentDetail mounts the notice and does not inline detection in JSX", () => {
    expect(PAGE).toMatch(/TentPendingOutcomeNotice/);
    expect(PAGE).not.toMatch(/buildTentPendingOutcomeNoticeViewModel/);
    expect(PAGE).not.toMatch(/findPendingOutcomeReviews/);
  });
});
