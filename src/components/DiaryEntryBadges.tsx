/**
 * DiaryEntryBadges — presenter-only tag/warning chips for a single
 * normalized diary timeline item.
 *
 * No queries, no writes, no business logic. All transformation lives in
 * src/lib/growDiaryTimelineRules.ts / src/lib/diaryEntryRules.ts /
 * src/lib/actionFollowupVisibilityRules.ts.
 */
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GrowDiaryTimelineItem, SensorSnapshotBadge } from "@/lib/growDiaryTimelineRules";
import { sensorSnapshotBadge } from "@/lib/growDiaryTimelineRules";
import {
  FOLLOWUP_SAFE_CAPTION,
  normalizeFollowupKindLabel,
} from "@/lib/actionFollowupVisibilityRules";

const TAG_LABELS: Record<string, string> = {
  watering: "Watering",
  feeding: "Feeding",
  training: "Training",
  observation: "Observation",
  photo: "Photo",
  "sensor-snapshot": "Manual snapshot",
  nutrient: "Nutrient",
  symptoms: "Symptoms",
  action_followup: "Follow-up",
  action_outcome: "Outcome",
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
  "action_followup",
  "action_outcome",
];

export interface DiaryEntryBadgesProps {
  item: GrowDiaryTimelineItem;
  className?: string;
}

export default function DiaryEntryBadges({ item, className }: DiaryEntryBadgesProps) {
  const tagsToShow = PRIMARY_TAGS.filter((t) => item.tags.includes(t));
  const hasWarnings = item.warnings.length > 0;
  const sensorBadge = sensorSnapshotBadge(item.sensorSnapshotState);
  const sourceLabel = item.hasSensorSnapshot ? item.sensorSourceLabel ?? null : null;
  const vendorLabel = item.hasSensorSnapshot ? item.sensorVendorLabel ?? null : null;

  if (
    tagsToShow.length === 0 &&
    !hasWarnings &&
    !sensorBadge &&
    !sourceLabel &&
    !vendorLabel
  ) {
    return null;
  }

  const variantClasses: Record<SensorSnapshotBadge["variant"], string> = {
    positive:
      "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
    neutral:
      "bg-secondary/60 border-border/40 text-muted-foreground",
    warning:
      "bg-amber-500/10 border-amber-500/30 text-amber-300",
    error:
      "bg-red-500/10 border-red-500/30 text-red-300",
  };

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
      {sensorBadge && (
        <span
          data-testid={`diary-entry-sensor-badge-${sensorBadge.variant}`}
          className={cn(
            "inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border",
            variantClasses[sensorBadge.variant],
          )}
        >
          {sensorBadge.label}
        </span>
      )}
      {sourceLabel && (
        <span
          data-testid="diary-entry-sensor-source-badge"
          data-sensor-source={sourceLabel}
          className="text-[11px] px-2 py-0.5 rounded-full bg-secondary/60 border border-border/40 text-muted-foreground"
        >
          Source: {sourceLabel}
        </span>
      )}
      {vendorLabel && (
        <span
          data-testid="diary-entry-sensor-vendor-badge"
          data-sensor-vendor={vendorLabel}
          title="Vendor lineage only — not used for authorization"
          className="text-[11px] px-2 py-0.5 rounded-full bg-secondary/40 border border-border/30 text-muted-foreground"
        >
          Vendor: {vendorLabel}
        </span>
      )}
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
      {item.tags.includes("action_followup") && (
        <span
          data-testid="diary-entry-followup-caption"
          className="text-[11px] text-muted-foreground"
        >
          {normalizeFollowupKindLabel("24h_recheck")} · {FOLLOWUP_SAFE_CAPTION}
        </span>
      )}
    </div>
  );
}
