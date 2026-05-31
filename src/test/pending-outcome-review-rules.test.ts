import { describe, it, expect } from "vitest";
import {
  findPendingOutcomeReviews,
  PENDING_OUTCOME_REVIEW_THRESHOLD_MS,
} from "@/lib/pendingOutcomeReviewRules";

const NOW = new Date("2026-05-30T12:00:00Z").getTime();
const HOUR = 60 * 60 * 1000;

function completedAction(
  overrides: Partial<{
    id: string;
    status: string;
    completed_at: string | null;
    suggested_change: string | null;
  }> = {},
) {
  return {
    id: "a1",
    status: "completed",
    completed_at: new Date(NOW - 26 * HOUR).toISOString(),
    suggested_change: "Lower RH by 5%",
    ...overrides,
  };
}

function outcomeRow(actionId: string) {
  return {
    details: {
      event_type: "action_outcome",
      action_queue_id: actionId,
      outcome_kind: "post_action_observation",
    },
  };
}

describe("findPendingOutcomeReviews", () => {
  it("flags completed actions older than 24h with no outcome", () => {
    const reviews = findPendingOutcomeReviews({
      completedActions: [completedAction()],
      outcomes: [],
      now: NOW,
    });
    expect(reviews).toHaveLength(1);
    expect(reviews[0].action_queue_id).toBe("a1");
    expect(reviews[0].hours_since_completed).toBe(26);
    expect(reviews[0].suggested_change).toBe("Lower RH by 5%");
  });

  it("hides completed actions younger than 24h", () => {
    const reviews = findPendingOutcomeReviews({
      completedActions: [
        completedAction({
          completed_at: new Date(NOW - 5 * HOUR).toISOString(),
        }),
      ],
      outcomes: [],
      now: NOW,
    });
    expect(reviews).toHaveLength(0);
  });

  it("hides actions with an existing matching outcome row", () => {
    const reviews = findPendingOutcomeReviews({
      completedActions: [completedAction({ id: "a1" })],
      outcomes: [outcomeRow("a1")],
      now: NOW,
    });
    expect(reviews).toHaveLength(0);
  });

  it("returns correct count for multiple actions, ignoring matched ones", () => {
    const reviews = findPendingOutcomeReviews({
      completedActions: [
        completedAction({ id: "a1" }),
        completedAction({
          id: "a2",
          completed_at: new Date(NOW - 48 * HOUR).toISOString(),
        }),
        completedAction({ id: "a3" }),
      ],
      outcomes: [outcomeRow("a3")],
      now: NOW,
    });
    expect(reviews.map((r) => r.action_queue_id)).toEqual(["a2", "a1"]);
  });

  it("ignores non-completed statuses", () => {
    const reviews = findPendingOutcomeReviews({
      completedActions: [
        completedAction({ status: "pending_approval" }),
        completedAction({ status: "rejected" }),
      ],
      outcomes: [],
      now: NOW,
    });
    expect(reviews).toHaveLength(0);
  });

  it("ignores rows with missing or invalid completed_at", () => {
    const reviews = findPendingOutcomeReviews({
      completedActions: [
        completedAction({ id: "a1", completed_at: null }),
        completedAction({ id: "a2", completed_at: "not-a-date" }),
      ],
      outcomes: [],
      now: NOW,
    });
    expect(reviews).toHaveLength(0);
  });

  it("uses the documented 24h threshold by default", () => {
    expect(PENDING_OUTCOME_REVIEW_THRESHOLD_MS).toBe(24 * HOUR);
  });
});
