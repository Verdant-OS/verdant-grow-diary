import { describe, expect, it } from "vitest";
import {
  buildWateringFormPayload,
  EMPTY_QUICKLOG_WATERING_FORM,
} from "@/lib/quickLogWateringFormViewModel";
import {
  LARGE_WATER_AMOUNT_EDIT_LABEL,
  LARGE_WATER_AMOUNT_CONFIRM_LABEL,
  assessLargeWaterAmount,
  confirmLargeWaterAmount,
} from "@/lib/quickLogWaterVolumeWarningRules";

const baseInput = {
  growId: "grow-1",
  idempotencyKey: "water-save-123",
  form: { ...EMPTY_QUICKLOG_WATERING_FORM, volumeMl: "500" },
};

describe("large water amount warning", () => {
  it("does not warn at exactly 10,000 ml", () => {
    const assessment = assessLargeWaterAmount({ amount: "10000", unit: "ml", confirmedKey: null });
    expect(assessment.warns).toBe(false);
    expect(assessment.needsConfirmation).toBe(false);
    expect(assessment.volumeMl).toBe(10_000);
  });

  it("warns above 10,000 ml and shows the entered amount", () => {
    const assessment = assessLargeWaterAmount({ amount: "10001", unit: "ml", confirmedKey: null });
    expect(assessment.warns).toBe(true);
    expect(assessment.needsConfirmation).toBe(true);
    expect(assessment.volumeMl).toBe(10_001);
    expect(assessment.enteredLabel).toBe("10001 ml");
    expect(assessment.message).toContain("10001 ml");
    expect(assessment.message?.toLowerCase()).not.toMatch(/safe|recommend/);
    expect(assessment.editLabel).toBe(LARGE_WATER_AMOUNT_EDIT_LABEL);
    expect(assessment.confirmLabel).toBe(LARGE_WATER_AMOUNT_CONFIRM_LABEL);
  });

  it("treats the typed amount as milliliters", () => {
    expect(assessLargeWaterAmount({ amount: "10", unit: "ml", confirmedKey: null }).warns).toBe(
      false,
    );
    expect(
      assessLargeWaterAmount({ amount: "10001", unit: "ml", confirmedKey: null }),
    ).toMatchObject({
      warns: true,
      volumeMl: 10_001,
      enteredLabel: "10001 ml",
    });
  });

  it("requires a fresh confirmation after the amount changes", () => {
    const first = assessLargeWaterAmount({ amount: "10001", unit: "ml", confirmedKey: null });
    expect(first.confirmationKey).toBeTruthy();
    const confirmed = assessLargeWaterAmount({
      amount: "10001",
      unit: "ml",
      confirmedKey: first.confirmationKey,
    });
    expect(confirmed.needsConfirmation).toBe(false);
    const changed = assessLargeWaterAmount({
      amount: "10002",
      unit: "ml",
      confirmedKey: first.confirmationKey,
    });
    expect(changed.needsConfirmation).toBe(true);
    expect(changed.confirmationKey).not.toBe(first.confirmationKey);
  });

  it("saves once when the amount is confirmed", () => {
    const key = assessLargeWaterAmount({
      amount: "10001",
      unit: "ml",
      confirmedKey: null,
    }).confirmationKey;
    expect(key).toBeTruthy();
    const first = confirmLargeWaterAmount({ inFlight: false, confirmedKey: null }, key!);
    expect(first.save).toBe(true);
    const second = confirmLargeWaterAmount(
      { inFlight: first.inFlight, confirmedKey: first.confirmedKey },
      key!,
    );
    expect(second.save).toBe(false);
  });

  it("keeps the 50,000 ml hard limit and finite positive checks", () => {
    const overHard = buildWateringFormPayload({
      ...baseInput,
      form: { ...EMPTY_QUICKLOG_WATERING_FORM, volumeMl: "50001" },
    });
    expect(overHard).toEqual({ ok: false, reason: "volume_ml:too_large" });

    const atHard = buildWateringFormPayload({
      ...baseInput,
      form: { ...EMPTY_QUICKLOG_WATERING_FORM, volumeMl: "50000" },
    });
    expect(atHard.ok).toBe(true);

    const aboveWarning = buildWateringFormPayload({
      ...baseInput,
      form: { ...EMPTY_QUICKLOG_WATERING_FORM, volumeMl: "10001" },
    });
    expect(aboveWarning.ok).toBe(true);
    if (aboveWarning.ok) expect(aboveWarning.payload.volume_ml).toBe(10_001);

    const fractional = buildWateringFormPayload({
      ...baseInput,
      form: { ...EMPTY_QUICKLOG_WATERING_FORM, volumeMl: "10.001" },
    });
    expect(fractional.ok).toBe(true);
    if (fractional.ok) expect(fractional.payload.volume_ml).toBe(10.001);

    for (const volumeMl of ["0", "-5", "abc", ""]) {
      const result = buildWateringFormPayload({
        ...baseInput,
        form: { ...EMPTY_QUICKLOG_WATERING_FORM, volumeMl },
      });
      expect(result.ok).toBe(false);
    }
  });
});
