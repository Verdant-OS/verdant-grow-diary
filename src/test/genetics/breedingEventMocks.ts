import type { BreedingEvent, BreedingEventType } from "@/lib/genetics/breedingTypes";

let idCounter = 1;

export function resetMockEventCounter() {
  idCounter = 1;
}

export function createBreedingEvent(
  type: BreedingEventType,
  daysOffset: number | null,
  details: Record<string, any> = {}
): BreedingEvent {
  const occurred_at = daysOffset !== null 
    ? new Date(Date.now() + daysOffset * 86400000).toISOString()
    : "invalid-date";
    
  return {
    id: `mock_evt_${idCounter++}`,
    type,
    occurred_at,
    details
  };
}

export function createCompleteBreedingCycle(): BreedingEvent[] {
  resetMockEventCounter();
  return [
    createBreedingEvent("reversal_application", 0, { method: "sts_spray" }),
    createBreedingEvent("pollen_shed_observed", 9, { intensity: "heavy" }),
    createBreedingEvent("pollination", 12, { method: "brush" }),
    createBreedingEvent("cross_harvest", 52)
  ];
}
