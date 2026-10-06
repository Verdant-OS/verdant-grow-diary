/**
 * One-Tent Home honesty fence (slice `tonight-tent-honesty-fences`).
 *
 * `deriveTentHealthChip` sees only plant and alert counts. Counts are not
 * telemetry: zero alerts can mean an unassessed tent, and an unknown alert
 * count is not zero. So no input may yield a healthy chip.
 */
import { describe, it, expect } from "vitest";
import { deriveTentHealthChip } from "@/lib/tentHealthChip";

const COUNTS = [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, -1, 0, 1, 3, 12];

describe("deriveTentHealthChip never claims health from counts", () => {
  it("returns isHealthy false for every plant/alert combination", () => {
    for (const plantCount of COUNTS) {
      for (const alertCount of COUNTS) {
        const chip = deriveTentHealthChip({ plantCount, alertCount });
        expect(chip.isHealthy, `plants=${plantCount} alerts=${alertCount}`).toBe(false);
        expect(chip.copy.toLowerCase()).not.toContain("healthy");
        expect(chip.variant).not.toBe("healthy");
      }
    }
  });

  it("states zero alerts as a neutral fact, not health", () => {
    expect(deriveTentHealthChip({ plantCount: 3, alertCount: 0 })).toEqual({
      variant: "no_alerts",
      copy: "No open alerts",
      isHealthy: false,
    });
  });

  it("treats an unknown alert count as unknown, never as zero", () => {
    for (const alertCount of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(deriveTentHealthChip({ plantCount: 3, alertCount })).toEqual({
        variant: "unknown",
        copy: "Alert status unknown",
        isHealthy: false,
      });
    }
  });

  it("treats a negative count as unknown", () => {
    expect(deriveTentHealthChip({ plantCount: -1, alertCount: 0 }).variant).toBe("unknown");
    expect(deriveTentHealthChip({ plantCount: 3, alertCount: -1 }).variant).toBe("unknown");
  });

  it("keeps the existing empty and alert variants", () => {
    expect(deriveTentHealthChip({ plantCount: 0, alertCount: 0 }).variant).toBe("empty");
    expect(deriveTentHealthChip({ plantCount: 3, alertCount: 2 }).copy).toBe("● 2 alerts");
  });

  it("is deterministic", () => {
    const input = { plantCount: 4, alertCount: 0 };
    expect(deriveTentHealthChip(input)).toEqual(deriveTentHealthChip(input));
  });
});
