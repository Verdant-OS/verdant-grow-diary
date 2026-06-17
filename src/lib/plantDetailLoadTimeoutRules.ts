/**
 * Plant Detail bounded-loading rules.
 *
 * Pure helpers. No side effects, no network, no privileged access.
 *
 * The plant detail page depends on a single async query (`useGrowPlant`).
 * If that query never settles (slow network, hung Supabase request, etc.)
 * the page would otherwise sit on a permanent skeleton — breaking the
 * One-Tent Loop (Tent → Plant → Quick Log → AI Doctor).
 *
 * These helpers define the bounded-loading contract:
 *   - a deterministic timeout threshold,
 *   - a deterministic state classifier the presenter can render against,
 *
 * keeping business logic outside JSX (per V0 layering rules).
 */

/**
 * Time (ms) after which a still-pending plant detail load is treated as a
 * bounded failure instead of an infinite loading skeleton.
 *
 * Chosen to be comfortably longer than a healthy round-trip but short
 * enough that growers are never stranded on a blank screen.
 */
export const PLANT_DETAIL_LOAD_TIMEOUT_MS = 8000;

export type PlantDetailLoadState =
  | "loading"
  | "loading-slow"
  | "error"
  | "not-found"
  | "ready";

export interface ClassifyPlantDetailLoadInput {
  isLoading: boolean;
  isError: boolean;
  hasPlant: boolean;
  /** True once the bounded-loading timer has elapsed at least once. */
  loadTimedOut: boolean;
}

/**
 * Deterministic, null-safe classifier for the plant detail load state.
 *
 * Precedence (most specific first):
 *   1. explicit error → "error"
 *   2. plant resolved → "ready"
 *   3. still loading AND timeout elapsed → "loading-slow"
 *   4. still loading → "loading"
 *   5. settled with no plant → "not-found"
 */
export function classifyPlantDetailLoadState(
  input: ClassifyPlantDetailLoadInput,
): PlantDetailLoadState {
  if (input.isError) return "error";
  if (input.hasPlant) return "ready";
  if (input.isLoading) {
    return input.loadTimedOut ? "loading-slow" : "loading";
  }
  return "not-found";
}
