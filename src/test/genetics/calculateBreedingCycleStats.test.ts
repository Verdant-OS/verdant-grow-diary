import { describe, it, expect, beforeEach } from "vitest";
import { calculateBreedingCycleStats } from "@/lib/genetics/calculateBreedingCycleStats";
import { 
  createBreedingEvent, 
  createCompleteBreedingCycle, 
  resetMockEventCounter 
} from "./breedingEventMocks";

describe("calculateBreedingCycleStats", () => {
  beforeEach(() => {
    resetMockEventCounter();
  });

  it("1. Complete data", () => {
    const events = createCompleteBreedingCycle();
    const stats = calculateBreedingCycleStats(events);
    
    expect(stats.reversalToPollenDays).toBe(9);
    expect(stats.pollinationToHarvestDays).toBe(40);
    expect(stats.totalCycleDays).toBe(52);
    expect(stats.hasCompleteData).toBe(true);
    expect(stats.missingEvents).toEqual([]);
  });

  it("2. Missing reversal", () => {
    const events = [
      createBreedingEvent("pollination", 12),
      createBreedingEvent("cross_harvest", 52)
    ];
    const stats = calculateBreedingCycleStats(events);
    
    expect(stats.missingEvents).toContain("reversal_application");
    expect(stats.pollinationToHarvestDays).toBe(40);
    expect(stats.totalCycleDays).toBe(40); // 52 - 12
    expect(stats.hasCompleteData).toBe(false);
  });

  it("3. Missing pollen shed", () => {
    const events = [
      createBreedingEvent("reversal_application", 0),
      createBreedingEvent("pollination", 12),
      createBreedingEvent("cross_harvest", 52)
    ];
    const stats = calculateBreedingCycleStats(events);
    
    expect(stats.missingEvents).toContain("pollen_shed_observed");
    expect(stats.reversalToPollenDays).toBeUndefined(); // Assuming we tighten to undefined
    expect(stats.hasCompleteData).toBe(false);
  });

  it("4. Pollen shed before reversal", () => {
    const events = [
      createBreedingEvent("pollen_shed_observed", -5),
      createBreedingEvent("reversal_application", 0)
    ];
    const stats = calculateBreedingCycleStats(events);
    
    expect(stats.reversalToPollenDays).toBeUndefined();
    expect(stats.missingEvents).toContain("pollen_shed_after_reversal");
  });

  it("5. Missing pollination", () => {
    const events = [
      createBreedingEvent("reversal_application", 0),
      createBreedingEvent("pollen_shed_observed", 9),
      createBreedingEvent("cross_harvest", 52)
    ];
    const stats = calculateBreedingCycleStats(events);
    
    expect(stats.missingEvents).toContain("pollination");
    expect(stats.pollinationToHarvestDays).toBeUndefined();
  });

  it("6. Missing harvest", () => {
    const events = [
      createBreedingEvent("reversal_application", 0),
      createBreedingEvent("pollen_shed_observed", 9),
      createBreedingEvent("pollination", 12)
    ];
    const stats = calculateBreedingCycleStats(events);
    
    expect(stats.missingEvents).toContain("cross_harvest");
    expect(stats.pollinationToHarvestDays).toBeUndefined();
  });

  it("7. Harvest before pollination", () => {
    const events = [
      createBreedingEvent("cross_harvest", 5),
      createBreedingEvent("pollination", 12)
    ];
    const stats = calculateBreedingCycleStats(events);
    
    expect(stats.pollinationToHarvestDays).toBeUndefined();
    expect(stats.missingEvents).toContain("harvest_after_pollination");
  });

  it("8. Multiple reversals and pollen events", () => {
    const events = [
      createBreedingEvent("reversal_application", 0),
      createBreedingEvent("reversal_application", 2),
      createBreedingEvent("pollen_shed_observed", 8),
      createBreedingEvent("pollen_shed_observed", 10),
      createBreedingEvent("pollination", 12),
      createBreedingEvent("cross_harvest", 52)
    ];
    const stats = calculateBreedingCycleStats(events);
    
    expect(stats.reversalToPollenDays).toBe(8); // Picks earliest reversal (0) and first pollen after (8)
  });

  it("9. Multiple pollinations and harvests", () => {
    const events = [
      createBreedingEvent("reversal_application", 0),
      createBreedingEvent("pollen_shed_observed", 9),
      createBreedingEvent("pollination", 12),
      createBreedingEvent("pollination", 14),
      createBreedingEvent("cross_harvest", 40),
      createBreedingEvent("cross_harvest", 52)
    ];
    const stats = calculateBreedingCycleStats(events);
    
    expect(stats.pollinationToHarvestDays).toBe(28); // 40 - 12
  });

  it("10. Same-day events", () => {
    const events = [
      createBreedingEvent("reversal_application", 0),
      createBreedingEvent("pollen_shed_observed", 0),
      createBreedingEvent("pollination", 0),
      createBreedingEvent("cross_harvest", 0)
    ];
    const stats = calculateBreedingCycleStats(events);
    
    expect(stats.reversalToPollenDays).toBe(0);
    expect(stats.pollinationToHarvestDays).toBe(0);
    expect(stats.totalCycleDays).toBe(0);
    expect(stats.hasCompleteData).toBe(true);
  });

  it("11. Invalid dates", () => {
    const events = [
      createBreedingEvent("reversal_application", null),
      createBreedingEvent("pollination", 12),
      createBreedingEvent("cross_harvest", 52)
    ];
    const stats = calculateBreedingCycleStats(events);
    
    expect(stats.missingEvents).toContain("invalid_event_dates");
    expect(stats.reversalToPollenDays).toBeUndefined();
    expect(stats.pollinationToHarvestDays).toBe(40);
    expect(stats.totalCycleDays).toBe(40);
    expect(Number.isNaN(stats.pollinationToHarvestDays)).toBe(false);
  });

  it("12. Unknown pollen intensity", () => {
    const events = [
      createBreedingEvent("reversal_application", 0),
      createBreedingEvent("pollen_shed_observed", 9, { intensity: "super_heavy_unknown" }),
      createBreedingEvent("pollination", 12),
      createBreedingEvent("cross_harvest", 52)
    ];
    const stats = calculateBreedingCycleStats(events);
    
    expect(stats.pollenIntensity).toBeUndefined();
    expect(stats.reversalToPollenDays).toBe(9);
  });

  it("13. Empty events", () => {
    const stats = calculateBreedingCycleStats([]);
    expect(stats.hasCompleteData).toBe(false);
    expect(stats.missingEvents).toContain("missing required event categories");
  });
});
