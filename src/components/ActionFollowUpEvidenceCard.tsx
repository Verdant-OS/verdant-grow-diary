/**
 * ActionFollowUpEvidenceCard — presenter card for a saved grower
 * follow-up. No I/O, no derivation of plant health.
 */
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import SensorSourceBadge from "@/components/sensor/SensorSourceBadge";
import {
  ACTION_FOLLOWUP_NO_OBSERVATION_COPY,
  type ActionFollowUpEvidenceViewModel,
} from "@/lib/actionFollowUpEvidenceViewModel";

const TONE_CLASS: Record<ActionFollowUpEvidenceViewModel["outcomeTone"], string> = {
  positive: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  neutral: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  warning: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  muted: "bg-secondary/30 text-muted-foreground border-border/40",
};

export interface ActionFollowUpEvidenceCardProps {
  viewModel: ActionFollowUpEvidenceViewModel;
  className?: string;
}

export default function ActionFollowUpEvidenceCard({
  viewModel,
  className,
}: ActionFollowUpEvidenceCardProps) {
  return (
    <div
      data-testid="action-followup-card"
      data-outcome={viewModel.outcome ?? "unknown"}
      className={cn("rounded-xl border border-border/40 bg-secondary/20 p-3 space-y-2", className)}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <Badge
          variant="outline"
          className={cn("uppercase text-[10px]", TONE_CLASS[viewModel.outcomeTone])}
          data-testid="action-followup-outcome-label"
        >
          Follow-up · {viewModel.outcomeLabel}
        </Badge>
        <span className="text-xs text-muted-foreground" data-testid="action-followup-observed-at">
          {viewModel.observedAtLabel}
        </span>
      </div>

      {viewModel.note ? (
        <p className="text-sm whitespace-pre-wrap" data-testid="action-followup-note-text">
          {viewModel.note}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground italic" data-testid="action-followup-no-observation">
          {ACTION_FOLLOWUP_NO_OBSERVATION_COPY}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Linked to {viewModel.actionLabel}
      </p>

      {viewModel.sensorSnapshotId && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Sensor snapshot attached</span>
          <SensorSourceBadge source="manual" testId="action-followup-sensor-source" />
        </div>
      )}
    </div>
  );
}
