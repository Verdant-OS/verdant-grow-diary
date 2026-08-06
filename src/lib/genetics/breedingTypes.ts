export type BreedingEventType =
  | "reversal_application"
  | "isolation_start"
  | "pollination"
  | "pollen_shed_observed"
  | "stigmas_receptive"
  | "cross_harvest";

export interface BreedingEvent {
  id: string;
  type: BreedingEventType | string;
  occurred_at: string;
  details?: {
    intensity?: string;
    method?: string;
    [key: string]: any;
  } | null;
  plant_id?: string;
  tent_id?: string;
}
