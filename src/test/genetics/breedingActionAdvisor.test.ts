import { describe, it, expect } from "vitest";
import { 
  suggestBreedingFollowUpActions, 
  BreedingEvent 
} from "../../lib/genetics/breedingActionAdvisor";

describe("breedingActionAdvisor", () => {
  it("creates high risk 1 day suggestion for heavy pollen shed", () => {
    const event: BreedingEvent = {
      id: "ev_1",
      type: "pollen_shed_observed",
      occurred_at: "2026-06-23T10:00:00Z",
      details: { intensity: "heavy" },
    };

    const actions = suggestBreedingFollowUpActions(event);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      title: "Inspect receivers for receptive stigmas",
      due_offset_days: 1,
      risk_level: "high",
    });
    expect(actions[0].reason).toContain("Heavy pollen shed");
    expect(actions[0].reason).toContain("2026-06-23");
  });

  it("creates medium risk 2 day suggestion for moderate pollen shed", () => {
    const event: BreedingEvent = {
      id: "ev_2",
      type: "pollen_shed_observed",
      occurred_at: "2026-06-23T10:00:00Z",
      details: { intensity: "moderate" },
    };

    const actions = suggestBreedingFollowUpActions(event);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      due_offset_days: 2,
      risk_level: "medium",
    });
    expect(actions[0].reason).toContain("Moderate pollen shed");
    expect(actions[0].next_steps).toContain("Monitor daily for the next 3 days");
  });

  it("creates medium risk 2 day suggestion for light pollen shed", () => {
    const event: BreedingEvent = {
      id: "ev_3",
      type: "pollen_shed_observed",
      occurred_at: "2026-06-23T10:00:00Z",
      details: { intensity: "light" },
    };

    const actions = suggestBreedingFollowUpActions(event);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      due_offset_days: 2,
      risk_level: "medium",
    });
    expect(actions[0].reason).toContain("Light pollen shed");
  });

  it("creates medium risk 2 day suggestion for missing intensity", () => {
    const event: BreedingEvent = {
      id: "ev_4",
      type: "pollen_shed_observed",
      occurred_at: "2026-06-23T10:00:00Z",
    };

    const actions = suggestBreedingFollowUpActions(event);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      due_offset_days: 2,
      risk_level: "medium",
    });
    expect(actions[0].reason).toContain("Pollen shed");
  });

  it("handles case-insensitive HEAVY pollen shed", () => {
    const event: BreedingEvent = {
      id: "ev_5",
      type: "pollen_shed_observed",
      occurred_at: "2026-06-23T10:00:00Z",
      details: { intensity: "HEAVY" },
    };

    const actions = suggestBreedingFollowUpActions(event);
    expect(actions[0].risk_level).toBe("high");
    expect(actions[0].due_offset_days).toBe(1);
  });

  it("creates two actions for sts_spray reversal", () => {
    const event: BreedingEvent = {
      id: "ev_6",
      type: "reversal_application",
      occurred_at: "2026-06-23T10:00:00Z",
      details: { method: "sts_spray" },
    };

    const actions = suggestBreedingFollowUpActions(event);
    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({
      title: "Isolate reversed plant",
      due_offset_days: 5,
      risk_level: "high",
    });
    expect(actions[1]).toMatchObject({
      title: "Check for pollen shed",
      due_offset_days: 9,
      risk_level: "medium",
    });
  });

  it("creates two actions for colloidal_silver reversal", () => {
    const event: BreedingEvent = {
      id: "ev_6",
      type: "reversal_application",
      occurred_at: "2026-06-23T10:00:00Z",
      details: { method: "Colloidal_Silver" },
    };

    const actions = suggestBreedingFollowUpActions(event);
    expect(actions).toHaveLength(2);
    expect(actions[0].title).toBe("Isolate reversed plant");
    expect(actions[1].title).toBe("Check for pollen shed");
  });

  it("creates one action for unknown reversal method", () => {
    const event: BreedingEvent = {
      id: "ev_7",
      type: "reversal_application",
      occurred_at: "2026-06-23T10:00:00Z",
    };

    const actions = suggestBreedingFollowUpActions(event);
    expect(actions).toHaveLength(1);
    expect(actions[0].title).toBe("Check for pollen shed");
  });
});
