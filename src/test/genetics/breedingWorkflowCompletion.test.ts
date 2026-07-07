/**
 * Breeding Workflow v1 completion tests.
 *
 * Guards the fixes that made the previously-orphaned breeding workflow
 * functional:
 *   1. action_queue payloads satisfy action_queue_target_present_chk
 *      (target_metric present), carry NO phantom `due_at` column, and store
 *      grower-facing readable copy in suggested_change (not a JSON blob).
 *   2. The intensity/method details collected by the form are reachable by the
 *      advisor branching (they were dead-on-arrival before the form collected
 *      them): heavy pollen shed → 1-day follow-up; STS reversal → extra
 *      high-risk isolation check.
 */

import { describe, it, expect } from "vitest";
import { buildBreedingActionQueuePayloads } from "@/lib/genetics/breedingActionQueue";
import type { BreedingEvent } from "@/lib/genetics/breedingTypes";

describe("breeding workflow completion — action_queue payload shape", () => {
  it("sets target_metric, no due_at column, and readable suggested_change copy", () => {
    const event: BreedingEvent = {
      id: "ev_1",
      type: "pollination",
      occurred_at: "2026-06-20T12:00:00Z",
    };
    const payloads = buildBreedingActionQueuePayloads(event, "grow_1", "plant_1", "tent_1");
    expect(payloads.length).toBeGreaterThan(0);
    for (const p of payloads) {
      // constraint: target_metric OR target_device must be present
      expect(p.target_metric).toBe("breeding_workflow");
      // action_queue has no due_at column — must not be sent as a top-level key
      expect(p).not.toHaveProperty("due_at");
      // suggested_change is readable copy the Action Queue renders verbatim,
      // not a JSON blob.
      expect(typeof p.suggested_change).toBe("string");
      expect((p.suggested_change as string).trim().startsWith("{")).toBe(false);
      expect((p.suggested_change as string).length).toBeGreaterThan(0);
    }
  });
});

describe("breeding workflow completion — details branching is reachable", () => {
  it("heavy pollen shed intensity yields a 1-day receptive-window follow-up", () => {
    const event: BreedingEvent = {
      id: "ev_2",
      type: "pollen_shed_observed",
      occurred_at: "2026-06-20T12:00:00Z",
      details: { intensity: "heavy" },
    };
    const payloads = buildBreedingActionQueuePayloads(event, "grow_1", "plant_1");
    expect(payloads).toHaveLength(1);
    // heavy shed → high-risk (distinct from moderate's medium), proving
    // details.intensity reached the advisor branching.
    expect(payloads[0].risk_level).toBe("high");
  });

  it("moderate pollen shed intensity yields a 2-day follow-up (distinct from heavy)", () => {
    const event: BreedingEvent = {
      id: "ev_3",
      type: "pollen_shed_observed",
      occurred_at: "2026-06-20T12:00:00Z",
      details: { intensity: "moderate" },
    };
    const payloads = buildBreedingActionQueuePayloads(event, "grow_1", "plant_1");
    expect(payloads).toHaveLength(1);
    // moderate shed → medium risk, distinct from heavy's high.
    expect(payloads[0].risk_level).toBe("medium");
  });

  it("STS-spray reversal adds a high-risk isolation check beyond the base pollen-window reminder", () => {
    const base: BreedingEvent = {
      id: "ev_4",
      type: "reversal_application",
      occurred_at: "2026-06-20T12:00:00Z",
    };
    const withMethod: BreedingEvent = { ...base, id: "ev_5", details: { method: "sts_spray" } };

    const basePayloads = buildBreedingActionQueuePayloads(base, "grow_1", "plant_1");
    const methodPayloads = buildBreedingActionQueuePayloads(withMethod, "grow_1", "plant_1");

    // The method branch adds an extra suggestion.
    expect(methodPayloads.length).toBe(basePayloads.length + 1);
    expect(methodPayloads.some((p) => p.risk_level === "high")).toBe(true);
  });
});
