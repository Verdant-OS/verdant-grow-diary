import type { BreedingEvent, BreedingEventType } from "./breedingTypes";

export interface BreedingSuggestion {
  title: string;
  next_steps: string;
  reason: string;
  due_offset_days: number;
  risk_level: string;
}

const FOLLOW_UP_MAP: Record<BreedingEventType, BreedingSuggestion[]> = {
  reversal_application: [
    {
      title: "Check for pollen sac development",
      next_steps: "Inspect treated plant for pollen sacs (stamen formation). Photograph any changes.",
      reason: "STS reversal application requires follow-up to confirm male flower development.",
      due_offset_days: 5,
      risk_level: "medium",
    },
  ],
  isolation_start: [
    {
      title: "Verify isolation integrity",
      next_steps: "Confirm all isolation barriers are intact. Check for pollen drift risk.",
      reason: "Isolation must be verified after start to prevent unintended cross-pollination.",
      due_offset_days: 2,
      risk_level: "low",
    },
  ],
  pollination: [
    {
      title: "Check for seed development",
      next_steps: "Inspect pollinated pistils for swelling / calyx development. Note any unfertilised sites.",
      reason: "Seed set must be confirmed 14 days after pollination to assess cross success.",
      due_offset_days: 14,
      risk_level: "low",
    },
  ],
  pollen_shed_observed: [
    {
      title: "Collect and store pollen",
      next_steps: "Harvest open anthers onto glassine paper and seal in a dry container. Label with date and strain.",
      reason: "Viable pollen window is short — collection within 24 hours maximises germination rate.",
      due_offset_days: 1,
      risk_level: "medium",
    },
  ],
  stigmas_receptive: [
    {
      title: "Apply stored pollen to receptive stigmas",
      next_steps: "Use a fine brush to apply pollen to white pistils. Log application sites.",
      reason: "Receptive stigmas have a narrow pollination window. Apply within 24 hours.",
      due_offset_days: 1,
      risk_level: "medium",
    },
  ],
  cross_harvest: [
    {
      title: "Dry and cure harvested seeds",
      next_steps: "Spread seeds on a paper towel in a cool, dark, low-humidity environment for 7–14 days.",
      reason: "Proper drying is required before storage to prevent mould and preserve germination viability.",
      due_offset_days: 7,
      risk_level: "low",
    },
  ],
};

export function suggestBreedingFollowUpActions(event: BreedingEvent): BreedingSuggestion[] {
  return FOLLOW_UP_MAP[event.type as BreedingEventType] ?? [];
}
