import { describe, it, expect } from "vitest";
import {
  buildGrowPendingOutcomeNoticeViewModel,
  type GrowPendingOutcomeNoticeSourceRow,
} from "@/lib/growPendingOutcomeNoticeRules";
import { PRE_WINDOW_HOURS } from "@/lib/actionOutcomeWindowRules";

const GROW = "grow-1";
const OTHER = "grow-2";

function row(
  overrides: Partial<GrowPendingOutcomeNoticeSourceRow> = {},
): GrowPendingOutcomeNoticeSourceRow {
  return {
    action_queue_id: "a1",
    plant_id: "plant-1",
    tent_id: "tent-1",
    grow_id: GROW,
    completed_at: "2026-05-28T10:00:00.000Z",
    approved_at: "2026-05-27T10:00:00.000Z",
    suggested_change: "Lower RH by 5%",
    hours_since_completed: 48,
    ...overrides,
  };
}

function outcomeFor(actionId: string) {
  return {
    details: {
      event_type: "action_outcome",
      action_queue_id: actionId,
      outcome_kind: "24h_recheck",
    },
  };
}

describe("buildGrowPendingOutcomeNoticeViewModel", () => {
  it("happy path: returns grow-matching items with ActionDetail outcome href", () => {
    const vm = buildGrowPendingOutcomeNoticeViewModel({
      growId: GROW,
      pendingReviews: [row()],
    });
    expect(vm.items).toHaveLength(1);
    expect(vm.items[0]).toMatchObject({
      actionId: "a1",
      growId: GROW,
      plantId: "plant-1",
      tentId: "tent-1",
      suggestedChange: "Lower RH by 5%",
      hoursSinceCompleted: 48,
      href: "/actions/a1#outcome-section",
    });
    expect(vm.items[0].dueAt).toBe(
      new Date(
        Date.parse("2026-05-28T10:00:00.000Z") + PRE_WINDOW_HOURS * 3_600_000,
      ).toISOString(),
    );
  });

  it("returns an explicit empty list when nothing matches", () => {
    const vm = buildGrowPendingOutcomeNoticeViewModel({
      growId: GROW,
      pendingReviews: [row({ grow_id: OTHER })],
    });
    expect(vm).toEqual({ items: [] });
  });

  it("returns empty for null growId, null rows, and malformed entries", () => {
    expect(
      buildGrowPendingOutcomeNoticeViewModel({
        growId: null,
        pendingReviews: [row()],
      }),
    ).toEqual({ items: [] });

    expect(
      buildGrowPendingOutcomeNoticeViewModel({
        growId: GROW,
        pendingReviews: null,
      }),
    ).toEqual({ items: [] });

    expect(
      buildGrowPendingOutcomeNoticeViewModel({
        growId: GROW,
        pendingReviews: [
          null as unknown as GrowPendingOutcomeNoticeSourceRow,
          row({ action_queue_id: "   " }),
          row({ grow_id: null }),
          row({ completed_at: "not-a-date", approved_at: null }),
        ],
      }),
    ).toEqual({ items: [] });
  });

  it("sorts by due timestamp ascending with action id as tie-breaker", () => {
    const sharedCompleted = "2026-05-28T10:00:00.000Z";
    const vm = buildGrowPendingOutcomeNoticeViewModel({
      growId: GROW,
      pendingReviews: [
        row({
          action_queue_id: "z-late",
          completed_at: "2026-05-29T10:00:00.000Z",
          approved_at: null,
        }),
        row({
          action_queue_id: "b-tied",
          completed_at: sharedCompleted,
          approved_at: null,
        }),
        row({
          action_queue_id: "a-tied",
          completed_at: sharedCompleted,
          approved_at: null,
        }),
        row({
          action_queue_id: "c-early",
          completed_at: "2026-05-27T10:00:00.000Z",
          approved_at: null,
        }),
      ],
    });
    expect(vm.items.map((i) => i.actionId)).toEqual([
      "c-early",
      "a-tied",
      "b-tied",
      "z-late",
    ]);
  });

  it("drops rows that already have a matching outcome when outcomes are provided", () => {
    const vm = buildGrowPendingOutcomeNoticeViewModel({
      growId: GROW,
      pendingReviews: [row({ action_queue_id: "a1" }), row({ action_queue_id: "a2" })],
      outcomes: [outcomeFor("a1")],
    });
    expect(vm.items.map((i) => i.actionId)).toEqual(["a2"]);
  });

  it("includes tent-level and plant-level rows when grow_id matches", () => {
    const vm = buildGrowPendingOutcomeNoticeViewModel({
      growId: GROW,
      pendingReviews: [
        row({ action_queue_id: "plant-scoped", plant_id: "p1", tent_id: null }),
        row({ action_queue_id: "tent-scoped", plant_id: null, tent_id: "t1" }),
        row({ action_queue_id: "other-grow", grow_id: OTHER }),
      ],
    });
    expect(vm.items.map((i) => i.actionId)).toEqual(["plant-scoped", "tent-scoped"]);
  });
});
