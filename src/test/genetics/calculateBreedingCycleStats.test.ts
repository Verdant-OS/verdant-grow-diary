import { describe, it, expect } from "vitest";
import {
  calculateBreedingCycleStats,
  type BreedingCycleTimelinePoint,
} from "@/lib/genetics/calculateBreedingCycleStats";
import type { BreedingEventType } from "@/lib/genetics/breedingTypes";

function point(type: BreedingEventType, iso: string): BreedingCycleTimelinePoint {
  return { type, occurredAt: iso };
}

describe("calculateBreedingCycleStats", () => {
  it("1. complete data: reversal -> pollen shed -> pollination -> harvest", () => {
    const points = [
      point("reversal_application", "2026-01-01T00:00:00.000Z"),
      point("pollen_shed_observed", "2026-01-10T00:00:00.000Z"),
      point("pollination", "2026-01-13T00:00:00.000Z"),
      point("cross_harvest", "2026-02-22T00:00:00.000Z"),
    ];
    const stats = calculateBreedingCycleStats(points);
    expect(stats.reversalToPollenShedDays).toBe(9);
    expect(stats.pollinationToHarvestDays).toBe(40);
    expect(stats.totalCycleDays).toBe(52); // reversal day 0 to harvest
    expect(stats.hasCompleteData).toBe(true);
    expect(stats.missingEvents).toEqual([]);
  });

  it("2. missing reversal_application", () => {
    const points = [
      point("pollination", "2026-01-13T00:00:00.000Z"),
      point("cross_harvest", "2026-02-22T00:00:00.000Z"),
    ];
    const stats = calculateBreedingCycleStats(points);
    expect(stats.missingEvents).toContain("reversal_application");
    expect(stats.pollinationToHarvestDays).toBe(40);
    expect(stats.hasCompleteData).toBe(false);
  });

  it("3. missing pollen_shed_observed", () => {
    const points = [
      point("reversal_application", "2026-01-01T00:00:00.000Z"),
      point("pollination", "2026-01-13T00:00:00.000Z"),
      point("cross_harvest", "2026-02-22T00:00:00.000Z"),
    ];
    const stats = calculateBreedingCycleStats(points);
    expect(stats.missingEvents).toContain("pollen_shed_observed");
    expect(stats.reversalToPollenShedDays).toBeNull();
    expect(stats.pollinationToHarvestDays).toBe(40);
    expect(stats.totalCycleDays).not.toBeNaN();
  });

  it("4. pollen shed before reversal is ignored for reversalToPollenShedDays", () => {
    const points = [
      point("pollen_shed_observed", "2025-12-20T00:00:00.000Z"),
      point("reversal_application", "2026-01-01T00:00:00.000Z"),
      point("pollination", "2026-01-13T00:00:00.000Z"),
      point("cross_harvest", "2026-02-22T00:00:00.000Z"),
    ];
    const stats = calculateBreedingCycleStats(points);
    expect(stats.missingEvents).toContain("pollen_shed_observed");
    expect(stats.reversalToPollenShedDays).toBeNull();
  });

  it("5. missing pollination", () => {
    const points = [
      point("reversal_application", "2026-01-01T00:00:00.000Z"),
      point("pollen_shed_observed", "2026-01-10T00:00:00.000Z"),
      point("cross_harvest", "2026-02-22T00:00:00.000Z"),
    ];
    const stats = calculateBreedingCycleStats(points);
    expect(stats.missingEvents).toContain("pollination");
    expect(stats.pollinationToHarvestDays).toBeNull();
  });

  it("6. missing cross_harvest", () => {
    const points = [
      point("reversal_application", "2026-01-01T00:00:00.000Z"),
      point("pollen_shed_observed", "2026-01-10T00:00:00.000Z"),
      point("pollination", "2026-01-13T00:00:00.000Z"),
    ];
    const stats = calculateBreedingCycleStats(points);
    expect(stats.missingEvents).toContain("cross_harvest");
    expect(stats.pollinationToHarvestDays).toBeNull();
  });

  it("7. harvest before pollination is ignored, later harvest is used", () => {
    const points = [
      point("reversal_application", "2026-01-01T00:00:00.000Z"),
      point("pollen_shed_observed", "2026-01-10T00:00:00.000Z"),
      point("cross_harvest", "2026-01-05T00:00:00.000Z"), // before pollination
      point("pollination", "2026-01-13T00:00:00.000Z"),
      point("cross_harvest", "2026-02-22T00:00:00.000Z"),
    ];
    const stats = calculateBreedingCycleStats(points);
    expect(stats.pollinationToHarvestDays).toBe(40);
    expect(stats.missingEvents).not.toContain("cross_harvest");
  });

  it("8. multiple reversals: earliest reversal + first pollen shed after it", () => {
    const points = [
      point("reversal_application", "2026-01-05T00:00:00.000Z"),
      point("reversal_application", "2026-01-01T00:00:00.000Z"),
      point("pollen_shed_observed", "2026-01-10T00:00:00.000Z"),
    ];
    const stats = calculateBreedingCycleStats(points);
    expect(stats.reversalToPollenShedDays).toBe(9); // Jan 1 -> Jan 10
  });

  it("9. multiple pollinations + harvests: earliest pollination + first harvest after it", () => {
    const points = [
      point("cross_harvest", "2026-01-05T00:00:00.000Z"), // before earliest pollination
      point("pollination", "2026-01-20T00:00:00.000Z"),
      point("pollination", "2026-01-13T00:00:00.000Z"),
      point("cross_harvest", "2026-02-22T00:00:00.000Z"),
    ];
    const stats = calculateBreedingCycleStats(points);
    expect(stats.pollinationToHarvestDays).toBe(40); // Jan 13 -> Feb 22
  });

  it("10. invalid timestamps do not crash and do not produce NaN", () => {
    const points = [
      { type: "reversal_application", occurredAt: "not-a-date" },
      point("pollination", "2026-01-13T00:00:00.000Z"),
      point("cross_harvest", "2026-02-22T00:00:00.000Z"),
    ] as BreedingCycleTimelinePoint[];
    const stats = calculateBreedingCycleStats(points);
    expect(stats.reversalToPollenShedDays).toBeNull();
    expect(stats.pollinationToHarvestDays).not.toBeNaN();
    expect(stats.totalCycleDays).not.toBeNaN();
    expect(stats.missingEvents).toContain("invalid_timestamps");
  });

  it("11. same-timestamp events can return 0 days (valid)", () => {
    const points = [
      point("reversal_application", "2026-01-01T10:00:00.000Z"),
      point("pollen_shed_observed", "2026-01-01T18:00:00.000Z"),
      point("pollination", "2026-01-01T20:00:00.000Z"),
      point("cross_harvest", "2026-01-01T22:00:00.000Z"),
    ];
    const stats = calculateBreedingCycleStats(points);
    expect(stats.reversalToPollenShedDays).toBe(0);
    expect(stats.pollinationToHarvestDays).toBe(0);
    expect(stats.totalCycleDays).toBe(0);
  });

  it("12. empty points array", () => {
    const stats = calculateBreedingCycleStats([]);
    expect(stats.hasCompleteData).toBe(false);
    expect(stats.missingEvents.length).toBeGreaterThan(0);
    expect(stats.reversalToPollenShedDays).toBeNull();
    expect(stats.pollinationToHarvestDays).toBeNull();
    expect(stats.totalCycleDays).toBeNull();
  });

  it("13. non-array input returns the same 'nothing known' shape as empty array", () => {
    const stats = calculateBreedingCycleStats(undefined);
    expect(stats.hasCompleteData).toBe(false);
    expect(stats.reversalToPollenShedDays).toBeNull();
    expect(stats.totalCycleDays).toBeNull();
  });

  it("14. isolation_start is used as a totalCycleDays start fallback when no reversal exists", () => {
    const points = [
      point("isolation_start", "2026-01-01T00:00:00.000Z"),
      point("pollination", "2026-01-13T00:00:00.000Z"),
      point("cross_harvest", "2026-02-22T00:00:00.000Z"),
    ];
    const stats = calculateBreedingCycleStats(points);
    // No reversal -> reversalToPollenShedDays stays null, but totalCycleDays
    // still spans from isolation_start to the harvest.
    expect(stats.reversalToPollenShedDays).toBeNull();
    expect(stats.pollinationToHarvestDays).toBe(40);
    expect(stats.totalCycleDays).toBe(52); // Jan 1 -> Feb 22
  });

  it("15. reversal_application takes priority over isolation_start when both exist", () => {
    const points = [
      point("isolation_start", "2025-12-01T00:00:00.000Z"),
      point("reversal_application", "2026-01-01T00:00:00.000Z"),
      point("pollen_shed_observed", "2026-01-10T00:00:00.000Z"),
      point("pollination", "2026-01-13T00:00:00.000Z"),
      point("cross_harvest", "2026-02-22T00:00:00.000Z"),
    ];
    const stats = calculateBreedingCycleStats(points);
    expect(stats.totalCycleDays).toBe(52); // from reversal (Jan 1), not isolation (Dec 1)
  });

  it("16. unsupported/unrelated event types are ignored, not counted as missing", () => {
    const points = [
      point("reversal_application", "2026-01-01T00:00:00.000Z"),
      point("pollen_shed_observed", "2026-01-10T00:00:00.000Z"),
      point("stigmas_receptive", "2026-01-11T00:00:00.000Z"),
      point("pollination", "2026-01-13T00:00:00.000Z"),
      point("cross_harvest", "2026-02-22T00:00:00.000Z"),
    ];
    const stats = calculateBreedingCycleStats(points);
    expect(stats.reversalToPollenShedDays).toBe(9);
    expect(stats.pollinationToHarvestDays).toBe(40);
    expect(stats.hasCompleteData).toBe(true);
  });

  it("never reports NaN for any numeric field regardless of input shape", () => {
    const stats = calculateBreedingCycleStats([
      { type: "reversal_application", occurredAt: "" } as BreedingCycleTimelinePoint,
      null as unknown as BreedingCycleTimelinePoint,
      { type: "cross_harvest", occurredAt: "2026-02-22T00:00:00.000Z" },
    ]);
    expect(stats.reversalToPollenShedDays).not.toBeNaN();
    expect(stats.pollinationToHarvestDays).not.toBeNaN();
    expect(stats.totalCycleDays).not.toBeNaN();
  });
});
