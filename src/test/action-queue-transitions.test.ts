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
  buildActionQueueTransitionRpcArgs,
  eventTypeFor,
  nextStatusFor,
  normalizeNote,
  parseActionQueueTransitionRpcResult,
} from "@/lib/actionQueueTransitions";

describe("actionQueueTransitions — shared rules", () => {
  const actionId = "4467a124-33a6-42d9-967c-b68926af5b93";
  const eventId = "3eef729f-00ff-474f-bb39-d03d46dd2f47";
  const rpcArgs = buildActionQueueTransitionRpcArgs({
    actionQueueId: actionId,
    transition: "approve",
    expectedStatus: "pending_approval",
    note: "grower confirmed",
  });

  it("TERMINAL_STATUSES contains completed/rejected/cancelled and nothing else", () => {
    expect([...TERMINAL_STATUSES].sort()).toEqual(["cancelled", "completed", "rejected"].sort());
  });

  it("allowedTransitions returns the documented set per status", () => {
    expect(allowedTransitions("pending_approval").sort()).toEqual(
      ["approve", "cancel", "reject", "simulate"].sort(),
    );
    expect(allowedTransitions("simulated").sort()).toEqual(
      ["approve", "cancel", "complete"].sort(),
    );
    expect(allowedTransitions("approved").sort()).toEqual(["cancel", "complete"].sort());
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

  it("builds the canonical RPC args without caller-controlled identity or lifecycle fields", () => {
    const args = buildActionQueueTransitionRpcArgs({
      actionQueueId: "action-1",
      transition: "approve",
      expectedStatus: "pending_approval",
      note: "  grower confirmed  ",
    });
    expect(args).toEqual({
      p_action_queue_id: "action-1",
      p_transition: "approve",
      p_expected_status: "pending_approval",
      p_note: "grower confirmed",
    });
    expect(Object.keys(args)).not.toEqual(
      expect.arrayContaining(["user_id", "grow_id", "event_type", "new_status", "transitioned_at"]),
    );
  });

  it("normalizes an empty RPC note to null deterministically", () => {
    const input = {
      actionQueueId: "action-1",
      transition: "simulate" as const,
      expectedStatus: "pending_approval" as const,
      note: "   ",
    };
    expect(buildActionQueueTransitionRpcArgs(input)).toEqual(
      buildActionQueueTransitionRpcArgs(input),
    );
    expect(buildActionQueueTransitionRpcArgs(input).p_note).toBeNull();
  });

  it("parses a complete transactional RPC success result", () => {
    expect(
      parseActionQueueTransitionRpcResult(
        {
          ok: true,
          action_queue_id: actionId,
          previous_status: "pending_approval",
          new_status: "approved",
          event_id: eventId,
          transitioned_at: "2030-01-01T00:00:00.000Z",
          reused: false,
        },
        rpcArgs,
      ),
    ).toEqual({
      ok: true,
      action_queue_id: actionId,
      previous_status: "pending_approval",
      new_status: "approved",
      event_id: eventId,
      transitioned_at: "2030-01-01T00:00:00.000Z",
      reused: false,
    });
  });

  it("parses expected failures but rejects malformed or unknown-status success data", () => {
    expect(
      parseActionQueueTransitionRpcResult({ ok: false, reason: "status_conflict" }, rpcArgs),
    ).toEqual({ ok: false, reason: "status_conflict" });
    expect(parseActionQueueTransitionRpcResult(null, rpcArgs)).toBeNull();
    expect(parseActionQueueTransitionRpcResult([], rpcArgs)).toBeNull();
    expect(parseActionQueueTransitionRpcResult({ ok: false, reason: "" }, rpcArgs)).toBeNull();
    expect(
      parseActionQueueTransitionRpcResult({ ok: false, reason: "database_said_secret" }, rpcArgs),
    ).toBeNull();
    expect(
      parseActionQueueTransitionRpcResult(
        {
          ok: true,
          action_queue_id: actionId,
          previous_status: "pending_approval",
          new_status: "executed",
          event_id: eventId,
          transitioned_at: "2030-01-01T00:00:00.000Z",
          reused: false,
        },
        rpcArgs,
      ),
    ).toBeNull();
  });

  it("rejects a structurally valid success that does not match the submitted request", () => {
    const base = {
      ok: true,
      action_queue_id: actionId,
      previous_status: "pending_approval",
      new_status: "approved",
      event_id: eventId,
      transitioned_at: "2030-01-01T00:00:00.000Z",
      reused: false,
    };

    expect(
      parseActionQueueTransitionRpcResult(
        { ...base, action_queue_id: "c4ccbd0d-052c-4a8f-b518-0731da38f298" },
        rpcArgs,
      ),
    ).toBeNull();
    expect(
      parseActionQueueTransitionRpcResult({ ...base, previous_status: "simulated" }, rpcArgs),
    ).toBeNull();
    expect(
      parseActionQueueTransitionRpcResult({ ...base, new_status: "cancelled" }, rpcArgs),
    ).toBeNull();
  });

  it("rejects malformed UUIDs and non-RFC3339 transition timestamps", () => {
    const base = {
      ok: true,
      action_queue_id: actionId,
      previous_status: "pending_approval",
      new_status: "approved",
      event_id: eventId,
      transitioned_at: "2030-01-01T00:00:00.000Z",
      reused: false,
    };

    expect(
      parseActionQueueTransitionRpcResult({ ...base, event_id: "event-1" }, rpcArgs),
    ).toBeNull();
    expect(
      parseActionQueueTransitionRpcResult({ ...base, transitioned_at: "next Thursday" }, rpcArgs),
    ).toBeNull();
  });
});

describe("actionQueueTransitions — safety surface", () => {
  it("does not export any device-control symbol", async () => {
    const mod = (await import("@/lib/actionQueueTransitions")) as Record<string, unknown>;
    for (const k of Object.keys(mod)) {
      expect(k.toLowerCase()).not.toMatch(
        /mqtt|home.?assistant|pi.?bridge|webhook|relay|actuator|service_role/,
      );
    }
  });
});
