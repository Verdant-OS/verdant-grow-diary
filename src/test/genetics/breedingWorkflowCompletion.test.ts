/**
 * Breeding Workflow v1 completion tests.
 *
 * Guards the fixes that made the previously-orphaned breeding workflow
 * functional:
 *   1. action_queue payloads satisfy action_queue_target_present_chk
 *      (target_metric present) and carry NO phantom `due_at` column — the due
 *      date now lives inside suggested_change.
 *   2. The intensity/method details collected by the form are reachable by the
 *      advisor branching (they were dead-on-arrival before the form collected
 *      them): heavy pollen shed → 1-day follow-up; STS reversal → extra
 *      high-risk isolation check.
 */

import { describe, it, expect } from "vitest";
import { buildBreedingActionQueuePayloads } from "@/lib/genetics/breedingActionQueue";
import type { BreedingEvent } from "@/lib/genetics/breedingTypes";

describe("breeding workflow completion — action_queue payload shape", () => {
  it("sets target_metric and keeps due date in suggested_change (no due_at column)", () => {
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
      const change = JSON.parse(p.suggested_change as string);
      expect(typeof change.due_at).toBe("string");
      expect(Number.isNaN(Date.parse(change.due_at))).toBe(false);
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
    const change = JSON.parse(payloads[0].suggested_change as string);
    expect(change.due_offset_days).toBe(1);
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
    const change = JSON.parse(payloads[0].suggested_change as string);
    expect(change.due_offset_days).toBe(2);
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
