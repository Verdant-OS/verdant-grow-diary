/**
 * DiaryEntryBadges — presenter-only tag/warning chips for a single
 * normalized diary timeline item.
 *
 * No queries, no writes, no business logic. All transformation lives in
 * src/lib/growDiaryTimelineRules.ts / src/lib/diaryEntryRules.ts.
 */
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GrowDiaryTimelineItem } from "@/lib/growDiaryTimelineRules";

const TAG_LABELS: Record<string, string> = {
  watering: "Watering",
  feeding: "Feeding",
  training: "Training",
  observation: "Observation",
  photo: "Photo",
  "sensor-snapshot": "Sensor",
  nutrient: "Nutrient",
  symptoms: "Symptoms",
};

const PRIMARY_TAGS = [
  "watering",
  "feeding",
  "training",
  "observation",
  "photo",
  "sensor-snapshot",
  "nutrient",
  "symptoms",
];

export interface DiaryEntryBadgesProps {
  item: GrowDiaryTimelineItem;
  className?: string;
}

export default function DiaryEntryBadges({ item, className }: DiaryEntryBadgesProps) {
  const tagsToShow = PRIMARY_TAGS.filter((t) => item.tags.includes(t));
  const hasWarnings = item.warnings.length > 0;

  if (tagsToShow.length === 0 && !hasWarnings) return null;

  return (
    <div
      data-testid="diary-entry-badges"
      data-entry-id={item.id}
      data-useful-for-ai={String(item.isUsefulForAiContext)}
      className={cn("mt-2 flex flex-wrap gap-1.5", className)}
    >
      {tagsToShow.map((t) => (
        <span
          key={t}
          data-testid={`diary-entry-tag-${t}`}
          className="text-[11px] px-2 py-0.5 rounded-full bg-secondary/60 border border-border/40"
        >
          {TAG_LABELS[t] ?? t}
        </span>
      ))}
      {hasWarnings && (
        <span
          data-testid="diary-entry-warning"
          title={item.warnings.join(", ")}
          className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300"
        >
          <AlertTriangle className="h-3 w-3" />
          Limited data
        </span>
      )}
    </div>
  );
}
