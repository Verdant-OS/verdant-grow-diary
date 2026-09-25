/**
 * tentEnvironmentStageRules — the stage a tent's environment readings are
 * judged against on the Sensors page and Tent Detail (QA 2026-09-24, BUG-006
 * follow-up).
 *
 * Both pages used `tents.stage` alone. Alerts and the scoped Dashboard resolve
 * the stage from the grow row, the tent and — since BUG-006 — the active
 * plants in scope. So a Flower plant in a tent still marked Veg raised an RH
 * 60% alert on Alerts while Sensors and Tent Detail judged the same reading
 * against Veg bands.
 *
 * This resolves one tent exactly like the scoped Dashboard's single-tent
 * selection: the tent's grow row, that one tent, and the active plants in
 * that tent, through `resolveAlertContextStage` (consensus, harvest cap,
 * most-advanced-wins; see that module).
 *
 * Pure: no I/O, no React, no Supabase, no time.
 */
import { resolveAlertContextStage } from "@/lib/alertStageResolution";

/** A plant row (`tent_id`) or a mapped plant (`tentId`). */
export interface TentEnvironmentStagePlant {
  readonly tent_id?: string | null;
  readonly tentId?: string | null;
  readonly stage?: string | null;
}

export interface TentEnvironmentStageInput {
  /** The tent being judged; null when none is selected. */
  readonly tentId: string | null | undefined;
  readonly tentStage: unknown;
  /** The tent's grow row stage; null when unknown. */
  readonly growStage: unknown;
  /**
   * Active plants (any tent; only this tent's count). `null` while the plant
   * read is pending or has failed: plants then add no signal and the grow +
   * tent decide.
   */
  readonly plants: ReadonlyArray<TentEnvironmentStagePlant> | null | undefined;
}

/** RAW stored stage value for the tent, or null when none is known. */
export function resolveTentEnvironmentStage(input: TentEnvironmentStageInput): string | null {
  if (!input.tentId) return null;
  return resolveAlertContextStage({
    growStage: input.growStage,
    tentStages: [input.tentStage],
    plantStages: (input.plants ?? [])
      .filter((plant) => (plant.tent_id ?? plant.tentId) === input.tentId)
      .map((plant) => plant.stage ?? null),
  }).stage;
}
