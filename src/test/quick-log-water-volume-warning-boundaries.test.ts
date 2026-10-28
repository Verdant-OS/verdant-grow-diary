import { describe, expect, it } from "vitest";
import {
  assessLargeWaterAmount,
  confirmLargeWaterAmount,
  largeWaterConfirmationKey,
  waterEntryToMilliliters,
} from "@/lib/quickLogWaterVolumeWarningRules";

describe("large water amount warning boundaries", () => {
  it("does not offer confirmation above the 50,000 ml hard ceiling", () => {
    expect(largeWaterConfirmationKey("50001", "ml")).toBeNull();
    const assessment = assessLargeWaterAmount({
      amount: "50001",
      unit: "ml",
      confirmedKey: null,
    });
    expect(assessment.warns).toBe(false);
    expect(assessment.needsConfirmation).toBe(false);
  });

  it("still warns at the hard ceiling when it remains above 10,000 ml", () => {
    const assessment = assessLargeWaterAmount({
      amount: "50000",
      unit: "ml",
      confirmedKey: null,
    });
    expect(assessment.warns).toBe(true);
    expect(assessment.needsConfirmation).toBe(true);
    expect(assessment.volumeMl).toBe(50_000);
  });

  it("parses trimmed non-negative decimals and rejects invalid signs", () => {
    expect(waterEntryToMilliliters("  10001  ")).toBe(10_001);
    expect(waterEntryToMilliliters("10.5")).toBe(10.5);
    expect(waterEntryToMilliliters("-1")).toBeNull();
    expect(waterEntryToMilliliters("1e5")).toBeNull();
  });

  it("does not start a second save while confirmation is in flight", () => {
    const key = assessLargeWaterAmount({
      amount: "10001",
      unit: "ml",
      confirmedKey: null,
    }).confirmationKey;
    expect(key).toBeTruthy();
    const armed = confirmLargeWaterAmount({ inFlight: false, confirmedKey: null }, key!);
    expect(armed.save).toBe(true);
    const blocked = confirmLargeWaterAmount({ inFlight: true, confirmedKey: null }, key!);
    expect(blocked.save).toBe(false);
  });
});
