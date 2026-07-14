import { describe, it, expect } from "vitest";
import { buildBreedingActionQueuePayloads } from "@/lib/genetics/breedingActionQueue";
import type { BreedingEvent } from "@/lib/genetics/breedingTypes";

describe("breedingActionQueue payloads", () => {
  it("builds pending_approval payloads with provenance", () => {
    const event: BreedingEvent = {
      id: "ev_123",
      type: "reversal_application",
      occurred_at: "2026-06-20T12:00:00Z",
      details: { method: "sts_spray" },
    };

    const payloads = buildBreedingActionQueuePayloads(event, "grow_1", "plant_1", "tent_1");

    expect(payloads.length).toBeGreaterThan(0);
    payloads.forEach((p) => {
      expect(p.grow_id).toBe("grow_1");
      expect(p.plant_id).toBe("plant_1");
      expect(p.tent_id).toBe("tent_1");
      expect(p.status).toBe("pending_approval");
      expect(p.reason).toContain("[event:ev_123]");
      expect(p.target_metric).toBe("breeding_follow_up");

<<<<<<< HEAD
      const suggestedChange = JSON.parse(p.suggested_change as string);
      expect(suggestedChange.source_event_id).toBe("ev_123");
=======
      // target_metric must be present to satisfy action_queue_target_present_chk.
      expect(p.target_metric).toBe("breeding_workflow");

      // suggested_change is grower-facing readable copy (not a JSON blob) — the
      // Action Queue renders it verbatim. Event linkage lives in `reason`.
      expect(typeof p.suggested_change).toBe("string");
      expect((p.suggested_change as string).trim().startsWith("{")).toBe(false);
      expect((p.suggested_change as string).length).toBeGreaterThan(0);
      // preserves the computed follow-up due date in readable form (YYYY-MM-DD).
      expect(p.suggested_change as string).toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(p).not.toHaveProperty("due_at");
>>>>>>> origin/main
    });
  });

  it("handles unsupported events", () => {
    const event: BreedingEvent = {
      id: "ev_999",
      type: "water_plant", // unsupported
      occurred_at: "2026-06-20T12:00:00Z",
    };
    const payloads = buildBreedingActionQueuePayloads(event, "grow_1");
    expect(payloads).toEqual([]);
  });

  it("populates originating_timeline_events so calculateBreedingCycleStats can recover the subtype + timestamp", () => {
    const event: BreedingEvent = {
      id: "ev_456",
      type: "pollination",
      occurred_at: "2026-06-20T12:00:00Z",
      details: { method: "hand" },
    };
    const payloads = buildBreedingActionQueuePayloads(event, "grow_1", "plant_1");
    expect(payloads.length).toBeGreaterThan(0);
    for (const p of payloads) {
      const refs = p.originating_timeline_events as unknown as Array<Record<string, unknown>>;
      expect(refs).toHaveLength(1);
      expect(refs[0]).toEqual({
        id: "ev_456",
        type: "pollination",
        occurred_at: "2026-06-20T12:00:00Z",
        source: "manual",
      });
      // Never carries the event's `details` payload (method/intensity are not
      // part of the OriginatingTimelineEventRef shape).
      expect(refs[0]).not.toHaveProperty("details");
    }
  });

  it("does not populate originating_timeline_events for unsupported events (empty payload list)", () => {
    const event: BreedingEvent = {
      id: "ev_999",
      type: "water_plant",
      occurred_at: "2026-06-20T12:00:00Z",
    };
    expect(buildBreedingActionQueuePayloads(event, "grow_1")).toEqual([]);
  });
});
