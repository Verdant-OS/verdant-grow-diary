import { stageLabel } from "@/lib/grow";
import { resolveTimelineGrowDay } from "@/lib/plantStartDateRules";
import { useTimelineGrowDayNow } from "@/hooks/useTimelineGrowDayNow";

export function TimelineGrowDayLabel({
  startedAt,
  stage,
}: {
  startedAt: string | null | undefined;
  stage: string | null | undefined;
}) {
  const now = useTimelineGrowDayNow();
  const timelineGrowDay = resolveTimelineGrowDay(startedAt, now);
  return (
    <span className="text-sm text-muted-foreground" data-testid="timeline-grow-day">
      {stageLabel(stage)}
      {timelineGrowDay === null ? "" : ` · day ${timelineGrowDay}`}
    </span>
  );
}
