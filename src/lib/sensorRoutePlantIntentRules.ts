/**
 * sensorRoutePlantIntentRules — typed, fail-closed /sensors plant handoff.
 *
 * Timeline knows which plant the grower was looking at. Sensors dropped it
 * (`Sensors.tsx` passed only `{ growId, tentId }` to the loop card), so a
 * plant could not survive Timeline → Sensors → Doctor. That gap is the
 * deferred follow-up named in D-B6 of the Tranche B+ design.
 *
 * The plant travels as a UUID-only **intent**, and Sensors deliberately does
 * not resolve it. Two measured reasons, not a shortcut:
 *
 *   1. Sensors holds no plant rows. It loads tents (`useGrowTents`) and
 *      readings, nothing else, so it cannot check ownership. Validating there
 *      would mean adding a query to a page that has none.
 *   2. It could not name the plant honestly even if it wanted to. Printing a
 *      raw UUID is the exact defect A3 exists to remove.
 *
 * So Sensors carries the token and shows nothing about it, and the intent is
 * checked where the authenticated rows already live — `AiDoctorStart`, whose
 * `resolveDoctorStartScope` is already fail-closed. That keeps the repo's
 * "untrusted until checked against the grower's own rows" contract intact;
 * it moves *where* the check happens, never *whether* it happens.
 *
 * A carried plant is a grower's explicit prior selection, not an inference.
 * It may therefore be ordered first and labelled — but it must never be
 * auto-selected. "Verdant will not guess which plant you mean" is doctrine,
 * and D5 already set the precedent that a remembered target is offered and
 * never applied.
 *
 * Pure module. No React, no I/O, no Supabase, no clock, no randomness.
 */

import { isUuid } from "@/lib/isUuid";

/** Query parameter carrying the requested plant on `/sensors` and `/doctor`. */
export const SENSORS_PLANT_INTENT_QUERY_PARAM = "plantId";

/** Minimal typed boundary so URLSearchParams and router search params both fit. */
export interface SensorsPlantIntentSearch {
  get(name: string): string | null;
}

/**
 * Normalize any candidate into a persisted plant id, or null.
 *
 * Mirrors `normalizePersistedGrowTentId`'s shape deliberately: trim, lower,
 * and accept only a real UUID. A non-UUID never becomes an intent, so a
 * malformed or hand-edited query value degrades to "no plant carried"
 * rather than travelling onward as a filter nobody validated.
 */
export function normalizePersistedPlantId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return isUuid(normalized) ? normalized : null;
}

/** Read a UUID-only plant intent from a `/sensors` (or `/doctor`) URL. */
export function readSensorsPlantRouteIntent(
  search: SensorsPlantIntentSearch | null | undefined,
): string | null {
  return normalizePersistedPlantId(search?.get(SENSORS_PLANT_INTENT_QUERY_PARAM) ?? null);
}

/**
 * Append a plant intent to an already-built internal href.
 *
 * Composes with `buildSensorsTentRouteHref` rather than replacing it, so the
 * shipped tent-intent module and its six consumers are left untouched.
 *
 * An invalid, absent, or non-UUID plant returns the href byte-identical —
 * the caller cannot accidentally emit `?plantId=` with nothing behind it.
 * An href that already carries a plant intent has it replaced, so repeated
 * application is idempotent rather than accumulating duplicate params.
 */
export function withSensorsPlantIntent(href: string, plantId: unknown): string {
  const normalizedPlantId = normalizePersistedPlantId(plantId);
  if (typeof href !== "string" || href.length === 0) return href;
  if (!normalizedPlantId) return href;

  const hashIndex = href.indexOf("#");
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;

  const queryIndex = withoutHash.indexOf("?");
  const path = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const search = new URLSearchParams(queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : "");

  search.set(SENSORS_PLANT_INTENT_QUERY_PARAM, normalizedPlantId);
  return `${path}?${search.toString()}${hash}`;
}
