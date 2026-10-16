// Which fictional sample garden the prototype loads. Pure: no DOM, no fetch.

export const GARDEN_IDS = Object.freeze(["4x4", "5x5"]);
export const DEFAULT_GARDEN_ID = "4x4";

/** Resolve a `?garden=` value to a known garden id; anything else falls back to 4×4. */
export function resolveGardenId(value) {
  return GARDEN_IDS.includes(value) ? value : DEFAULT_GARDEN_ID;
}
