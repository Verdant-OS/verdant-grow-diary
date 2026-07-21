/**
 * blueprintFeedingInput — pure selection of the latest logged nutrient-solution
 * input EC and pH for the Pro Blueprint overlay.
 *
 * The SOP EC/pH targets are for the INPUT feed (what the grower mixed), so this
 * reads `metrics.inputEcMsCm` / `metrics.inputPh` from the root-zone
 * observations — NOT runoff. `useRootZoneObservations` returns them newest
 * first; each metric is taken from the newest observation that actually has it
 * (EC and pH may come from different observations).
 *
 * Pure. No I/O, no React. See docs/spec-pro-blueprint-overlay.md.
 */

import type { RootZoneObservationV1 } from "@/lib/rootZoneObservationRules";

export interface BlueprintFeedingInput {
  /** Latest logged input EC, mS/cm. */
  ec: number | null;
  /** Latest logged input pH. */
  ph: number | null;
}

export function selectLatestInputEcPh(
  observations: readonly RootZoneObservationV1[],
): BlueprintFeedingInput {
  let ec: number | null = null;
  let ph: number | null = null;
  for (const observation of observations) {
    const metrics = observation.metrics;
    if (ec === null && metrics.inputEcMsCm !== null) ec = metrics.inputEcMsCm;
    if (ph === null && metrics.inputPh !== null) ph = metrics.inputPh;
    if (ec !== null && ph !== null) break;
  }
  return { ec, ph };
}
