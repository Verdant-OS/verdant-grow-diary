/**
 * #2159 — negative EC must say the value is below zero and name the EC field.
 * The compensation hint must not call a negative reading "exceeds plausible max".
 */
import { describe, expect, it } from "vitest";

import { computeEcCompensation } from "@/lib/ecCompensationRules";
import { buildEcCompensationPreview } from "@/lib/ecCompensationPreviewViewModel";
import {
  buildFeedingFormPayload,
  feedingFormReasonToHelper,
  FEEDING_FORM_DEFAULT_UNIT,
  type QuickLogFeedingFormState,
} from "@/lib/quickLogFeedingFormViewModel";
import {
  EMPTY_QUICKLOG_WATERING_FORM,
  buildWateringFormPayload,
  wateringFormReasonToHelper,
  type QuickLogWateringFormState,
} from "@/lib/quickLogWateringFormViewModel";

function wateringForm(patch: Partial<QuickLogWateringFormState> = {}): QuickLogWateringFormState {
  return { ...EMPTY_QUICKLOG_WATERING_FORM, volumeMl: "500", waterTempC: "22", ...patch };
}

function feedingForm(patch: Partial<QuickLogFeedingFormState> = {}): QuickLogFeedingFormState {
  return {
    lineId: "cronk",
    volumeMl: "500",
    products: [{ name: "Base", amount: "2", unit: FEEDING_FORM_DEFAULT_UNIT }],
    ph: "",
    ecIn: "",
    ppmIn: "",
    ecOut: "",
    ppmOut: "",
    runoffMl: "",
    runoffPh: "",
    runoffEc: "",
    runoffPpm: "",
    waterTempC: "22",
    note: "",
    ...patch,
  };
}

function expectNamedNegativeEc(message: string) {
  expect(message).toMatch(/\bEC\b/);
  expect(message).toMatch(/can't be negative|cannot be negative|below/i);
  expect(message).not.toMatch(/exceeds plausible max/i);
  expect(message).not.toMatch(/one or more measurements/i);
  expect(message).not.toMatch(/valid numbers or left blank/i);
  expect(message).not.toMatch(/plain numbers or left blank/i);
}

describe("issue 2159 — negative EC names the field", () => {
  it("compensation hint for EC -1 says it can't be negative", () => {
    const result = computeEcCompensation({
      ecValue: -1,
      ecUnit: "mS/cm",
      temperatureValue: 22,
      temperatureUnit: "C",
      sourceLabel: "manual",
    });
    expect(result.compensatedEc25c).toBeNull();
    expect(result.warnings.join(" ")).toMatch(/EC can't be negative/i);
    expect(result.warnings.join(" ")).not.toMatch(/exceeds plausible max/i);
  });

  it("preview hint for EC -1 does not say the value exceeds the max", () => {
    const preview = buildEcCompensationPreview({
      ec: "-1",
      ecUnit: "mS/cm",
      waterTempC: "22",
      sourceLabel: "manual",
    });
    expect(preview.visible).toBe(true);
    expect(preview.hint ?? "").toMatch(/EC can't be negative/i);
    expect(preview.hint ?? "").not.toMatch(/exceeds plausible max/i);
  });

  it("still flags an EC above the plausible max as too high", () => {
    const result = computeEcCompensation({
      ecValue: 1800,
      ecUnit: "mS/cm",
      temperatureValue: 25,
      temperatureUnit: "C",
      sourceLabel: "manual",
    });
    expect(result.blockedReason).toBe("suspicious_ec_magnitude");
    expect(result.warnings.join(" ")).toMatch(/exceeds plausible max 5/);
  });

  it("watering save error for EC -1 names the EC field", () => {
    const built = buildWateringFormPayload({
      growId: "grow-1",
      idempotencyKey: "idem-key-2159-water",
      form: wateringForm({ ec: "-1" }),
    });
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expectNamedNegativeEc(wateringFormReasonToHelper(built.reason));
  });

  it("feeding save error for EC -1 names the EC field", () => {
    const built = buildFeedingFormPayload({
      growId: "grow-1",
      idempotencyKey: "idem-key-2159-feed",
      form: feedingForm({ ecIn: "-1" }),
    });
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expectNamedNegativeEc(feedingFormReasonToHelper(built.reason));
  });
});
