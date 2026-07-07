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

      // target_metric must be present to satisfy action_queue_target_present_chk.
      expect(p.target_metric).toBe("breeding_workflow");

      const suggestedChange = JSON.parse(p.suggested_change as string);
      expect(suggestedChange.source_event_id).toBe("ev_123");
      // due date now travels inside suggested_change (no action_queue.due_at column).
      expect(suggestedChange.due_at).toBeDefined();
      expect(p).not.toHaveProperty("due_at");
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
});
