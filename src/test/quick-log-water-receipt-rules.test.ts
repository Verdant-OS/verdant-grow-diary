import { describe, expect, it } from "vitest";
import type { QuickLogV2SavePayload } from "@/lib/quickLogV2SavePayload";
import type { QuickLogResolvedTarget } from "@/lib/quickLogTargetIntegrityRules";
import {
  matchesRetractedWaterEvent,
  matchesRetractedWaterReceipt,
  matchesReusedWaterEvent,
  matchesReusedWaterReceipt,
  resolveStarterWaterReceiptTarget,
} from "@/lib/quickLogWaterReceiptRules";

const eventId = "77777777-7777-4777-8777-000000000001";
const plantId = "33333333-3333-4333-8333-333333333333";
const growId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const tentId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const movedGrowId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const movedTentId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const occurredAt = "2026-09-26T04:00:00.000Z";

const payload: QuickLogV2SavePayload = {
  p_target_type: "plant",
  p_target_id: plantId,
  p_action: "water",
  p_volume_ml: 250,
  p_note: "Starter watering",
  p_temperature_c: null,
  p_humidity_pct: null,
  p_vpd_kpa: null,
  p_occurred_at: occurredAt,
  p_idempotency_key: "starter-water-original-key",
};

const expectedTarget: QuickLogResolvedTarget = {
  plantId,
  growId,
  tentId,
};

function waterEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: eventId,
    event_type: "watering",
    source: "manual",
    is_deleted: false,
    grow_id: growId,
    plant_id: plantId,
    tent_id: tentId,
    occurred_at: occurredAt,
    note: payload.p_note,
    ...overrides,
  };
}

function waterChild(overrides: Record<string, unknown> = {}) {
  return {
    event_id: eventId,
    volume_ml: payload.p_volume_ml,
    ...overrides,
  };
}

describe("matchesReusedWaterEvent", () => {
  it("accepts a manual Watering that matches the payload and target", () => {
    expect(matchesReusedWaterEvent(payload, eventId, waterEvent(), expectedTarget)).toBe(true);
  });

  it("rejects reused confirmation when the payload action is not water", () => {
    expect(
      matchesReusedWaterEvent(
        { ...payload, p_action: "note" },
        eventId,
        waterEvent(),
        expectedTarget,
      ),
    ).toBe(false);
  });

  it.each([
    { event_type: "observation", label: "non-watering event type" },
    { source: "csv", label: "non-manual source" },
    { is_deleted: true, label: "retracted event" },
    { plant_id: "99999999-9999-4999-8999-999999999999", label: "plant mismatch" },
    { grow_id: movedGrowId, label: "grow mismatch" },
    { tent_id: movedTentId, label: "tent mismatch" },
    { note: "Different note", label: "note mismatch" },
    { occurred_at: "2026-09-27T04:00:00.000Z", label: "occurred_at mismatch" },
  ])("rejects reused confirmation when the event has $label", (override) => {
    expect(matchesReusedWaterEvent(payload, eventId, waterEvent(override), expectedTarget)).toBe(
      false,
    );
  });

  it("maps an empty note submission to a null persisted note", () => {
    const emptyNotePayload = { ...payload, p_note: "" };
    expect(
      matchesReusedWaterEvent(
        emptyNotePayload,
        eventId,
        waterEvent({ note: null }),
        expectedTarget,
      ),
    ).toBe(true);
    expect(
      matchesReusedWaterEvent(emptyNotePayload, eventId, waterEvent({ note: "" }), expectedTarget),
    ).toBe(false);
  });

  it("skips occurred_at comparison when the payload leaves time server-assigned", () => {
    const serverTimePayload = { ...payload, p_occurred_at: null };
    expect(
      matchesReusedWaterEvent(
        serverTimePayload,
        eventId,
        waterEvent({ occurred_at: "2026-01-01T00:00:00.000Z" }),
        expectedTarget,
      ),
    ).toBe(true);
  });

  it("requires tent targets to have a null plant_id on the persisted event", () => {
    const tentPayload: QuickLogV2SavePayload = {
      ...payload,
      p_target_type: "tent",
      p_target_id: tentId,
    };
    expect(
      matchesReusedWaterEvent(
        tentPayload,
        eventId,
        waterEvent({ plant_id: null, tent_id: tentId }),
      ),
    ).toBe(true);
    expect(
      matchesReusedWaterEvent(
        tentPayload,
        eventId,
        waterEvent({ plant_id: plantId, tent_id: tentId }),
      ),
    ).toBe(false);
  });

  it("fails closed on missing or mismatched event ids", () => {
    expect(matchesReusedWaterEvent(payload, eventId, null, expectedTarget)).toBe(false);
    expect(
      matchesReusedWaterEvent(
        payload,
        eventId,
        waterEvent({ id: "88888888-8888-4888-8888-888888888888" }),
        expectedTarget,
      ),
    ).toBe(false);
  });
});

