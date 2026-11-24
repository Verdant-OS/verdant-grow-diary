import { stageLabel } from "@/lib/grow";
import { resolveTimelineHeaderStage } from "@/lib/timelineHeaderStageRules";
import { useTimelineGrowDayNow } from "@/hooks/useTimelineGrowDayNow";

/**
 * `startedAt` and `stage` are the grow's. When the Timeline is scoped to a
 * plant or tent, pass that record too: its stage (and the plant's start
 * date) win over the grow's.
 */
export function TimelineGrowDayLabel({
  startedAt,
  stage,
  plant,
  tent,
}: {
  startedAt: string | null | undefined;
  stage: string | null | undefined;
  plant?: { stage?: string | null; started_at?: string | null } | null;
  tent?: { stage?: string | null } | null;
}) {
  const now = useTimelineGrowDayNow();
  const header = resolveTimelineHeaderStage(
    { plant, tent, grow: { stage, started_at: startedAt } },
    now,
  );
  return (
    <span
      className="text-sm text-muted-foreground"
      data-testid="timeline-grow-day"
      data-stage-source={header.stageSource}
    >
      {stageLabel(header.stage)}
      {header.day === null ? "" : ` · day ${header.day}`}
    </span>
  );
}
