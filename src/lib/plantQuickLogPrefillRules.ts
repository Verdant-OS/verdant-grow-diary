/**
 * plantQuickLogPrefillRules — pure helper that builds the prefill payload
 * dispatched from Plant Detail into the existing QuickLog flow.
 *
 * Deterministic, no I/O, no React. Returns null when there isn't enough
 * context to safely prefill (no plant, or no assigned tent).
 *
 * Read-only. Does NOT create diary entries. Does NOT copy sensor values
 * into the payload — only references the plant/tent context. The grower
 * still chooses whether to attach the latest snapshot and submits the log
 * manually.
 */

export type PlantQuickLogPrefillEventType = "observation" | "environment";

export interface PlantQuickLogPrefillInput<
  TEventType extends PlantQuickLogPrefillEventType = "observation",
> {
  plantId: string | null | undefined;
  plantName?: string | null;
  growId: string | null | undefined;
  tentId: string | null | undefined;
  tentName?: string | null;
  /** Activity to preselect. Defaults to a neutral observation. */
  eventType?: TEventType;
}

export interface PlantQuickLogPrefill<
  TEventType extends PlantQuickLogPrefillEventType = "observation",
> {
  plantId: string;
  plantName: string | null;
  growId: string;
  tentId: string;
  tentName: string | null;
  /** QuickLog event type to preselect. */
  eventType: TEventType;
  /** Suggest enabling the sensor snapshot toggle since a tent is assigned. */
  suggestSnapshot: true;
  /** Optional draft note text to prefill into the QuickLog note field. */
  note?: string;
}

export const PLANT_QUICKLOG_PREFILL_EVENT = "verdant:open-quicklog" as const;

export function buildPlantQuickLogPrefill<
  TEventType extends PlantQuickLogPrefillEventType = "observation",
>(
  input: PlantQuickLogPrefillInput<TEventType> | null | undefined,
): PlantQuickLogPrefill<TEventType> | null {
  if (!input) return null;
  const { plantId, growId, tentId } = input;
  if (!plantId || !growId || !tentId) return null;
  return {
    plantId,
    plantName: input.plantName ?? null,
    growId,
    tentId,
    tentName: input.tentName ?? null,
    eventType: (input.eventType ?? "observation") as TEventType,
    suggestSnapshot: true,
  };
}
