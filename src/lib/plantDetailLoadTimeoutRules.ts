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
  "loading" | "paused" | "loading-slow" | "error" | "not-found" | "ready";

export interface ClassifyPlantDetailLoadInput {
  isLoading: boolean;
  /** Includes an unresolved first read that is not currently fetching. */
  isPending?: boolean;
  isPaused?: boolean;
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
 *   3. unresolved first read paused for connection → "paused"
 *   4. still pending AND timeout elapsed → "loading-slow"
 *   5. still pending → "loading"
 *   6. settled with no plant → "not-found"
 */
export function classifyPlantDetailLoadState(
  input: ClassifyPlantDetailLoadInput,
): PlantDetailLoadState {
  if (input.isError) return "error";
  if (input.hasPlant) return "ready";
  if (input.isPending || input.isLoading) {
    if (input.isPaused) return "paused";
    return input.loadTimedOut ? "loading-slow" : "loading";
  }
  return "not-found";
}
