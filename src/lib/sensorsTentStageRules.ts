/**
 * sensorsTentStageRules — the stage the Sensors page judges one tent's
 * readings against (QA 2026-09-24, BUG-006 follow-up).
 *
 * The Sensors page used `tents.stage` alone. Alerts and the scoped Dashboard
 * resolve the stage from the grow row, the tent and — since BUG-006 — the
 * active plants in scope. So a Flower plant in a tent still marked Veg raised
 * an RH 60% alert on Alerts while Sensors called the same reading "In Veg RH
 * range".
 *
 * This resolves the selected tent exactly like the scoped Dashboard's
 * single-tent selection: the tent's grow row, that one tent, and the active
 * plants in that tent, through `resolveAlertContextStage` (consensus, harvest
 * cap, most-advanced-wins; see that module).
 *
 * Pure: no I/O, no React, no Supabase, no time.
 */
import { resolveAlertContextStage } from "@/lib/alertStageResolution";

export interface SensorsTentStagePlant {
  readonly tent_id?: string | null;
  readonly stage?: string | null;
}

export interface SensorsTentStageInput {
  /** The selected tent; null when none is selected. */
  readonly tentId: string | null | undefined;
  readonly tentStage: unknown;
  /** The selected tent's grow row stage; null when unknown. */
  readonly growStage: unknown;
  /**
   * Active plants (any tent). `null` while the plant read is pending or has
   * failed: plants then add no signal and the grow + tent decide.
   */
  readonly plants: ReadonlyArray<SensorsTentStagePlant> | null | undefined;
}

/** RAW stored stage value for the selected tent, or null when none is known. */
export function resolveSensorsTentStage(input: SensorsTentStageInput): string | null {
  if (!input.tentId) return null;
  return resolveAlertContextStage({
    growStage: input.growStage,
    tentStages: [input.tentStage],
    plantStages: (input.plants ?? [])
      .filter((plant) => plant.tent_id === input.tentId)
      .map((plant) => plant.stage ?? null),
  }).stage;
}
