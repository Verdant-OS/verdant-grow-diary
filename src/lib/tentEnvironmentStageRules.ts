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
   * False while the tent's grow row is not known yet (the grows list is
   * loading or failed): stage grading is then withheld, never done from the
   * tent alone (Codex review on #1683). Omitted means resolved.
   */
  readonly growStageResolved?: boolean;
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
  if (input.growStageResolved === false) return null;
  return resolveAlertContextStage({
    growStage: input.growStage,
    tentStages: [input.tentStage],
    plantStages: (input.plants ?? [])
      .filter((plant) => (plant.tent_id ?? plant.tentId) === input.tentId)
      .map((plant) => plant.stage ?? null),
  }).stage;
}

/**
 * The grow stage input for one tent, from the grows list (`useGrows()`).
 * That list is empty while loading and after a failed read, so a missing row
 * is "not known yet", not "no stage": the stage is unresolved until the row is
 * listed, or the list has loaded without error (an archived grow is not
 * listed; the tent and plants then decide). A tent with no grow has nothing
 * to wait for, and a listed row is used even while a refresh is in flight.
 */
export function resolveTentGrowStage(input: {
  readonly growId: string | null | undefined;
  readonly grows:
    ReadonlyArray<{ readonly id: string; readonly stage?: unknown }> | null | undefined;
  readonly loading: boolean | undefined;
  readonly error: unknown;
}): { growStage: unknown; growStageResolved: boolean } {
  if (!input.growId) return { growStage: null, growStageResolved: true };
  const row = (input.grows ?? []).find((grow) => grow.id === input.growId);
  if (row) return { growStage: row.stage ?? null, growStageResolved: true };
  const listSettled = !input.loading && !input.error;
  return { growStage: null, growStageResolved: listSettled };
}
