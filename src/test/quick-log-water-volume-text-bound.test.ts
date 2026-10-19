import { describe, expect, it } from "vitest";
import { assessLargeWaterAmount } from "@/lib/quickLogWaterVolumeWarningRules";

describe("water volume text bound", () => {
  it("rejects a volume string longer than the input cap before parsing", () => {
    const oversized = `1.${"0".repeat(40)}`;
    const assessment = assessLargeWaterAmount({
      amount: oversized,
      unit: "ml",
      confirmedKey: null,
    });
    expect(oversized.length).toBeGreaterThan(32);
    expect(assessment.volumeMl).toBeNull();
    expect(assessment.warns).toBe(false);
    expect(assessment.confirmationKey).toBeNull();
  });

  it("still warns for a 10,001 ml amount inside the cap", () => {
    const assessment = assessLargeWaterAmount({
      amount: "10001",
      unit: "ml",
      confirmedKey: null,
    });
    expect(assessment.warns).toBe(true);
    expect(assessment.volumeMl).toBe(10_001);
  });
});
