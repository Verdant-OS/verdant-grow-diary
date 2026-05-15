import { describe, it, expect } from "vitest";
import { nextHarvestGate, HARVEST_GATES } from "./leveling";

describe("nextHarvestGate", () => {
  it("returns first gate when no harvests logged", () => {
    expect(nextHarvestGate(0)).toEqual({ needed: 1, cap: 14 });
  });
  it("advances after each harvest", () => {
    expect(nextHarvestGate(1)).toEqual({ needed: 1, cap: 17 });
    expect(nextHarvestGate(2)).toEqual({ needed: 1, cap: 20 });
  });
  it("returns null once all gates are met", () => {
    expect(nextHarvestGate(3)).toBeNull();
    expect(nextHarvestGate(99)).toBeNull();
  });
  it("HARVEST_GATES is monotonically increasing", () => {
    for (let i = 1; i < HARVEST_GATES.length; i++) {
      expect(HARVEST_GATES[i].req).toBeGreaterThan(HARVEST_GATES[i - 1].req);
      expect(HARVEST_GATES[i].cap).toBeGreaterThan(HARVEST_GATES[i - 1].cap);
    }
  });
});
