/**
 * Guards the EDGE-side breeding action_queue payload builder
 * (supabase/functions/_shared/genetics/breedingActionQueue.ts) — the copy the
 * create-breeding-suggestions Edge Function actually uses for the /breeding/new
 * flow. It MUST stay in sync with the browser copy: set `target_metric` (to
 * satisfy action_queue_target_present_chk) and carry the due date inside
 * `suggested_change`, never as a top-level `due_at` (no such column exists on
 * action_queue). If these drift, every breeding save silently drops its
 * approval-required follow-ups.
 */
import { describe, it, expect } from "vitest";
import { buildBreedingActionQueuePayloads } from "../../supabase/functions/_shared/genetics/breedingActionQueue.ts";
import type { BreedingEvent } from "../../supabase/functions/_shared/genetics/breedingTypes.ts";

describe("edge breeding action_queue payloads (_shared)", () => {
  it("sets target_metric and keeps due date in suggested_change (no top-level due_at)", () => {
    const event: BreedingEvent = {
      id: "ev_edge_1",
      type: "reversal_application",
      occurred_at: "2026-06-20T12:00:00Z",
      details: { method: "sts_spray" },
    };
    const payloads = buildBreedingActionQueuePayloads(event, "grow_1", "plant_1", "tent_1");
    expect(payloads.length).toBeGreaterThan(0);
    for (const p of payloads) {
      expect(p.target_metric).toBe("breeding_workflow");
      expect(p).not.toHaveProperty("due_at");
      const change = JSON.parse(p.suggested_change);
      expect(typeof change.due_at).toBe("string");
      expect(Number.isNaN(Date.parse(change.due_at))).toBe(false);
    }
  });

  it("marks payloads pending_approval with the breeding_follow_up action_type", () => {
    const event: BreedingEvent = {
      id: "ev_edge_2",
      type: "pollination",
      occurred_at: "2026-06-20T12:00:00Z",
    };
    const payloads = buildBreedingActionQueuePayloads(event, "grow_1", "plant_1");
    expect(payloads.length).toBeGreaterThan(0);
    for (const p of payloads) {
      expect(p.status).toBe("pending_approval");
      expect(p.action_type).toBe("breeding_follow_up");
    }
  });
});
