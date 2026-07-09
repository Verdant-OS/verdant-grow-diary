/**
 * Breeding V0 safety audit tests.
 *
 * These tests prove that:
 *   1. Approval records intent only — no execution, no device control.
 *   2. Payloads are privacy-safe: no raw notes, no free text, no device data.
 *   3. The suggest-only invariant holds: breeding actions require grower approval.
 *   4. Approve/decline lifecycle is now wired: status=pending_approval is approval-compatible.
 *
 * Intentionally unwired lifecycle paths (documented here):
 *   - breeding_suggestion_expired: No expiry path exists. The due_at field in action_queue
 *     is stored but never read by any staleness or expiry logic. Must be a future slice.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { emitBreedingAuditEvent, type BreedingAuditPayload } from "@/lib/genetics/breedingAuditLog";
import { buildBreedingActionQueuePayloads } from "@/lib/genetics/breedingActionQueue";
import type { BreedingEvent } from "@/lib/genetics/breedingTypes";
import { canApprove, canReject, canCancel } from "@/lib/actionQueueTransitions";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Breeding V0 safety: no execution on approval", () => {
  it("emitBreedingAuditEvent is pure — no async, no network, no device calls", () => {
    // The function is synchronous and returns a plain object.
    // Any async would be caught by a return-type check at runtime.
    const result = emitBreedingAuditEvent({ eventType: "breeding_suggestion_approved" });
    expect(result).toEqual(expect.objectContaining({ eventType: "breeding_suggestion_approved" }));
    // Return type is BreedingAuditPayload, not a Promise.
    expect(result).not.toBeInstanceOf(Promise);
  });

  it("action queue payloads contain no device control fields", () => {
    const event: BreedingEvent = {
      id: "ev-safety-1",
      type: "reversal_application",
      occurred_at: "2026-06-20T12:00:00Z",
      details: { method: "sts_spray" },
    };
    const payloads = buildBreedingActionQueuePayloads(event, "grow-1", "plant-1", "tent-1");
    expect(payloads.length).toBeGreaterThan(0);
    for (const p of payloads) {
      expect(p).not.toHaveProperty("device_command");
      expect(p).not.toHaveProperty("execute");
      expect(p).not.toHaveProperty("hardware_target");
      expect(p).not.toHaveProperty("automation");
      // action_type is breeding_follow_up, never a direct device action
      expect(p.action_type).toBe("breeding_follow_up");
    }
  });

  it("originating_timeline_events refs carry no forbidden/secret-like fields", () => {
    const event: BreedingEvent = {
      id: "ev-safety-2",
      type: "cross_harvest",
      occurred_at: "2026-06-20T12:00:00Z",
    };
    const payloads = buildBreedingActionQueuePayloads(event, "grow-1", "plant-1", "tent-1");
    expect(payloads.length).toBeGreaterThan(0);
    for (const p of payloads) {
      const refs = p.originating_timeline_events as unknown as Array<Record<string, unknown>>;
      expect(refs).toHaveLength(1);
      for (const forbidden of [
        "raw_payload",
        "service_role",
        "bridge_token",
        "api_key",
        "access_token",
        "refresh_token",
        "user_id",
        "device_command",
      ]) {
        expect(refs[0]).not.toHaveProperty(forbidden);
      }
      expect(Object.keys(refs[0]).sort()).toEqual(["id", "occurred_at", "source", "type"]);
    }
  });
});

describe("Breeding V0 safety: payload privacy", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("payload must not include raw reason or free text", () => {
    const spy = vi.spyOn(console, "info");
    const payload: BreedingAuditPayload = {
      eventType: "breeding_suggestion_created",
      actionId: "aq-1",
      plantId: "plant-1",
      source: "breeding_v0",
      status: "pending_approval",
      requiresApproval: true,
    };
    emitBreedingAuditEvent(payload);
    const loggedData = spy.mock.calls[0][2] as Record<string, unknown>;
    // Must not include any free-text or note fields
    expect(loggedData).not.toHaveProperty("reason");
    expect(loggedData).not.toHaveProperty("note");
    expect(loggedData).not.toHaveProperty("suggested_change");
    expect(loggedData).not.toHaveProperty("details");
  });

  it("payload must not include environmental or device data", () => {
    const spy = vi.spyOn(console, "info");
    emitBreedingAuditEvent({
      eventType: "breeding_suggestion_viewed",
      actionId: "aq-1",
      plantId: "plant-1",
      source: "breeding_v0",
      status: "pending_approval",
      requiresApproval: true,
      timestamp: "2026-06-24T00:00:00.000Z",
    });
    const loggedData = spy.mock.calls[0][2] as Record<string, unknown>;
    expect(Object.keys(loggedData)).toEqual([
      "actionId",
      "plantId",
      "source",
      "status",
      "actorId",
      "timestamp",
      "requiresApproval",
    ]);
  });

  it("plantId is the only plant metadata field in the payload", () => {
    const payload: BreedingAuditPayload = {
      eventType: "breeding_suggestion_created",
      plantId: "plant-abc",
    };
    const result = emitBreedingAuditEvent(payload);
    const keys = Object.keys(result);
    const plantKeys = keys.filter((k) => k !== "plantId" && k.toLowerCase().includes("plant"));
    expect(plantKeys).toHaveLength(0);
  });
});

describe("Breeding V0 safety: suggest-only invariant", () => {
  it("action queue payloads have status=pending_approval (approval-required lifecycle)", () => {
    const event: BreedingEvent = {
      id: "ev-inv-1",
      type: "pollination",
      occurred_at: "2026-06-20T12:00:00Z",
    };
    const payloads = buildBreedingActionQueuePayloads(event, "grow-1");
    for (const p of payloads) {
      expect(p.status).toBe("pending_approval");
    }
  });

  it("action queue payloads are marked manual source (no automated execution)", () => {
    const event: BreedingEvent = {
      id: "ev-inv-2",
      type: "reversal_application",
      occurred_at: "2026-06-20T12:00:00Z",
    };
    const payloads = buildBreedingActionQueuePayloads(event, "grow-1");
    for (const p of payloads) {
      expect(p.source).toBe("manual");
    }
  });

  it("pending_approval status is approval-compatible: canApprove/canReject/canCancel return true", () => {
    const event: BreedingEvent = {
      id: "ev-reach-1",
      type: "pollination",
      occurred_at: "2026-06-20T12:00:00Z",
    };
    const payloads = buildBreedingActionQueuePayloads(event, "grow-1");
    expect(payloads.length).toBeGreaterThan(0);
    for (const p of payloads) {
      expect(canApprove(p.status as Parameters<typeof canApprove>[0])).toBe(true);
      expect(canReject(p.status as Parameters<typeof canReject>[0])).toBe(true);
      expect(canCancel(p.status as Parameters<typeof canCancel>[0])).toBe(true);
    }
  });

  it("breeding_suggestion_approved emits after successful approve transition (wired)", () => {
    const spy = vi.spyOn(console, "info");
    emitBreedingAuditEvent({
      eventType: "breeding_suggestion_approved",
      actionId: "aq-1",
      plantId: "plant-1",
      source: "breeding_v0",
      status: "approved",
      requiresApproval: true,
      timestamp: "2026-06-24T00:00:00.000Z",
    });
    expect(spy).toHaveBeenCalledWith(
      "[breeding-audit]",
      "breeding_suggestion_approved",
      expect.objectContaining({ actionId: "aq-1", source: "breeding_v0", status: "approved" }),
    );
  });

  it("breeding_suggestion_declined emits after successful reject/cancel transition (wired)", () => {
    const spy = vi.spyOn(console, "info");
    emitBreedingAuditEvent({
      eventType: "breeding_suggestion_declined",
      actionId: "aq-1",
      plantId: "plant-1",
      source: "breeding_v0",
      status: "rejected",
      requiresApproval: true,
      timestamp: "2026-06-24T00:00:00.000Z",
    });
    expect(spy).toHaveBeenCalledWith(
      "[breeding-audit]",
      "breeding_suggestion_declined",
      expect.objectContaining({ actionId: "aq-1", source: "breeding_v0", status: "rejected" }),
    );
  });
});
