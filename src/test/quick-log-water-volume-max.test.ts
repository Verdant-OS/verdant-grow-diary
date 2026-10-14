/**
 * A single Quick Log watering has a realistic ceiling (owner decision
 * 2026-10-14: 50,000 ml). Production accepted 1,000,000 ml and blocked
 * 99,999,999 with "must be a positive number". Above the ceiling the
 * grower sees a clear "too large" message, inline and on save.
 */
import { describe, it, expect } from "vitest";
import {
  QUICK_LOG_WATER_VOLUME_MAX_ML,
  buildWateringFormPayload,
  EMPTY_QUICKLOG_WATERING_FORM,
  wateringFormReasonToHelper,
} from "@/lib/quickLogWateringFormViewModel";
import { assessQuickLogWaterSaveGate } from "@/lib/quickLogWaterSaveGateRules";
import { buildQuickLogV2SavePayload } from "@/lib/quickLogV2SavePayload";
import { quickLogReasonToOperatorMessage } from "@/lib/quickLogSaveErrorMessage";

const TOO_LARGE = /too large \(max 50,000 ml\)/i;

function wateringForm(volumeMl: string) {
  return buildWateringFormPayload({
    growId: "grow-1",
    idempotencyKey: "idem-key-1234",
    form: { ...EMPTY_QUICKLOG_WATERING_FORM, volumeMl },
  });
}

describe("Quick Log water volume ceiling", () => {
  it("is 50,000 ml", () => {
    expect(QUICK_LOG_WATER_VOLUME_MAX_ML).toBe(50_000);
  });

  it("watering form rejects volumes above the ceiling as too large, not invalid", () => {
    expect(wateringForm("50000").ok).toBe(true);
    expect(wateringForm("50001")).toEqual({ ok: false, reason: "volume_ml:too_large" });
    expect(wateringForm("1000000")).toEqual({ ok: false, reason: "volume_ml:too_large" });
    expect(wateringForm("-1")).toEqual({ ok: false, reason: "volume_ml:invalid" });
    expect(wateringFormReasonToHelper("volume_ml:too_large")).toMatch(TOO_LARGE);
  });

  it("the inline save gate shows the too-large message before Save", () => {
    const gate = assessQuickLogWaterSaveGate({
      form: { ...EMPTY_QUICKLOG_WATERING_FORM, volumeMl: "1000000" },
      temperatureC: "",
      humidityPct: "",
      vpdKpa: "",
      temperatureUnit: "fahrenheit",
    });
    expect(gate.blocksSave).toBe(true);
    expect(gate.fields.volume).toMatch(TOO_LARGE);
  });

  it("the V2 save payload refuses the volume with the same message", () => {
    const resolved = { ok: true, targetType: "tent", targetId: "tent-1", growId: "grow-1" };
    const r = buildQuickLogV2SavePayload({
      resolved,
      action: "water",
      volumeMl: "1000000",
      note: "",
      temperatureC: "",
      humidityPct: "",
      vpdKpa: "",
      idempotencyKey: "idem-key-1234",
    } as unknown as Parameters<typeof buildQuickLogV2SavePayload>[0]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("volume_too_large");
      expect(quickLogReasonToOperatorMessage(r.reason)).toMatch(TOO_LARGE);
    }
  });
});
