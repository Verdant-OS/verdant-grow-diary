import type { BreedingEvent } from "./breedingTypes";

export interface BreedingCycleStats {
  reversalToPollenDays: number | undefined;
  pollinationToHarvestDays: number | undefined;
  totalCycleDays: number | undefined;
  reversalMethod: string | undefined;
  pollenIntensity: "light" | "moderate" | "heavy" | undefined;
  pollinationMethod: string | undefined;
  hasCompleteData: boolean;
  missingEvents: string[];
}

export interface CalculateBreedingCycleStatsOptions {
  donorPlantId?: string | undefined;
  harvestEventId?: string | undefined;
}

function isValidDate(dateStr: string): boolean {
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

function normalizePollenIntensity(intensity: any): "light" | "moderate" | "heavy" | undefined {
  if (typeof intensity === "string") {
    const lower = intensity.trim().toLowerCase();
    if (lower === "light" || lower === "moderate" || lower === "heavy") {
      return lower;
    }
  }
  return undefined;
}

function diffDays(startStr: string, endStr: string): number {
  const start = new Date(startStr).getTime();
  const end = new Date(endStr).getTime();
  return Math.round((end - start) / 86400000); // 86400000 ms per day
}

export function calculateBreedingCycleStats(
  events: BreedingEvent[],
  options?: CalculateBreedingCycleStatsOptions
): BreedingCycleStats {
  const stats: BreedingCycleStats = {
    reversalToPollenDays: undefined,
    pollinationToHarvestDays: undefined,
    totalCycleDays: undefined,
    reversalMethod: undefined,
    pollenIntensity: undefined,
    pollinationMethod: undefined,
    hasCompleteData: false,
    missingEvents: []
  };

  if (!events || events.length === 0) {
    stats.missingEvents.push("missing required event categories");
    return stats;
  }

  // Filter out completely invalid dates upfront
  const validEvents = events.filter(e => isValidDate(e.occurred_at));
  if (validEvents.length < events.length) {
    stats.missingEvents.push("invalid_event_dates");
  }

  // Sort chronological
  const sortedEvents = [...validEvents].sort(
    (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
  );

  // Find reversal
  // If donorPlantId is provided, we could filter by it, but for now we'll just pick the first reversal
  const reversal = sortedEvents.find(e => e.type === "reversal_application");
  
  // Find first pollen shed AFTER reversal (or first overall if no reversal)
  let pollen: BreedingEvent | undefined;
  if (reversal) {
    pollen = sortedEvents.find(
      e => e.type === "pollen_shed_observed" && 
      new Date(e.occurred_at).getTime() >= new Date(reversal.occurred_at).getTime()
    );
    const beforeReversalPollen = sortedEvents.find(
      e => e.type === "pollen_shed_observed" && 
      new Date(e.occurred_at).getTime() < new Date(reversal.occurred_at).getTime()
    );
    if (!pollen && beforeReversalPollen) {
      stats.missingEvents.push("pollen_shed_after_reversal");
    }
  } else {
    pollen = sortedEvents.find(e => e.type === "pollen_shed_observed");
  }

  // Find earliest pollination
  const pollination = sortedEvents.find(e => e.type === "pollination");

  // Find cross_harvest AFTER pollination
  let harvest: BreedingEvent | undefined;
  if (options?.harvestEventId) {
    harvest = sortedEvents.find(e => e.id === options.harvestEventId && e.type === "cross_harvest");
  } else if (pollination) {
    harvest = sortedEvents.find(
      e => e.type === "cross_harvest" &&
      new Date(e.occurred_at).getTime() >= new Date(pollination.occurred_at).getTime()
    );
    const beforePollinationHarvest = sortedEvents.find(
      e => e.type === "cross_harvest" &&
      new Date(e.occurred_at).getTime() < new Date(pollination.occurred_at).getTime()
    );
    if (!harvest && beforePollinationHarvest) {
      stats.missingEvents.push("harvest_after_pollination");
    }
  } else {
    harvest = sortedEvents.find(e => e.type === "cross_harvest");
  }

  // Calculate metrics
  if (!reversal) {
    stats.missingEvents.push("reversal_application");
  } else {
    stats.reversalMethod = reversal.details?.method;
  }

  if (!pollen) {
    if (!stats.missingEvents.includes("pollen_shed_after_reversal")) {
      stats.missingEvents.push("pollen_shed_observed");
    }
  } else {
    stats.pollenIntensity = normalizePollenIntensity(pollen.details?.intensity);
  }

  if (reversal && pollen) {
    stats.reversalToPollenDays = diffDays(reversal.occurred_at, pollen.occurred_at);
  }

  if (!pollination) {
    stats.missingEvents.push("pollination");
  } else {
    stats.pollinationMethod = pollination.details?.method;
  }

  if (!harvest) {
    if (!stats.missingEvents.includes("harvest_after_pollination")) {
      stats.missingEvents.push("cross_harvest");
    }
  }

  if (pollination && harvest) {
    stats.pollinationToHarvestDays = diffDays(pollination.occurred_at, harvest.occurred_at);
  }

  const cycleStart = reversal ?? pollination;
  if (cycleStart && harvest) {
    stats.totalCycleDays = diffDays(cycleStart.occurred_at, harvest.occurred_at);
  }

  // Determine if complete
  const missingCritical = stats.missingEvents.filter(e => e !== "invalid_event_dates");
  if (
    stats.reversalToPollenDays !== undefined &&
    stats.pollinationToHarvestDays !== undefined &&
    stats.totalCycleDays !== undefined &&
    missingCritical.length === 0
  ) {
    stats.hasCompleteData = true;
  }

  return stats;
}
