/**
 * Regression: with Celsius chosen in Settings, the Daily Check manual
 * snapshot step said "Temperature uses °F." under a form that reads
 * "Entered in °C — saved as Celsius." The unit line must name the
 * grower's display unit.
 */
import { describe, expect, it } from "vitest";
import { dailyCheckManualSnapshotUnitNote } from "@/lib/dailyCheckPostSubmitRules";

describe("dailyCheckManualSnapshotUnitNote", () => {
  it("names °C when the grower's unit is Celsius", () => {
    expect(dailyCheckManualSnapshotUnitNote("celsius")).toBe("Temperature uses °C.");
  });

  it("names °F when the grower's unit is Fahrenheit", () => {
    expect(dailyCheckManualSnapshotUnitNote("fahrenheit")).toBe("Temperature uses °F.");
  });
});
