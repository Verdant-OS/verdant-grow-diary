import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
});
import {
  emitBreedingAuditEvent,
  isBreedingFollowUpAction,
  type BreedingAuditPayload,
  type BreedingAuditEventType,
} from "@/lib/genetics/breedingAuditLog";

describe("emitBreedingAuditEvent", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("returns the payload passed in", () => {
    const payload: BreedingAuditPayload = {
      eventType: "breeding_suggestion_created",
      actionId: "aq-1",
      plantId: "plant-1",
      source: "breeding_v0",
      status: "pending_approval",
      requiresApproval: true,
    };
    const result = emitBreedingAuditEvent(payload);
    expect(result).toBe(payload);
  });

  it("calls console.info with [breeding-audit] prefix and eventType", () => {
    const spy = vi.spyOn(console, "info");
    emitBreedingAuditEvent({ eventType: "breeding_suggestion_viewed", actionId: "aq-1" });
    expect(spy).toHaveBeenCalledWith(
      "[breeding-audit]",
      "breeding_suggestion_viewed",
      expect.any(Object),
    );
  });

  it("logs null for missing optional fields", () => {
    const spy = vi.spyOn(console, "info");
    emitBreedingAuditEvent({ eventType: "breeding_suggestion_created" });
    expect(spy).toHaveBeenCalledWith(
      "[breeding-audit]",
      "breeding_suggestion_created",
      expect.objectContaining({
        actionId: null,
        plantId: null,
        source: null,
        status: null,
        actorId: null,
        timestamp: null,
        requiresApproval: null,
      }),
    );
  });

  it("includes actionId and plantId in log when provided", () => {
    const spy = vi.spyOn(console, "info");
    emitBreedingAuditEvent({
      eventType: "breeding_suggestion_approved",
      actionId: "aq-abc",
      plantId: "plant-xyz",
      source: "breeding_v0",
      status: "approved",
      requiresApproval: true,
    });
    expect(spy).toHaveBeenCalledWith(
      "[breeding-audit]",
      "breeding_suggestion_approved",
      expect.objectContaining({ actionId: "aq-abc", plantId: "plant-xyz", source: "breeding_v0" }),
    );
  });

  it("handles all five event types without throwing", () => {
    const types: BreedingAuditEventType[] = [
      "breeding_suggestion_created",
      "breeding_suggestion_viewed",
      "breeding_suggestion_approved",
      "breeding_suggestion_declined",
      "breeding_suggestion_expired",
    ];
    for (const eventType of types) {
      expect(() => emitBreedingAuditEvent({ eventType })).not.toThrow();
    }
  });
});

describe("isBreedingFollowUpAction", () => {
  it("returns true for breeding_follow_up", () => {
    expect(isBreedingFollowUpAction("breeding_follow_up")).toBe(true);
  });

  it("returns false for other action types", () => {
    expect(isBreedingFollowUpAction("environment_alert")).toBe(false);
    expect(isBreedingFollowUpAction("manual")).toBe(false);
    expect(isBreedingFollowUpAction("")).toBe(false);
    expect(isBreedingFollowUpAction("BREEDING_FOLLOW_UP")).toBe(false);
  });
});
