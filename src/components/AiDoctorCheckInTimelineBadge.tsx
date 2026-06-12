/**
 * AiDoctorCheckInTimelineBadge — presenter-only sub-badge that marks a
 * diary/timeline row as having been saved from an AI Doctor Check-In
 * preview. Does NOT replace the primary event-type label.
 *
 * No queries, no writes, no model calls.
 */
import { Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AI_DOCTOR_CHECK_IN_BADGE_ARIA_LABEL,
  AI_DOCTOR_CHECK_IN_BADGE_LABEL,
  isAiDoctorCheckInEvent,
  type AiDoctorCheckInEventLike,
} from "@/lib/aiDoctorCheckInEventBadge";

export interface AiDoctorCheckInTimelineBadgeProps {
  event: AiDoctorCheckInEventLike | null | undefined;
  className?: string;
}

export default function AiDoctorCheckInTimelineBadge({
  event,
  className,
}: AiDoctorCheckInTimelineBadgeProps) {
  if (!isAiDoctorCheckInEvent(event)) return null;
  return (
    <span
      data-testid="ai-doctor-check-in-timeline-badge"
      aria-label={AI_DOCTOR_CHECK_IN_BADGE_ARIA_LABEL}
      title={AI_DOCTOR_CHECK_IN_BADGE_ARIA_LABEL}
      className={cn(
        "mt-2 inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full",
        "bg-secondary/60 border border-border/40 text-muted-foreground",
        className,
      )}
    >
      <Stethoscope className="h-3 w-3" aria-hidden="true" />
      {AI_DOCTOR_CHECK_IN_BADGE_LABEL}
    </span>
  );
}
