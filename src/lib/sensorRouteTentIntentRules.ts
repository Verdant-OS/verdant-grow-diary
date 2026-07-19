/**
 * sensorRouteTentIntentRules — typed, fail-closed /sensors tent handoff.
 *
 * A route can carry a requested persisted tent id, but it is only an intent:
 * the Sensors page revalidates it against the authenticated tent rows before
 * selecting it. Invalid, missing, deleted, or unauthorised ids fall back to
 * the existing local selection/default behavior instead of becoming a query.
 *
 * Pure module. No React, I/O, or Supabase imports.
 */

import {
  normalizePersistedGrowTentId,
  resolveGrowTentSelection,
  type GrowTentSelectionCandidate,
} from "@/lib/growTentSelectionRules";

export const SENSORS_TENT_INTENT_QUERY_PARAM = "tentId";
export const SENSORS_TENT_ROUTE = "/sensors";

/** Minimal typed boundary so URLSearchParams and router search params both fit. */
export interface SensorsTentIntentSearch {
  get(name: string): string | null;
}

/** A normalized, untrusted request to focus the Sensors page on one tent. */
export interface SensorsTentRouteIntent {
  tentId: string | null;
}

export interface ResolveSensorsTentRouteSelectionInput {
  /** Parsed URL intent. It remains untrusted until checked against `tents`. */
  intent?: SensorsTentRouteIntent | null;
  /** Current local selection, usually a grower chip click. */
  currentTentId?: unknown;
  /** Authenticated tent rows loaded by the existing read path. */
  tents?: readonly (GrowTentSelectionCandidate | null | undefined)[] | null;
}

/** Read a UUID-only tent intent from a /sensors URL. */
export function readSensorsTentRouteIntent(
  search: SensorsTentIntentSearch | null | undefined,
): SensorsTentRouteIntent {
  return {
    tentId: normalizePersistedGrowTentId(search?.get(SENSORS_TENT_INTENT_QUERY_PARAM)),
  };
}

/**
 * Build a tent-scoped Sensors URL only for a persisted UUID. This keeps
 * malformed filter values out of shareable links and browser query paths.
 */
export function buildSensorsTentRouteHref(tentId: unknown): string {
  const normalizedTentId = normalizePersistedGrowTentId(tentId);
  if (!normalizedTentId) return SENSORS_TENT_ROUTE;

  const search = new URLSearchParams();
  search.set(SENSORS_TENT_INTENT_QUERY_PARAM, normalizedTentId);
  return `${SENSORS_TENT_ROUTE}?${search.toString()}`;
}

/**
 * Resolve the requested route intent against authenticated rows.
 *
 * A valid intent wins only when it exists in the loaded tent list. Otherwise
 * preserve the current valid local choice, with the same first-available
 * fallback used by existing Sensors behavior.
 */
export function resolveSensorsTentRouteSelection(
  input: ResolveSensorsTentRouteSelectionInput,
): string | null {
  const tents = input.tents ?? [];
  const requestedTentId = normalizePersistedGrowTentId(input.intent?.tentId);
  const requestedTentIsAvailable =
    requestedTentId !== null &&
    tents.some((tent) => normalizePersistedGrowTentId(tent?.id) === requestedTentId);

  return resolveGrowTentSelection({
    currentTentId: requestedTentIsAvailable ? requestedTentId : input.currentTentId,
    tents,
  });
}
