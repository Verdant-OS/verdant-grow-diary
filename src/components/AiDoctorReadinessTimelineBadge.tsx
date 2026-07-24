/**
 * AiDoctorReadinessTimelineBadge — presenter-only sub-badge that shows
 * the snapshot freshness recorded on an AI Doctor readiness-check diary
 * entry (fresh / stale / missing AT CHECK TIME, with the snapshot's age
 * at check). Does NOT replace the primary event-type label.
 *
 * No queries, no writes, no model calls. Historical truth only — the
 * view model never re-grades the check against the current clock.
 */
import { Gauge } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildAiDoctorReadinessTimelineBadge,
  type AiDoctorReadinessBadgeVariant,
  type AiDoctorReadinessEventLike,
} from "@/lib/aiDoctorReadinessTimelineBadge";

export interface AiDoctorReadinessTimelineBadgeProps {
  event: AiDoctorReadinessEventLike | null | undefined;
  className?: string;
}

const VARIANT_CLASSES: Record<AiDoctorReadinessBadgeVariant, string> = {
  positive: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
  warning: "bg-amber-500/10 border-amber-500/30 text-amber-300",
  neutral: "bg-secondary/60 border-border/40 text-muted-foreground",
};

export default function AiDoctorReadinessTimelineBadge({
  event,
  className,
}: AiDoctorReadinessTimelineBadgeProps) {
  const vm = buildAiDoctorReadinessTimelineBadge(event);
  if (!vm) return null;
  return (
    <span
      data-testid="ai-doctor-readiness-timeline-badge"
      data-snapshot-freshness={vm.freshness}
      data-snapshot-at={vm.snapshotAtIso ?? ""}
      aria-label={vm.ariaLabel}
      title={vm.ariaLabel}
      className={cn(
        "mt-2 inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border",
        VARIANT_CLASSES[vm.variant],
        className,
      )}
    >
      <Gauge className="h-3 w-3" aria-hidden="true" />
      {vm.label}
    </span>
  );
}
