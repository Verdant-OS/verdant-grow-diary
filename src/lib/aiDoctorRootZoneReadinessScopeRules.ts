import { isUuid } from "@/lib/isUuid";
import type { RootZoneObservationV1 } from "@/lib/rootZoneObservationRules";

export type AiDoctorRootZoneReadinessScope =
  | { kind: "plant"; plantId: string }
  | { kind: "plant_context"; plantId: string; tentId: string; growId: string };

const NO_SETTLED_ROOT_ZONE_OBSERVATIONS: readonly RootZoneObservationV1[] = Object.freeze([]);

export interface AiDoctorRootZoneScopeInput {
  plantId: string | null | undefined;
  tentId: string | null | undefined;
  growId: string | null | undefined;
}

/**
 * Keep every Plant Detail AI Doctor presenter on the same root-zone query key.
 * Prefer the complete One-Tent context so tent-level water/feed actions can be
 * considered for the plant, then fall back to plant-only history.
 */
export function buildAiDoctorRootZoneReadinessScope({
  plantId,
  tentId,
  growId,
}: AiDoctorRootZoneScopeInput): AiDoctorRootZoneReadinessScope | null {
  if (!isUuid(plantId)) return null;
  if (isUuid(tentId) && isUuid(growId)) {
    return { kind: "plant_context", plantId, tentId, growId };
  }
  return { kind: "plant", plantId };
}

export interface AiDoctorRootZoneReadState {
  observations: readonly RootZoneObservationV1[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
}

/**
 * Cached rows are not authoritative while a read is pending or after it has
 * failed. Returning no rows makes readiness fail closed without relabeling
 * root-zone measurements as sensor evidence.
 */
export function selectSettledAiDoctorRootZoneObservations(
  state: AiDoctorRootZoneReadState,
): readonly RootZoneObservationV1[] {
  if (state.isLoading || state.isFetching || state.isError) {
    return NO_SETTLED_ROOT_ZONE_OBSERVATIONS;
  }
  return state.observations;
}
