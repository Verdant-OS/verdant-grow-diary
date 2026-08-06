import type { BreedingEvent } from "./breedingTypes";

export interface GeneticParentage {
  donor_plant_id?: string;
  receiver_plant_ids?: string[];
  source_pollination_event_id?: string;
  source_harvest_event_id?: string;
  confidence: "low" | "medium" | "high";
  missing_links: string[];
}

export interface ParentageResolutionInput {
  events: BreedingEvent[];
  plantId?: string;
  seedBatchId?: string;
  harvestEventId?: string;
}

export function getGeneticParentage(input: ParentageResolutionInput): GeneticParentage {
  const result: GeneticParentage = {
    confidence: "low",
    missing_links: [],
  };

  if (!input || !Array.isArray(input.events) || input.events.length === 0) {
    result.missing_links = [
      "pollination_event",
      "cross_harvest_event",
      "donor_plant_id",
      "receiver_plant_ids",
    ];
    return result;
  }

  // Sort events chronologically to allow reliable preceding-event lookups
  const sortedEvents = [...input.events].sort((a, b) => {
    return new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime();
  });

  let harvestEvent: BreedingEvent | undefined;

  // 1. Resolve harvest event
  if (input.harvestEventId) {
    harvestEvent = sortedEvents.find(e => e.id === input.harvestEventId && e.type === "cross_harvest");
  } else if (input.seedBatchId) {
    harvestEvent = sortedEvents.find(e => e.type === "cross_harvest" && e.details?.seed_batch_id === input.seedBatchId);
  } else if (input.plantId) {
    harvestEvent = sortedEvents.find(e => {
      if (e.type !== "cross_harvest") return false;
      const offspring = e.details?.offspring_plant_ids;
      return Array.isArray(offspring) && offspring.includes(input.plantId);
    });
  }

  if (harvestEvent) {
    result.source_harvest_event_id = harvestEvent.id;
  }

  let pollinationEvent: BreedingEvent | undefined;

  // 2. Resolve pollination event
  if (harvestEvent) {
    // Find closest pollination before harvest
    const harvestTime = new Date(harvestEvent.occurred_at).getTime();
    
    pollinationEvent = [...sortedEvents].reverse().find(e => 
      e.type === "pollination" && new Date(e.occurred_at).getTime() <= harvestTime
    );
  } else if (input.plantId) {
    // If no harvest event was found, but we have a plant ID, try to find a pollination
    // where the plant is involved as donor or receiver. We use the latest one.
    pollinationEvent = [...sortedEvents].reverse().find(e => {
      if (e.type !== "pollination") return false;
      const donor = e.details?.donor_plant_id;
      const receivers = e.details?.receiver_plant_ids;
      return donor === input.plantId || (Array.isArray(receivers) && receivers.includes(input.plantId));
    });
  } else {
    // If we only have events (no target IDs), just take the latest pollination
    pollinationEvent = [...sortedEvents].reverse().find(e => e.type === "pollination");
  }

  if (pollinationEvent) {
    result.source_pollination_event_id = pollinationEvent.id;
    if (pollinationEvent.details?.donor_plant_id) {
      result.donor_plant_id = pollinationEvent.details.donor_plant_id;
    }
    if (Array.isArray(pollinationEvent.details?.receiver_plant_ids)) {
      result.receiver_plant_ids = pollinationEvent.details.receiver_plant_ids;
    }
  }

  // 3. Compute missing links and confidence
  if (!result.source_pollination_event_id) {
    result.missing_links.push("pollination_event");
  }
  if (!result.source_harvest_event_id) {
    result.missing_links.push("cross_harvest_event");
  }
  if (!result.donor_plant_id) {
    result.missing_links.push("donor_plant_id");
  }
  if (!result.receiver_plant_ids || result.receiver_plant_ids.length === 0) {
    result.missing_links.push("receiver_plant_ids");
  }
  
  if (input.plantId && !result.source_harvest_event_id && !pollinationEvent) {
    result.missing_links.push("offspring_link");
  }

  if (result.source_harvest_event_id && result.source_pollination_event_id && result.donor_plant_id && result.receiver_plant_ids && result.receiver_plant_ids.length > 0) {
    result.confidence = "high";
  } else if (result.source_pollination_event_id && result.donor_plant_id && result.receiver_plant_ids && result.receiver_plant_ids.length > 0) {
    result.confidence = "medium";
  } else {
    result.confidence = "low";
  }

  return result;
}
