import { describe, it, expect } from "vitest";
import {
  buildTentPendingOutcomeNoticeViewModel,
  type TentPendingOutcomeNoticeSourceRow,
} from "@/lib/tentPendingOutcomeNoticeRules";
import { PRE_WINDOW_HOURS } from "@/lib/actionOutcomeWindowRules";

const TENT = "tent-1";
const OTHER = "tent-2";

function row(
  overrides: Partial<TentPendingOutcomeNoticeSourceRow> = {},
): TentPendingOutcomeNoticeSourceRow {
  return {
    action_queue_id: "a1",
    plant_id: "plant-1",
    tent_id: TENT,
    grow_id: "grow-1",
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

describe("buildTentPendingOutcomeNoticeViewModel", () => {
  it("happy path: returns tent-matching items with ActionDetail outcome href", () => {
    const vm = buildTentPendingOutcomeNoticeViewModel({
      tentId: TENT,
      pendingReviews: [row()],
    });
    expect(vm.items).toHaveLength(1);
    expect(vm.items[0]).toMatchObject({
      actionId: "a1",
      tentId: TENT,
      plantId: "plant-1",
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
    const vm = buildTentPendingOutcomeNoticeViewModel({
      tentId: TENT,
      pendingReviews: [row({ tent_id: OTHER })],
    });
    expect(vm).toEqual({ items: [] });
  });

  it("returns empty for null tentId, null rows, and malformed entries", () => {
    expect(
      buildTentPendingOutcomeNoticeViewModel({
        tentId: null,
        pendingReviews: [row()],
      }),
    ).toEqual({ items: [] });

    expect(
      buildTentPendingOutcomeNoticeViewModel({
        tentId: TENT,
        pendingReviews: null,
      }),
    ).toEqual({ items: [] });

    expect(
      buildTentPendingOutcomeNoticeViewModel({
        tentId: TENT,
        pendingReviews: [
          null as unknown as TentPendingOutcomeNoticeSourceRow,
          row({ action_queue_id: "   " }),
          row({ tent_id: null }),
          row({ completed_at: "not-a-date", approved_at: null }),
        ],
      }),
    ).toEqual({ items: [] });
  });

  it("sorts by due timestamp ascending with action id as tie-breaker", () => {
    const sharedCompleted = "2026-05-28T10:00:00.000Z";
    const vm = buildTentPendingOutcomeNoticeViewModel({
      tentId: TENT,
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
    const vm = buildTentPendingOutcomeNoticeViewModel({
      tentId: TENT,
      pendingReviews: [row({ action_queue_id: "a1" }), row({ action_queue_id: "a2" })],
      outcomes: [outcomeFor("a1")],
    });
    expect(vm.items.map((i) => i.actionId)).toEqual(["a2"]);
  });

  it("does not match plant-only rows that lack tent_id", () => {
    const vm = buildTentPendingOutcomeNoticeViewModel({
      tentId: TENT,
      pendingReviews: [row({ tent_id: null, plant_id: "plant-1" })],
    });
    expect(vm).toEqual({ items: [] });
  });
});
