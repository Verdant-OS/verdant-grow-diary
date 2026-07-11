/**
 * Next Run Playbook view model — presentation-only formatting for playbook
 * items. No new derivation logic; all grouping/sectioning stays in
 * nextRunPlaybookRules.ts.
 */
import type { PlaybookItem } from "@/lib/nextRunPlaybookRules";

export function playbookItemPlantTentLabel(item: PlaybookItem): string {
  const parts: string[] = [];
  if (item.plantId) parts.push("Plant-scoped");
  if (item.tentId) parts.push("Tent-scoped");
  return parts.length > 0 ? parts.join(" · ") : "Grow-scoped";
}

export function playbookItemRecordedLabel(item: PlaybookItem): string {
  if (!item.recordedAt) return "Recorded date unavailable";
  const ms = Date.parse(item.recordedAt);
  if (!Number.isFinite(ms)) return "Recorded date unavailable";
  return new Date(ms).toLocaleDateString(undefined, { dateStyle: "medium" });
}
