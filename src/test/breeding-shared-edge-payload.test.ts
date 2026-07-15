/**
 * Guards the EDGE-side breeding action_queue payload builder
 * (supabase/functions/_shared/genetics/breedingActionQueue.ts) — the copy the
 * create-breeding-suggestions Edge Function actually uses for the /breeding/new
 * flow. It MUST stay in sync with the browser copy: set `target_metric` (to
 * satisfy action_queue_target_present_chk), never send a top-level `due_at` (no
 * such column exists on action_queue), and store grower-facing readable copy in
 * `suggested_change` (rendered verbatim by the Action Queue, not JSON-parsed).
 * If these drift, every breeding save silently drops its approval-required
 * follow-ups or renders them as raw blobs.
 */
import { describe, it, expect } from "vitest";
import { buildBreedingActionQueuePayloads } from "../../supabase/functions/_shared/genetics/breedingActionQueue.ts";
import type { BreedingEvent } from "../../supabase/functions/_shared/genetics/breedingTypes.ts";

describe("edge breeding action_queue payloads (_shared)", () => {
  it("sets target_metric, no top-level due_at, and readable suggested_change copy", () => {
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
      // readable copy, not a JSON blob (Action Queue renders it verbatim)
      expect(typeof p.suggested_change).toBe("string");
      expect(p.suggested_change.trim().startsWith("{")).toBe(false);
      expect(p.suggested_change.length).toBeGreaterThan(0);
      // preserves the computed follow-up due date in readable form.
      expect(p.suggested_change).toMatch(/\d{4}-\d{2}-\d{2}/);
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

  it("links each follow-up back to its originating timeline event (privacy-safe ref)", () => {
    // The production write path (create-breeding-suggestions) uses THIS copy.
    // Without the ref, adaptActionQueueRowsToBreedingCycleTimelinePoints skips
    // every breeding follow-up row. Mirrors the browser copy's back-reference.
    const event: BreedingEvent = {
      id: "ev_edge_3",
      type: "cross_harvest",
      occurred_at: "2026-06-20T12:00:00Z",
    };
    const payloads = buildBreedingActionQueuePayloads(event, "grow_1", "plant_1", "tent_1");
    expect(payloads.length).toBeGreaterThan(0);
    for (const p of payloads) {
      expect(p.originating_timeline_events).toEqual([
        {
          id: "ev_edge_3",
          type: "cross_harvest",
          source: "manual",
          occurred_at: "2026-06-20T12:00:00Z",
        },
      ]);
      // Privacy envelope: only id/type/source/occurred_at — no leaked fields.
      expect(Object.keys(p.originating_timeline_events![0]).sort()).toEqual([
        "id",
        "occurred_at",
        "source",
        "type",
      ]);
    }
  });
});
