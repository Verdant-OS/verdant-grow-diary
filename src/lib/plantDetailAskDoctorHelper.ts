/**
 * plantDetailAskDoctorHelper — pure view-model for the Ask Doctor helper
 * copy on Plant Detail.
 *
 * Deterministic. No React, no I/O, no fetch, no AI calls, no writes.
 * Consumes already-loaded Plant Detail signals and selects cautious
 * helper copy that never promises diagnosis certainty or implies
 * automation / device control.
 */

export type AskDoctorHelperLevel = "has_context" | "partial" | "none";

export interface AskDoctorHelperResult {
  level: AskDoctorHelperLevel;
  /** Short helper sentence shown near the Ask Doctor action. */
  copy: string;
  /** Number of present context signals (0–5). */
  presentCount: number;
  /** Total number of evaluated signals (always 5). */
  totalSignals: number;
}

export interface PlantDetailAskDoctorHelperInput {
  /** Current plant stage value (null/undefined/empty/unknown counts as missing). */
  stage?: string | null;
  /** True when at least one recent timeline/activity entry exists. */
  hasTimelineEntries: boolean;
  /** True when a recent photo exists for this plant. */
  hasRecentPhoto: boolean;
  /** True when at least one recent activity entry includes a sensor snapshot. */
  hasSensorSnapshot: boolean;
  /** True when at least one recent activity entry is watering or feeding. */
  hasRecentWateringOrFeed: boolean;
}

const TOTAL_SIGNALS = 5;

function isStageKnown(stage: string | null | undefined): boolean {
  if (stage == null) return false;
  const s = stage.toString().trim().toLowerCase();
  return s !== "" && s !== "unknown";
}

function countPresent(input: PlantDetailAskDoctorHelperInput): number {
  let count = 0;
  if (isStageKnown(input.stage)) count++;
  if (input.hasTimelineEntries) count++;
  if (input.hasRecentPhoto) count++;
  if (input.hasSensorSnapshot) count++;
  if (input.hasRecentWateringOrFeed) count++;
  return count;
}

function levelFromCount(count: number): AskDoctorHelperLevel {
  if (count >= 2) return "has_context";
  if (count >= 1) return "partial";
  return "none";
}

function copyForLevel(level: AskDoctorHelperLevel): string {
  switch (level) {
    case "has_context":
      return "AI Doctor has recent plant context for this check-in.";
    case "partial":
      return "AI Doctor works better with recent notes, photos, or a manual sensor snapshot.";
    case "none":
      return "Add a quick note, photo, or manual sensor snapshot first for a stronger check-in.";
  }
}

/**
 * Build the Ask Doctor helper result for Plant Detail.
 *
 * Returns a cautious helper level and copy string based on the number
 * of present memory signals. Never promises diagnosis certainty.
 */
export function buildPlantDetailAskDoctorHelper(
  input: PlantDetailAskDoctorHelperInput,
): AskDoctorHelperResult {
  const presentCount = countPresent(input);
  const level = levelFromCount(presentCount);
  return {
    level,
    copy: copyForLevel(level),
    presentCount,
    totalSignals: TOTAL_SIGNALS,
  };
}
