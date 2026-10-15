import { describe, expect, it } from "vitest";
import {
  buildReportsHubOnboarding,
  type ReportsHubOnboardingInput,
} from "@/lib/reportsHubOnboarding";

const emptyGrow: ReportsHubOnboardingInput = {
  growId: "grow-1",
  diaryEntriesTotal: 0,
  recentSensorReadingCount: 0,
  latestSensorCapturedAt: null,
  outcomeTotal: 0,
  alertsOpen: 0,
};

describe("reports hub onboarding plant count", () => {
  it("shows the add-plant card when the grow has zero plants and zero diary entries", () => {
    const { visible, cards } = buildReportsHubOnboarding({ ...emptyGrow, plantCount: 0 });
    expect(visible).toBe(true);
    expect(cards.map((card) => card.id)).toContain("add_plant");
  });

  it("hides the add-plant card when the grow already has one plant and zero diary entries", () => {
    const { visible, cards } = buildReportsHubOnboarding({ ...emptyGrow, plantCount: 1 });
    expect(visible).toBe(true);
    expect(cards.map((card) => card.id)).not.toContain("add_plant");
    expect(cards.map((card) => card.id)).toEqual(["add_sensor_snapshot", "review_action_outcome"]);
  });

  it("hides the add-plant card while the plant count is still unknown", () => {
    const { visible, cards } = buildReportsHubOnboarding({ ...emptyGrow, plantCount: null });
    expect(visible).toBe(true);
    expect(cards.map((card) => card.id)).toEqual(["add_sensor_snapshot", "review_action_outcome"]);
  });

  it("hides the whole section when there is one diary entry", () => {
    const { visible, cards } = buildReportsHubOnboarding({
      ...emptyGrow,
      diaryEntriesTotal: 1,
      plantCount: 1,
    });
    expect(visible).toBe(false);
    expect(cards).toEqual([]);
  });
});