describe("matchesRetractedWaterEvent", () => {
  it("accepts a retracted manual Watering that otherwise matches the payload", () => {
    expect(matchesRetractedWaterEvent(payload, eventId, waterEvent({ is_deleted: true }))).toBe(
      true,
    );
  });

  it("rejects an active event for retracted replay confirmation", () => {
    expect(matchesRetractedWaterEvent(payload, eventId, waterEvent({ is_deleted: false }))).toBe(
      false,
    );
  });
});

describe("matchesReusedWaterReceipt", () => {
  it("requires the Watering child to belong to the event and retain submitted volume", () => {
    expect(
      matchesReusedWaterReceipt(payload, eventId, waterEvent(), waterChild(), expectedTarget),
    ).toBe(true);
  });

  it.each([
    { event_id: "88888888-8888-4888-8888-888888888888", label: "child event mismatch" },
    { volume_ml: 500, label: "child volume mismatch" },
  ])("rejects reused receipt when the child has $label", (override) => {
    expect(
      matchesReusedWaterReceipt(
        payload,
        eventId,
        waterEvent(),
        waterChild(override),
        expectedTarget,
      ),
    ).toBe(false);
  });
});

describe("matchesRetractedWaterReceipt", () => {
  it("accepts a retracted replay only when parent and child both match", () => {
    expect(
      matchesRetractedWaterReceipt(
        payload,
        eventId,
        waterEvent({ is_deleted: true }),
        waterChild(),
      ),
    ).toBe(true);
  });

  it("rejects retracted replay when the child volume drifts", () => {
    expect(
      matchesRetractedWaterReceipt(
        payload,
        eventId,
        waterEvent({ is_deleted: true }),
        waterChild({ volume_ml: 999 }),
      ),
    ).toBe(false);
  });
});

describe("resolveStarterWaterReceiptTarget", () => {
  it("returns the verified event location when a plant moved before replay", () => {
    expect(
      resolveStarterWaterReceiptTarget(
        payload,
        eventId,
        waterEvent({ grow_id: movedGrowId, tent_id: movedTentId }),
        waterChild(),
        expectedTarget,
      ),
    ).toEqual({
      target: { plantId, growId: movedGrowId, tentId: movedTentId },
      contextChanged: true,
    });
  });

  it("reports no context change when the verified location matches the captured target", () => {
    expect(
      resolveStarterWaterReceiptTarget(
        payload,
        eventId,
        waterEvent(),
        waterChild(),
        expectedTarget,
      ),
    ).toEqual({
      target: expectedTarget,
      contextChanged: false,
    });
  });

  it.each([
    { grow_id: "not-a-uuid" },
    { tent_id: "not-a-uuid" },
    { plant_id: "99999999-9999-4999-8999-999999999999" },
  ])("returns null when persisted location is invalid %j", (override) => {
    expect(
      resolveStarterWaterReceiptTarget(
        payload,
        eventId,
        waterEvent(override),
        waterChild(),
        expectedTarget,
      ),
    ).toBeNull();
  });

  it("returns null when the reused receipt does not fully match", () => {
    expect(
      resolveStarterWaterReceiptTarget(
        payload,
        eventId,
        waterEvent({ note: "Different note" }),
        waterChild(),
        expectedTarget,
      ),
    ).toBeNull();
  });

  it("is deterministic for repeated evaluation", () => {
    const input = {
      payload,
      eventId,
      event: waterEvent({ grow_id: movedGrowId, tent_id: movedTentId }),
      child: waterChild(),
      expectedTarget,
    };
    const first = resolveStarterWaterReceiptTarget(
      input.payload,
      input.eventId,
      input.event,
      input.child,
      input.expectedTarget,
    );
    const second = resolveStarterWaterReceiptTarget(
      input.payload,
      input.eventId,
      input.event,
      input.child,
      input.expectedTarget,
    );
    expect(first).toEqual(second);
  });
});
