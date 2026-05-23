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

export interface PlantQuickLogPrefillInput {
  plantId: string | null | undefined;
  plantName?: string | null;
  growId: string | null | undefined;
  tentId: string | null | undefined;
  tentName?: string | null;
}

export interface PlantQuickLogPrefill {
  plantId: string;
  plantName: string | null;
  growId: string;
  tentId: string;
  tentName: string | null;
  /** QuickLog event type to preselect. */
  eventType: "observation";
  /** Suggest enabling the sensor snapshot toggle since a tent is assigned. */
  suggestSnapshot: true;
}

export const PLANT_QUICKLOG_PREFILL_EVENT = "verdant:open-quicklog" as const;

export function buildPlantQuickLogPrefill(
  input: PlantQuickLogPrefillInput | null | undefined,
): PlantQuickLogPrefill | null {
  if (!input) return null;
  const { plantId, growId, tentId } = input;
  if (!plantId || !growId || !tentId) return null;
  return {
    plantId,
    plantName: input.plantName ?? null,
    growId,
    tentId,
    tentName: input.tentName ?? null,
    eventType: "observation",
    suggestSnapshot: true,
  };
}
