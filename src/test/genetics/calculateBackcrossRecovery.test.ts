import { describe, it, expect } from "vitest";
import { calculateBackcrossRecovery } from "@/lib/genetics/calculateBackcrossRecovery";

describe("calculateBackcrossRecovery", () => {
  it("Returns 75% recurrent and 25% donor for BC1", () => {
    const res = calculateBackcrossRecovery(1);
    expect(res?.recurrentRecoveredPct).toBe(75);
    expect(res?.donorRemainingPct).toBe(25);
  });

  it("Returns 87.5% recurrent and 12.5% donor for BC2", () => {
    const res = calculateBackcrossRecovery(2);
    expect(res?.recurrentRecoveredPct).toBe(87.5);
    expect(res?.donorRemainingPct).toBe(12.5);
  });

  it("Returns 93.75% recurrent and 6.25% donor for BC3", () => {
    const res = calculateBackcrossRecovery(3);
    expect(res?.recurrentRecoveredPct).toBe(93.75);
    expect(res?.donorRemainingPct).toBe(6.25);
  });

  it("Rejects negative generations", () => {
    expect(calculateBackcrossRecovery(-1)).toBeUndefined();
    expect(calculateBackcrossRecovery(0)).toBeUndefined();
  });

  it("Rejects non-integer generations", () => {
    expect(calculateBackcrossRecovery(1.5)).toBeUndefined();
  });

  it("Includes theoretical average disclaimer", () => {
    const res = calculateBackcrossRecovery(1);
    expect(res?.disclaimer).toContain("theoretical statistical average");
  });
});
