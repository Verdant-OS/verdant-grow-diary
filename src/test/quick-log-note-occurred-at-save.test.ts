import { describe, expect, it } from "vitest";
import { buildLegacyQuickLogUnifiedPayload } from "@/lib/legacyQuickLogUnifiedSave";
import { QUICK_LOG_NOTE_OCCURRED_AT_INVALID } from "@/lib/quickLogNoteOccurredAtRules";
import { buildQuickLogV2SavePayload } from "@/lib/quickLogV2SavePayload";

const PLANT_ID = "11111111-1111-1111-1111-111111111111";
const TENT_ID = "22222222-2222-2222-2222-222222222222";
const CHOSEN = "2026-10-07T18:15:00.000Z";

const baseInput = {
  eventType: "observation",
  idempotencyKey: "quicklog-v2-test-key-legacy",
  noteWithHardware: "Leaves curling slightly",
  plantId: PLANT_ID,
  plantTentId: TENT_ID,
  details: { ph: "", ec: "", runoff: "", nutrients: "", training: "", watering: "" },
};

describe("legacy note occurred-at save payload", () => {
  it("leaves an untouched observation on server-stamped null", () => {
    const result = buildLegacyQuickLogUnifiedPayload(baseInput);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.p_occurred_at).toBeNull();
  });

  it("persists a chosen observation time", () => {
    const result = buildLegacyQuickLogUnifiedPayload({ ...baseInput, occurredAt: CHOSEN });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.p_action).toBe("note");
      expect(result.payload.p_occurred_at).toBe(CHOSEN);
    }
  });

  it("persists a chosen time for an explicit note event", () => {
    const result = buildLegacyQuickLogUnifiedPayload({
      ...baseInput,
      eventType: "note",
      occurredAt: CHOSEN,
    });
    expect(result.ok && result.payload.p_occurred_at).toBe(CHOSEN);
  });

  it("rejects an unparseable note time", () => {
    const result = buildLegacyQuickLogUnifiedPayload({ ...baseInput, occurredAt: "not-a-time" });
    expect(result).toEqual({
      ok: false,
      reason: "invalid_occurred_at",
      message: QUICK_LOG_NOTE_OCCURRED_AT_INVALID,
    });
  });

  it("does not backdate watering or environment checks", () => {
    const watering = buildLegacyQuickLogUnifiedPayload({
      ...baseInput,
      eventType: "watering",
      noteWithHardware: "",
      details: { ...baseInput.details, watering: "250" },
      occurredAt: CHOSEN,
    });
    const environment = buildLegacyQuickLogUnifiedPayload({
      ...baseInput,
      eventType: "environment",
      occurredAt: CHOSEN,
    });
    expect(watering.ok && watering.payload.p_occurred_at).toBeNull();
    expect(environment.ok && environment.payload.p_occurred_at).toBeNull();
  });
});

describe("Quick Log v2 note occurred-at payload", () => {
  const resolved = {
    ok: true as const,
    targetType: "plant" as const,
    targetId: "p1",
    tentId: "t1",
    plantId: "p1",
  };

  it("leaves an omitted occurrence null and forwards a chosen ISO", () => {
    const omitted = buildQuickLogV2SavePayload({
      resolved,
      action: "note",
      volumeMl: "",
      note: "check-in",
      temperatureC: "",
      humidityPct: "",
      vpdKpa: "",
      idempotencyKey: "quicklog-v2-test-key-0001",
    });
    const chosen = buildQuickLogV2SavePayload({
      resolved,
      action: "note",
      volumeMl: "",
      note: "yesterday's walk",
      temperatureC: "",
      humidityPct: "",
      vpdKpa: "",
      occurredAt: CHOSEN,
      idempotencyKey: "quicklog-v2-test-key-0001",
    });
    expect(omitted.ok && omitted.payload.p_occurred_at).toBeNull();
    expect(chosen.ok && chosen.payload.p_occurred_at).toBe(CHOSEN);
  });
});
