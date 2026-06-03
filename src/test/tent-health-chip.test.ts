import { describe, it, expect } from "vitest";
import { deriveTentHealthChip } from "@/lib/tentHealthChip";

describe("deriveTentHealthChip", () => {
  it("returns empty (not healthy) when plantCount is 0", () => {
    const chip = deriveTentHealthChip({ plantCount: 0, alertCount: 0 });
    expect(chip.variant).toBe("empty");
    expect(chip.copy).toBe("No plants");
    expect(chip.isHealthy).toBe(false);
  });

  it("returns unknown (not healthy) for nullish plantCount", () => {
    const chip = deriveTentHealthChip({ plantCount: null, alertCount: 0 });
    expect(chip.variant).toBe("unknown");
    expect(chip.isHealthy).toBe(false);
  });

  it("returns alerts for any pending alerts", () => {
    const chip = deriveTentHealthChip({ plantCount: 3, alertCount: 2 });
    expect(chip.variant).toBe("alerts");
    expect(chip.copy).toBe("● 2 alerts");
    expect(chip.isHealthy).toBe(false);
  });

  it("returns healthy when plants > 0 and no alerts", () => {
    const chip = deriveTentHealthChip({ plantCount: 3, alertCount: 0 });
    expect(chip.variant).toBe("healthy");
    expect(chip.isHealthy).toBe(true);
  });
});
