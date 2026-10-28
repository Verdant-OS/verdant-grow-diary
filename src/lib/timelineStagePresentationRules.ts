/**
 * Grower-facing stage copy for Timeline groups and cards.
 * A missing stage is not the machine token "unknown" and not an empty dash.
 */
import { STAGES } from "@/lib/grow";

export const TIMELINE_STAGE_NOT_RECORDED_LABEL = "Stage not recorded";

export function timelineStagePresentationLabel(stage: string | null | undefined): string {
  const value = typeof stage === "string" ? stage.trim() : "";
  const known = STAGES.find((item) => item.value === value)?.label;
  if (known) return known;
  if (value === "" || value.toLowerCase() === "unknown") return TIMELINE_STAGE_NOT_RECORDED_LABEL;
  return value;
}
