import { describe, it, expect } from "vitest";
import {
  buildPlantPendingOutcomeNoticeViewModel,
  type PlantPendingOutcomeNoticeSourceRow,
} from "@/lib/plantPendingOutcomeNoticeRules";
import { PRE_WINDOW_HOURS } from "@/lib/actionOutcomeWindowRules";

const PLANT = "plant-1";
const OTHER = "plant-2";

function row(
  overrides: Partial<PlantPendingOutcomeNoticeSourceRow> = {},
): PlantPendingOutcomeNoticeSourceRow {
  return {
    action_queue_id: "a1",
    plant_id: PLANT,
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

describe("buildPlantPendingOutcomeNoticeViewModel", () => {
  it("happy path: returns plant-matching items with ActionDetail outcome href", () => {
    const vm = buildPlantPendingOutcomeNoticeViewModel({
      plantId: PLANT,
      pendingReviews: [row()],
    });
    expect(vm.items).toHaveLength(1);
    expect(vm.items[0]).toMatchObject({
      actionId: "a1",
      plantId: PLANT,
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
    const vm = buildPlantPendingOutcomeNoticeViewModel({
      plantId: PLANT,
      pendingReviews: [row({ plant_id: OTHER })],
    });
    expect(vm).toEqual({ items: [] });
  });

  it("returns empty for null plantId, null rows, and malformed entries", () => {
    expect(
      buildPlantPendingOutcomeNoticeViewModel({
        plantId: null,
        pendingReviews: [row()],
      }),
    ).toEqual({ items: [] });

    expect(
      buildPlantPendingOutcomeNoticeViewModel({
        plantId: PLANT,
        pendingReviews: null,
      }),
    ).toEqual({ items: [] });

    expect(
      buildPlantPendingOutcomeNoticeViewModel({
        plantId: PLANT,
        pendingReviews: [
          null as unknown as PlantPendingOutcomeNoticeSourceRow,
          row({ action_queue_id: "   " }),
          row({ plant_id: null }),
          row({ completed_at: "not-a-date", approved_at: null }),
          row({ action_queue_id: undefined, plant_id: PLANT }),
        ],
      }),
    ).toEqual({ items: [] });
  });

  it("sorts by due timestamp ascending with action id as tie-breaker", () => {
    const sharedCompleted = "2026-05-28T10:00:00.000Z";
    const vm = buildPlantPendingOutcomeNoticeViewModel({
      plantId: PLANT,
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
    const vm = buildPlantPendingOutcomeNoticeViewModel({
      plantId: PLANT,
      pendingReviews: [row({ action_queue_id: "a1" }), row({ action_queue_id: "a2" })],
      outcomes: [outcomeFor("a1")],
    });
    expect(vm.items.map((i) => i.actionId)).toEqual(["a2"]);
  });

  it("falls back to approved_at when completed_at is missing", () => {
    const vm = buildPlantPendingOutcomeNoticeViewModel({
      plantId: PLANT,
      pendingReviews: [
        row({
          action_queue_id: "approved-only",
          completed_at: null,
          approved_at: "2026-05-26T08:00:00.000Z",
        }),
      ],
    });
    expect(vm.items).toHaveLength(1);
    expect(vm.items[0].sortTimestamp).toBe("2026-05-26T08:00:00.000Z");
    expect(vm.items[0].dueAt).toBeNull();
  });
});
