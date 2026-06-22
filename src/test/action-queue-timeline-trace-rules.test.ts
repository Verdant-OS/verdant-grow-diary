/**
 * actionQueueTimelineTraceRules — pure helper tests.
 *
 * Verifies the trace draft is safe (no device control, no internal IDs
 * in visible note copy, no raw back-pointer tokens), deterministic
 * (stable idempotency key), and includes the required context fields.
 */
import { describe, it, expect } from "vitest";
import {
  buildActionQueueTraceDraft,
  buildActionQueueTraceIdempotencyKey,
} from "@/lib/actionQueueTimelineTraceRules";

const BASE_INPUT = {
  action_id: "aq-1",
  user_id: "u-1",
  grow_id: "g-1",
  tent_id: "t-1",
  plant_id: "p-1",
  action_type: "lower_humidity",
  suggested_change: "Lower humidity to 55%",
  reason: "Mold risk rising. [alert:alert-xyz] LATEST_SENSOR_SNAPSHOT [source=live]: humidity 72%",
  source: "ai_doctor",
} as const;

const FIXED_NOW = new Date("2026-06-22T12:00:00.000Z");

describe("buildActionQueueTraceIdempotencyKey", () => {
  it("is deterministic per (action_id, kind)", () => {
    expect(buildActionQueueTraceIdempotencyKey("aq-1", "approved")).toBe(
      "action-queue:aq-1:approved",
    );
    expect(buildActionQueueTraceIdempotencyKey("aq-1", "rejected")).toBe(
      "action-queue:aq-1:rejected",
    );
  });

  it("differs between kinds for the same action", () => {
    expect(buildActionQueueTraceIdempotencyKey("aq-1", "approved")).not.toBe(
      buildActionQueueTraceIdempotencyKey("aq-1", "rejected"),
    );
  });
});

describe("buildActionQueueTraceDraft — approved", () => {
  const draft = buildActionQueueTraceDraft(
    { ...BASE_INPUT, kind: "approved" },
    FIXED_NOW,
  );

  it("uses 'Action approved' label in the visible note", () => {
    expect(draft.note.startsWith("Action approved:")).toBe(true);
  });

  it("does NOT contain raw back-pointer tokens in note", () => {
    expect(draft.note).not.toContain("[alert:");
    expect(draft.note).not.toContain("[session:");
    expect(draft.note).not.toContain("LATEST_SENSOR_SNAPSHOT");
  });

  it("does NOT include internal UUIDs in the visible note", () => {
    expect(draft.note).not.toContain("aq-1");
    expect(draft.note).not.toContain("t-1");
    expect(draft.note).not.toContain("p-1");
    expect(draft.note).not.toContain("g-1");
    expect(draft.note).not.toContain("u-1");
  });

  it("carries safe structured details for idempotency joins", () => {
    expect(draft.details.kind).toBe("action_queue_trace");
    expect(draft.details.trace_kind).toBe("approved");
    expect(draft.details.action_id).toBe("aq-1");
    expect(draft.details.tent_id).toBe("t-1");
    expect(draft.details.plant_id).toBe("p-1");
    expect(draft.details.source).toBe("ai_doctor");
    expect(draft.details.action_type).toBe("lower_humidity");
    expect(draft.details.idempotency_key).toBe(
      "action-queue:aq-1:approved",
    );
  });

  it("asserts device_control: false in details payload", () => {
    expect(draft.details.device_control).toBe(false);
  });

  it("uses the provided clock for entry_at", () => {
    expect(draft.entry_at).toBe(FIXED_NOW.toISOString());
  });

  it("targets the same user/grow as the source action", () => {
    expect(draft.user_id).toBe("u-1");
    expect(draft.grow_id).toBe("g-1");
  });

  it("includes a sanitized reason summary", () => {
    expect(draft.details.reason_summary).toContain("Mold risk rising");
    expect(draft.details.reason_summary).not.toContain("[alert:");
    expect(draft.details.reason_summary).not.toContain("LATEST_SENSOR_SNAPSHOT");
  });
});

describe("buildActionQueueTraceDraft — rejected", () => {
  it("uses 'Action rejected' label", () => {
    const draft = buildActionQueueTraceDraft(
      { ...BASE_INPUT, kind: "rejected" },
      FIXED_NOW,
    );
    expect(draft.note.startsWith("Action rejected:")).toBe(true);
    expect(draft.details.trace_kind).toBe("rejected");
    expect(draft.details.idempotency_key).toBe(
      "action-queue:aq-1:rejected",
    );
  });
});

describe("buildActionQueueTraceDraft — null/empty safety", () => {
  it("handles missing optional fields without throwing", () => {
    const draft = buildActionQueueTraceDraft(
      {
        action_id: "aq-2",
        user_id: "u-1",
        grow_id: "g-1",
        kind: "approved",
      },
      FIXED_NOW,
    );
    expect(draft.note.startsWith("Action approved:")).toBe(true);
    expect(draft.details.source).toBe("unknown");
    expect(draft.details.action_type).toBe("suggested action");
    expect(draft.details.tent_id).toBeNull();
    expect(draft.details.plant_id).toBeNull();
    expect(draft.details.reason_summary).toBe("");
  });

  it("never describes unknown context as healthy or safe", () => {
    const draft = buildActionQueueTraceDraft(
      {
        action_id: "aq-3",
        user_id: "u-1",
        grow_id: "g-1",
        kind: "rejected",
      },
      FIXED_NOW,
    );
    const text = draft.note.toLowerCase();
    expect(text).not.toContain("healthy");
    expect(text).not.toContain("everything is fine");
    expect(text).not.toContain("safe");
  });
});
