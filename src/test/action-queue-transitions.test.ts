import { describe, it, expect } from "vitest";
import {
  type ActionStatus,
  isTerminalStatus,
  TERMINAL_STATUSES,
  canApprove,
  canSimulate,
  canReject,
  canComplete,
  canCancel,
  allowedTransitions,
  buildTransitionPatch,
  buildAuditEventPayload,
  eventTypeFor,
  nextStatusFor,
  normalizeNote,
} from "@/lib/actionQueueTransitions";

describe("actionQueueTransitions — shared rules", () => {
  it("TERMINAL_STATUSES contains completed/rejected/cancelled and nothing else", () => {
    expect([...TERMINAL_STATUSES].sort()).toEqual(
      ["cancelled", "completed", "rejected"].sort(),
    );
  });

  it("allowedTransitions returns the documented set per status", () => {
    expect(allowedTransitions("pending_approval").sort()).toEqual(
      ["approve", "cancel", "reject", "simulate"].sort(),
    );
    expect(allowedTransitions("simulated").sort()).toEqual(
      ["approve", "cancel", "complete"].sort(),
    );
    expect(allowedTransitions("approved").sort()).toEqual(
      ["cancel", "complete"].sort(),
    );
    for (const s of ["completed", "rejected", "cancelled"] as ActionStatus[]) {
      expect(allowedTransitions(s)).toEqual([]);
      expect(isTerminalStatus(s)).toBe(true);
    }
  });

  it("individual guards match the rules table", () => {
    expect(canApprove("pending_approval")).toBe(true);
    expect(canApprove("simulated")).toBe(true);
    expect(canApprove("approved")).toBe(false);
    expect(canSimulate("pending_approval")).toBe(true);
    expect(canSimulate("simulated")).toBe(false);
    expect(canReject("pending_approval")).toBe(true);
    expect(canReject("approved")).toBe(false);
    expect(canComplete("approved")).toBe(true);
    expect(canComplete("simulated")).toBe(true);
    expect(canComplete("pending_approval")).toBe(false);
    expect(canCancel("pending_approval")).toBe(true);
    expect(canCancel("approved")).toBe(true);
    expect(canCancel("simulated")).toBe(true);
    expect(canCancel("completed")).toBe(false);
  });

  it("buildTransitionPatch sets correct status + timestamps", () => {
    const now = new Date("2030-01-01T00:00:00.000Z");
    expect(buildTransitionPatch("approve", now)).toEqual({
      status: "approved",
      approved_at: now.toISOString(),
    });
    expect(buildTransitionPatch("reject", now)).toEqual({
      status: "rejected",
      rejected_at: now.toISOString(),
    });
    expect(buildTransitionPatch("complete", now)).toEqual({
      status: "completed",
      completed_at: now.toISOString(),
    });
    expect(buildTransitionPatch("cancel", now)).toEqual({ status: "cancelled" });
    expect(buildTransitionPatch("simulate", now)).toEqual({ status: "simulated" });
  });

  it("complete patch always includes completed_at", () => {
    const patch = buildTransitionPatch("complete");
    expect(patch.status).toBe("completed");
    expect(typeof patch.completed_at).toBe("string");
    expect(patch.completed_at!.length).toBeGreaterThan(0);
  });

  it("eventTypeFor / nextStatusFor mirror the patch", () => {
    expect(eventTypeFor("approve")).toBe("approved");
    expect(eventTypeFor("reject")).toBe("rejected");
    expect(eventTypeFor("complete")).toBe("completed");
    expect(eventTypeFor("cancel")).toBe("cancelled");
    expect(eventTypeFor("simulate")).toBe("simulated");
    expect(nextStatusFor("approve")).toBe("approved");
    expect(nextStatusFor("complete")).toBe("completed");
    expect(nextStatusFor("cancel")).toBe("cancelled");
  });

  it("buildAuditEventPayload includes all required audit fields and omits user_id", () => {
    const payload = buildAuditEventPayload({
      action_queue_id: "a1",
      grow_id: "g1",
      event_type: "approved",
      previous_status: "pending_approval",
      new_status: "approved",
      note: "looks good",
    });
    expect(payload).toEqual({
      action_queue_id: "a1",
      grow_id: "g1",
      event_type: "approved",
      previous_status: "pending_approval",
      new_status: "approved",
      note: "looks good",
    });
    expect(Object.keys(payload)).not.toContain("user_id");
  });

  it("buildAuditEventPayload normalizes missing note to null", () => {
    const p = buildAuditEventPayload({
      action_queue_id: "a",
      grow_id: "g",
      event_type: "created",
      previous_status: null,
      new_status: "pending_approval",
    });
    expect(p.note).toBeNull();
  });

  it("normalizeNote trims and treats empty as undefined", () => {
    expect(normalizeNote("  ")).toBeUndefined();
    expect(normalizeNote("")).toBeUndefined();
    expect(normalizeNote(null)).toBeUndefined();
    expect(normalizeNote(undefined)).toBeUndefined();
    expect(normalizeNote("  hello ")).toBe("hello");
  });
});

describe("actionQueueTransitions — safety surface", () => {
  it("does not export any device-control symbol", async () => {
    const mod = (await import("@/lib/actionQueueTransitions")) as Record<string, unknown>;
    for (const k of Object.keys(mod)) {
      expect(k.toLowerCase()).not.toMatch(/mqtt|home.?assistant|pi.?bridge|webhook|relay|actuator|service_role/);
    }
  });
});
