/**
 * DashboardPendingOutcomeReviewsCard — render, count, link, wiring, and
 * safety tests for the Dashboard "Record outcomes" nudge.
 *
 * Mocks the loader hook (the hook itself is exercised indirectly through
 * the pure helper tests in pending-outcome-review-rules.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import DashboardPendingOutcomeReviewsCard from "@/components/DashboardPendingOutcomeReviewsCard";
import { stripSourceComments } from "./utils/stripSourceComments";

vi.mock("@/hooks/useDashboardPendingOutcomeReviews", () => ({
  useDashboardPendingOutcomeReviews: vi.fn(),
}));

import { useDashboardPendingOutcomeReviews } from "@/hooks/useDashboardPendingOutcomeReviews";

const ROOT = resolve(__dirname, "../..");
const COMP = stripSourceComments(
  readFileSync(
    resolve(ROOT, "src/components/DashboardPendingOutcomeReviewsCard.tsx"),
    "utf8",
  ),
);
const HOOK = stripSourceComments(
  readFileSync(
    resolve(ROOT, "src/hooks/useDashboardPendingOutcomeReviews.ts"),
    "utf8",
  ),
);
const RULES = stripSourceComments(
  readFileSync(resolve(ROOT, "src/lib/pendingOutcomeReviewRules.ts"), "utf8"),
);
const DASH = stripSourceComments(
  readFileSync(resolve(ROOT, "src/pages/Dashboard.tsx"), "utf8"),
);

function renderCard() {
  return render(
    <MemoryRouter>
      <DashboardPendingOutcomeReviewsCard scopedGrowId="g1" />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(useDashboardPendingOutcomeReviews).mockReset();
});

describe("DashboardPendingOutcomeReviewsCard render", () => {
  it("hides when no pending outcomes exist", () => {
    vi.mocked(useDashboardPendingOutcomeReviews).mockReturnValue({
      status: "ok",
      items: [],
    });
    const { container } = renderCard();
    expect(container).toBeEmptyDOMElement();
  });

  it("hides when state is loading / idle / unavailable", () => {
    for (const status of ["idle", "loading", "unavailable"] as const) {
      vi.mocked(useDashboardPendingOutcomeReviews).mockReturnValue({
        status,
      } as never);
      const { container, unmount } = renderCard();
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it("renders count and CTA when there are pending reviews", () => {
    vi.mocked(useDashboardPendingOutcomeReviews).mockReturnValue({
      status: "ok",
      items: [
        {
          action_queue_id: "a1",
          completed_at: "2026-05-29T10:00:00Z",
          suggested_change: "Lower RH by 5%",
          hours_since_completed: 26,
        },
        {
          action_queue_id: "a2",
          completed_at: "2026-05-28T10:00:00Z",
          suggested_change: "Raise temp",
          hours_since_completed: 50,
        },
      ],
    });
    renderCard();
    expect(
      screen.getByText(/Record what changed after completed actions/i),
    ).toBeInTheDocument();
    expect(screen.getByTestId("pending-outcome-reviews-count")).toHaveTextContent(
      /2 completed actions are waiting/i,
    );
    const ctas = screen.getAllByTestId("pending-outcome-review-cta");
    expect(ctas).toHaveLength(2);
    expect(ctas[0]).toHaveAttribute("href", "/actions/a1");
    expect(ctas[1]).toHaveAttribute("href", "/actions/a2");
  });

  it("uses singular copy for exactly one pending review", () => {
    vi.mocked(useDashboardPendingOutcomeReviews).mockReturnValue({
      status: "ok",
      items: [
        {
          action_queue_id: "a1",
          completed_at: "2026-05-29T10:00:00Z",
          suggested_change: null,
          hours_since_completed: 25,
        },
      ],
    });
    renderCard();
    expect(screen.getByTestId("pending-outcome-reviews-count")).toHaveTextContent(
      /1 completed action is waiting/i,
    );
  });
});

describe("DashboardPendingOutcomeReviewsCard safety + wiring", () => {
  const FORBIDDEN = [
    /\bfixed\b/i,
    /\bguaranteed\b/i,
    /\bhealthy\b/i,
    /\bresolved the issue\b/i,
    /turn on/i,
    /autopilot/i,
  ];

  it("copy avoids fixed/guaranteed/healthy/automation claims", () => {
    for (const re of FORBIDDEN) {
      expect(COMP).not.toMatch(re);
    }
  });

  it("hook is read-only (no write verbs, no rpc, no service_role)", () => {
    expect(HOOK).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
    expect(HOOK).not.toMatch(/service_role/);
    expect(HOOK).not.toMatch(/user_id\s*:/);
  });

  it("rules helper has no DB/React imports and no write verbs", () => {
    expect(RULES).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(RULES).not.toMatch(/from\s+["']react["']/);
    expect(RULES).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
  });

  it("Dashboard mounts the nudge and does not duplicate detection logic in JSX", () => {
    expect(DASH).toMatch(/DashboardPendingOutcomeReviewsCard/);
    // Detection must live in the helper, not the page.
    expect(DASH).not.toMatch(/findPendingOutcomeReviews/);
    expect(DASH).not.toMatch(/outcomeMatchesAction/);
  });
});
