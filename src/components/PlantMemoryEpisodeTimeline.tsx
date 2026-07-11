/**
 * PlantMemoryEpisodeTimeline — the four episode moments in chronological
 * order (action → follow-up → outcome → learning decision). Presenter only.
 */
import { CheckCircle2, ClipboardCheck, MessageSquare, Sparkles } from "lucide-react";
import { NEXT_RUN_DECISION_LABELS } from "@/lib/plantMemoryEpisodeViewModel";
import type { PlantMemoryEpisode } from "@/lib/plantMemoryEpisodeRules";

export interface PlantMemoryEpisodeTimelineProps {
  readonly episode: PlantMemoryEpisode;
}

interface Moment {
  readonly key: string;
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly at: string | null;
}

export function PlantMemoryEpisodeTimeline({ episode }: PlantMemoryEpisodeTimelineProps) {
  const moments: Moment[] = [
    {
      key: "action",
      icon: <CheckCircle2 className="h-4 w-4" aria-hidden />,
      label: "Action completed",
      at: episode.action.completedAt,
    },
    {
      key: "followup",
      icon: <ClipboardCheck className="h-4 w-4" aria-hidden />,
      label: "Follow-up check",
      at: episode.followUp.occurredAt,
    },
    {
      key: "outcome",
      icon: <MessageSquare className="h-4 w-4" aria-hidden />,
      label: "Grower-recorded outcome",
      at: episode.outcome.occurredAt,
    },
    {
      key: "decision",
      icon: <Sparkles className="h-4 w-4" aria-hidden />,
      label: episode.learning.decision
        ? `Next-run decision: ${NEXT_RUN_DECISION_LABELS[episode.learning.decision]}`
        : "Next-run decision",
      at: episode.learning.recordedAt,
    },
  ].filter((m) => m.at !== null);

  if (moments.length === 0) return null;

  return (
    <ol className="space-y-2" aria-label="Episode timeline">
      {moments.map((moment) => (
        <li key={moment.key} className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{moment.icon}</span>
          <span className="flex-1">{moment.label}</span>
          <time dateTime={moment.at ?? undefined} className="text-xs text-muted-foreground">
            {formatWhen(moment.at)}
          </time>
        </li>
      ))}
    </ol>
  );
}

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
