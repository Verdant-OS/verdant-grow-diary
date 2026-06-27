export type BreedingEventType =
  | "reversal_application"
  | "isolation_start"
  | "pollination"
  | "pollen_shed_observed"
  | "stigmas_receptive"
  | "cross_harvest";

export interface BreedingEvent {
  id: string;
  type: string;
  occurred_at: string;
  details?: unknown;
  plant_id?: string | null;
  tent_id?: string | null;
}
