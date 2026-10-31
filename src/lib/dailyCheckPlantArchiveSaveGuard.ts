import type { DailyCheckPlantArchiveDecision } from "@/lib/dailyCheckPlantSelectionRules";

/**
 * The archive re-check a Quick Log writer runs before it saves a plant.
 *
 * Daily Check registers its guard while it is mounted, so every writer it
 * opens (the dialog, the activities section, the structured Water/Feed sheet
 * in AppShell) re-reads the plant it is about to save. Other surfaces
 * register nothing and their saves are unchanged.
 */
export type DailyCheckPlantArchiveSaveGuard = (
  plantId: string,
) => Promise<DailyCheckPlantArchiveDecision>;

let activeGuard: DailyCheckPlantArchiveSaveGuard | null = null;

export function registerDailyCheckPlantArchiveSaveGuard(
  guard: DailyCheckPlantArchiveSaveGuard,
): () => void {
  activeGuard = guard;
  return () => {
    if (activeGuard === guard) activeGuard = null;
  };
}

export function activeDailyCheckPlantArchiveSaveGuard(): DailyCheckPlantArchiveSaveGuard | null {
  return activeGuard;
}
