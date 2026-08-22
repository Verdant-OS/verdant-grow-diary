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

import { isActivePlant, type ArchivedPlantLike } from "@/lib/archivedPlantVisibilityRules";
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
 * Minimal plant row: id, its CURRENT tent assignment, and enough of the
 * archive/merge fields for `isActivePlant` to judge eligibility.
 */
export interface PlantTentRowLike extends ArchivedPlantLike {
  id?: string | null;
  tent_id?: string | null;
}

/**
 * Build the plant id → current tent id lookup this handoff needs.
 *
 * **Membership is eligibility, not existence.** A plant appears here only if
 * the Doctor would actually offer it, which is why the name says "carriable".
 * `AiDoctorStart` builds its choices with `buildAiDoctorEntryOptions`, which
 * skips `!isActivePlant`, so an archived or merged plant carried this far
 * matches no option and vanishes without a word — the precise silent-drop
 * failure this whole handoff exists to prevent. The same predicate is reused
 * rather than a second one written, so the two cannot drift apart.
 *
 * This matters because the directory feeding it deliberately includes
 * archived and merged rows: diary history keeps referencing them and still
 * needs their names. Filtering there would break the labels; filtering here
 * costs nothing, because an absent plant already falls into
 * `resolveCarriedPlantScope`'s fail-closed branch.
 *
 * Takes `plants` rows, never diary rows. See `resolveCarriedPlantScope`.
 */
export function buildCarriablePlantTentLookup(
  rows: readonly (PlantTentRowLike | null | undefined)[] | null | undefined,
): ReadonlyMap<string, string | null> {
  const lookup = new Map<string, string | null>();
  for (const row of rows ?? []) {
    const id = normalizePersistedPlantId(row?.id);
    if (!id) continue;
    if (!isActivePlant(row)) continue;
    lookup.set(id, normalizePersistedPlantId(row?.tent_id));
  }
  return lookup;
}

/**
 * Resolve the plant/tent pair to carry onward to Sensors → Doctor.
 *
 * Timeline's tent and plant filters are INDEPENDENT — `tentFilter` is
 * component state, `plantFilter` comes from the URL — so they can disagree,
 * and either can be set without the other. Downstream, `AiDoctorStart`
 * honours a carried plant only when it belongs to the carried tent, checked
 * against the grower's CURRENT plant rows. Anything this function emits that
 * fails that check disappears silently, which is the exact failure the whole
 * handoff exists to prevent. So the rule is: only ever emit a pair the
 * Doctor will actually accept, and otherwise emit no plant at all.
 *
 * The tent comes from `carriablePlantTentById` — built from `plants.tent_id`
 * by `buildCarriablePlantTentLookup` — and never from diary rows. A diary
 * entry records the tent an entry was made IN, which is history: move a plant
 * between tents and its old entries keep pointing at the old one. Deriving
 * from that would hand the Doctor a stale tent and lose the very selection
 * being carried.
 *
 * Pass the eligibility-filtered lookup, not a raw id→tent map. Absence from
 * it is what makes an archived or merged plant fail closed here.
 *
 * Precedence:
 *   - no plant selected → pass the tent through untouched
 *   - plant absent from the lookup → carry NO plant. One branch covers three
 *     distinct causes — still loading, read failed, or not carriable (not the
 *     grower's, archived, or merged) — because the safe answer is identical
 *     for all three and inventing a distinction would freeze shape without
 *     changing behaviour. Note the consequence: with no explicit tent, the
 *     tent goes too. The derived tent existed only to make the plant valid,
 *     and a tent the grower never chose is scope Verdant would be inventing.
 *   - explicit tent that MATCHES the plant's current tent → carry both
 *   - explicit tent that CONTRADICTS it → keep the tent, drop the plant.
 *     The tent filter is the grower's live view; silently retargeting it to
 *     follow a stale URL plant would move the page under them.
 *   - no explicit tent → carry the plant with its current tent
 */
export function resolveCarriedPlantScope(input: {
  plantId?: unknown;
  tentId?: unknown;
  carriablePlantTentById?: ReadonlyMap<string, string | null> | null;
}): { plantId: string | null; tentId: string | null } {
  const normalizedPlantId = normalizePersistedPlantId(input?.plantId);
  const explicitTentId = normalizePersistedPlantId(input?.tentId);

  if (!normalizedPlantId) return { plantId: null, tentId: explicitTentId };

  const currentTentId = input?.carriablePlantTentById?.get(normalizedPlantId) ?? null;

  // Not carriable — still loading, read failed, not the grower's, or
  // archived/merged. Carrying it would be a guess the Doctor then discards.
  if (!currentTentId) return { plantId: null, tentId: explicitTentId };

  if (explicitTentId) {
    return explicitTentId === currentTentId
      ? { plantId: normalizedPlantId, tentId: explicitTentId }
      : { plantId: null, tentId: explicitTentId };
  }

  return { plantId: normalizedPlantId, tentId: currentTentId };
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
