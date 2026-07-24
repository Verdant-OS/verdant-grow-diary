/**
 * sensorRouteTentIntentRules — typed, fail-closed /sensors tent handoff.
 *
 * A route can carry a requested persisted tent id, but it is only an intent:
 * the Sensors page revalidates it against the authenticated tent rows before
 * selecting it. Ordinary intents preserve the existing local fallback.
 * Exact-match intents fail closed when their requested tent is invalid,
 * missing, deleted, or unauthorised.
 *
 * Pure module. No React, I/O, or Supabase imports.
 */

import {
  normalizePersistedGrowTentId,
  resolveGrowTentSelection,
  type GrowTentSelectionCandidate,
} from "@/lib/growTentSelectionRules";

export const SENSORS_TENT_INTENT_QUERY_PARAM = "tentId";
export const SENSORS_TENT_INTENT_MODE_QUERY_PARAM = "tentIntent";
export const SENSORS_TENT_INTENT_MODE_REQUIRED = "required";
export const SENSORS_TENT_ROUTE = "/sensors";

/** Minimal typed boundary so URLSearchParams and router search params both fit. */
export interface SensorsTentIntentSearch {
  get(name: string): string | null;
}

/** A normalized, untrusted request to focus the Sensors page on one tent. */
export interface SensorsTentRouteIntent {
  tentId: string | null;
  /** Fail closed instead of selecting another tent when this target is unavailable. */
  requireExactMatch?: boolean;
}

export interface BuildSensorsTentRouteOptions {
  requireExactMatch?: boolean;
}

export interface ResolveSensorsTentRouteSelectionInput {
  /** Parsed URL intent. It remains untrusted until checked against `tents`. */
  intent?: SensorsTentRouteIntent | null;
  /** Current local selection, usually a grower chip click. */
  currentTentId?: unknown;
  /** Authenticated tent rows loaded by the existing read path. */
  tents?: readonly (GrowTentSelectionCandidate | null | undefined)[] | null;
}

export interface SensorsRequiredTentGateInput extends ResolveSensorsTentRouteSelectionInput {
  intentKey: string;
  appliedIntentKey?: string | null;
  explicitTentId?: unknown;
  tentsLoaded: boolean;
}

export interface SensorsRequiredTentGate {
  requiredSelectionId: string | null;
  reselectionRequired: boolean;
  resolutionPending: boolean;
}

export function buildSensorsTentRouteIntentKey(
  intent: SensorsTentRouteIntent | null | undefined,
  navigationKey?: string | null,
): string {
  const semanticIntentKey = `${intent?.tentId ?? ""}\n${
    intent?.requireExactMatch === true ? "required" : "fallback"
  }`;
  return navigationKey ? `${navigationKey}\n${semanticIntentKey}` : semanticIntentKey;
}

/** Read a UUID-only tent intent from a /sensors URL. */
export function readSensorsTentRouteIntent(
  search: SensorsTentIntentSearch | null | undefined,
): SensorsTentRouteIntent {
  return {
    tentId: normalizePersistedGrowTentId(search?.get(SENSORS_TENT_INTENT_QUERY_PARAM)),
    requireExactMatch:
      search?.get(SENSORS_TENT_INTENT_MODE_QUERY_PARAM) === SENSORS_TENT_INTENT_MODE_REQUIRED,
  };
}

/**
 * Build a tent-scoped Sensors URL only for a persisted UUID. This keeps
 * malformed filter values out of shareable links and browser query paths.
 */
export function buildSensorsTentRouteHref(
  tentId: unknown,
  options: BuildSensorsTentRouteOptions = {},
): string {
  const normalizedTentId = normalizePersistedGrowTentId(tentId);
  if (!normalizedTentId) return SENSORS_TENT_ROUTE;

  const search = new URLSearchParams();
  search.set(SENSORS_TENT_INTENT_QUERY_PARAM, normalizedTentId);
  if (options.requireExactMatch === true) {
    search.set(SENSORS_TENT_INTENT_MODE_QUERY_PARAM, SENSORS_TENT_INTENT_MODE_REQUIRED);
  }
  return `${SENSORS_TENT_ROUTE}?${search.toString()}`;
}

/**
 * Resolve the requested route intent against authenticated rows.
 *
 * A valid intent wins only when it exists in the loaded tent list. An exact
 * intent returns no selection when unavailable. Ordinary intents preserve the
 * current valid local choice, then use the existing first-available fallback.
 */
export function resolveSensorsTentRouteSelection(
  input: ResolveSensorsTentRouteSelectionInput,
): string | null {
  const tents = input.tents ?? [];
  const requestedTentId = normalizePersistedGrowTentId(input.intent?.tentId);
  const requestedTentIsAvailable =
    requestedTentId !== null &&
    tents.some((tent) => normalizePersistedGrowTentId(tent?.id) === requestedTentId);

  if (input.intent?.requireExactMatch === true) {
    return requestedTentIsAvailable ? requestedTentId : null;
  }

  return resolveGrowTentSelection({
    currentTentId: requestedTentIsAvailable ? requestedTentId : input.currentTentId,
    tents,
  });
}

/**
 * Build the synchronous UI gate for an exact-match handoff.
 *
 * This prevents the previous tent's writer from flashing during a route
 * transition and prevents a tent-list refresh from replacing a disappeared
 * required target. `explicitTentId` is only supplied after a grower click.
 */
export function buildSensorsRequiredTentGate(
  input: SensorsRequiredTentGateInput,
): SensorsRequiredTentGate {
  if (input.intent?.requireExactMatch !== true || !input.tentsLoaded) {
    return {
      requiredSelectionId: null,
      reselectionRequired: false,
      resolutionPending: false,
    };
  }

  const desiredTentId =
    input.explicitTentId === null || input.explicitTentId === undefined
      ? input.intent.tentId
      : input.explicitTentId;
  const requiredSelectionId = resolveSensorsTentRouteSelection({
    intent: { tentId: normalizePersistedGrowTentId(desiredTentId), requireExactMatch: true },
    currentTentId: null,
    tents: input.tents,
  });

  if (!requiredSelectionId) {
    return {
      requiredSelectionId: null,
      reselectionRequired: true,
      resolutionPending: false,
    };
  }

  return {
    requiredSelectionId,
    reselectionRequired: false,
    resolutionPending:
      input.appliedIntentKey !== input.intentKey ||
      normalizePersistedGrowTentId(input.currentTentId) !== requiredSelectionId,
  };
}
