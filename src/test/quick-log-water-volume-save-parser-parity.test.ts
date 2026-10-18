/**
 * The large-water warning and the save path must classify every Volume entry
 * the same way (#2145 Codex findings 4287760116 and 4305240556). Text the
 * warning cannot evaluate must not save, and an entry above the 1,000,000 ml
 * hard maximum must not round down to an accepted value in the save parser.
 */
import { describe, expect, it } from "vitest";

import {
  LARGE_WATER_AMOUNT_HARD_MAX_ML,
  MAX_WATER_VOLUME_TEXT_LENGTH,
  assessLargeWaterAmount,
} from "@/lib/quickLogWaterVolumeWarningRules";
import { assessQuickLogWaterSaveGate } from "@/lib/quickLogWaterSaveGateRules";
import {
  EMPTY_QUICKLOG_WATERING_FORM,
  buildWateringFormPayload,
} from "@/lib/quickLogWateringFormViewModel";
import { buildWateringReview } from "@/lib/quickLogWateringReviewViewModel";

function save(volumeMl: string) {
  return buildWateringFormPayload({
    growId: "grow-1",
    idempotencyKey: "water-save-123",
    form: { ...EMPTY_QUICKLOG_WATERING_FORM, volumeMl },
  });
}

function gate(volumeMl: string) {
  return assessQuickLogWaterSaveGate({
    form: { ...EMPTY_QUICKLOG_WATERING_FORM, volumeMl },
    temperatureC: "",
    humidityPct: "",
    vpdKpa: "",
    temperatureUnit: "celsius",
  });
}

const OVERSIZED_VALID = `10001.${"0".repeat(40)}`;
const JUST_ABOVE_HARD_MAX = "1000000.00000000001";

describe("water volume save parser parity", () => {
  it("rejects volume text longer than the warning can evaluate", () => {
    expect(OVERSIZED_VALID.length).toBeGreaterThan(MAX_WATER_VOLUME_TEXT_LENGTH);
    expect(save(OVERSIZED_VALID)).toEqual({ ok: false, reason: "volume_ml:invalid" });
    expect(gate(OVERSIZED_VALID).blocksSave).toBe(true);
    expect(gate(OVERSIZED_VALID).fields.volume).toBeTruthy();
  });

  it("rejects a decimal just above the hard maximum that Number() rounds down", () => {
    expect(Number(JUST_ABOVE_HARD_MAX)).toBe(LARGE_WATER_AMOUNT_HARD_MAX_ML);
    expect(JUST_ABOVE_HARD_MAX.length).toBeLessThanOrEqual(MAX_WATER_VOLUME_TEXT_LENGTH);
    expect(save(JUST_ABOVE_HARD_MAX)).toEqual({ ok: false, reason: "volume_ml:invalid" });
    expect(gate(JUST_ABOVE_HARD_MAX).blocksSave).toBe(true);
  });

  it("still saves the hard maximum and ordinary amounts unchanged", () => {
    const max = save("1000000");
    expect(max.ok && max.payload.volume_ml).toBe(1_000_000);
    const half = save(" 10.5 ");
    expect(half.ok && half.payload.volume_ml).toBe(10.5);
    expect(save("0")).toEqual({ ok: false, reason: "volume_ml:invalid" });
    expect(save("-5")).toEqual({ ok: false, reason: "volume_ml:invalid" });
    expect(save("")).toEqual({ ok: false, reason: "volume_ml:missing" });
  });

  it("asks for confirmation for every saveable entry above 10,000 ml", () => {
    const samples = [
      "10000",
      "10000.0",
      "10000.0000000000000001",
      "10001",
      "999999.9999",
      "1000000",
      "1000000.0",
      JUST_ABOVE_HARD_MAX,
      "1000001",
      OVERSIZED_VALID,
      `1.${"0".repeat(40)}`,
      "500",
    ];
    for (const amount of samples) {
      const result = save(amount);
      const saveable = result.ok;
      const warning = assessLargeWaterAmount({ amount, unit: "ml", confirmedKey: null });
      const aboveThreshold = warning.confirmationKey !== null;
      if (saveable && result.ok && result.payload.volume_ml > 10_000) {
        expect(aboveThreshold, amount).toBe(true);
      }
      if (aboveThreshold) expect(saveable, amount).toBe(true);
      expect(gate(amount).blocksSave, amount).toBe(!saveable);
    }
  });

  it("keeps the review model in step with the save path", () => {
    const samples = [
      OVERSIZED_VALID,
      JUST_ABOVE_HARD_MAX,
      "1000000",
      "1000001",
      "10001",
      " 10.5 ",
      "+5",
      "0",
      "-5",
      "",
      "abc",
    ];
    for (const amount of samples) {
      const review = buildWateringReview({ ...EMPTY_QUICKLOG_WATERING_FORM, volumeMl: amount });
      expect(review.needsInput, amount).toBe(!save(amount).ok);
    }
  });
});
