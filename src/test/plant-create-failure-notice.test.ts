import { describe, expect, it } from "vitest";
import {
  PLANT_CREATE_FAILED_MESSAGE,
  plantCreateFailureMessage,
} from "@/lib/plantCreateFailureNotice";
import { PLANT_HEALTH_NOT_ASSESSED_CREATE_UNAVAILABLE_MESSAGE } from "@/lib/plantHealthRules";

describe("plantCreateFailureMessage", () => {
  it("maps pre-migration unknown-health trigger rejections to the not-assessed copy", () => {
    expect(plantCreateFailureMessage({ message: "invalid plant health: unknown" })).toBe(
      PLANT_HEALTH_NOT_ASSESSED_CREATE_UNAVAILABLE_MESSAGE,
    );
  });

  it("passes through other database messages after trimming whitespace", () => {
    expect(
      plantCreateFailureMessage({
        message: '  new row violates check constraint "plants_stage_check"  ',
      }),
    ).toBe('new row violates check constraint "plants_stage_check"');
  });

  it("falls back when the error is missing or has no message", () => {
    expect(plantCreateFailureMessage(null)).toBe(PLANT_CREATE_FAILED_MESSAGE);
    expect(plantCreateFailureMessage(undefined)).toBe(PLANT_CREATE_FAILED_MESSAGE);
    expect(plantCreateFailureMessage({ code: "PGRST000" })).toBe(PLANT_CREATE_FAILED_MESSAGE);
    expect(plantCreateFailureMessage("network down")).toBe(PLANT_CREATE_FAILED_MESSAGE);
  });
});
