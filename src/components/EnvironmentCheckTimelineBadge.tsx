/**
 * EnvironmentCheckTimelineBadge — presenter-only badge for Environment
 * Check diary timeline entries. No business logic; consumes a
 * pre-built EnvironmentCheckDiaryViewModel.
 */
import { AlertTriangle, CheckCircle2, Clock, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  EnvironmentCheckDiaryStatus,
  EnvironmentCheckDiaryViewModel,
} from "@/lib/environmentCheckViewModel";

const STATUS_CLASS: Record<EnvironmentCheckDiaryStatus, string> = {
  valid: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
  review_required: "bg-amber-500/10 border-amber-500/30 text-amber-300",
  dst_ambiguous: "bg-amber-500/10 border-amber-500/30 text-amber-300",
  invalid: "bg-red-500/10 border-red-500/30 text-red-300",
};

function StatusIcon({ status }: { status: EnvironmentCheckDiaryStatus }) {
  if (status === "valid") return <CheckCircle2 className="h-3 w-3" />;
  if (status === "invalid") return <XCircle className="h-3 w-3" />;
  if (status === "dst_ambiguous") return <Clock className="h-3 w-3" />;
  return <AlertTriangle className="h-3 w-3" />;
}

export interface EnvironmentCheckTimelineBadgeProps {
  viewModel: EnvironmentCheckDiaryViewModel;
  className?: string;
}

export default function EnvironmentCheckTimelineBadge({
  viewModel,
  className,
}: EnvironmentCheckTimelineBadgeProps) {
  return (
    <div
      data-testid="environment-check-timeline-badge"
      data-entry-id={viewModel.entryId}
      data-status={viewModel.status}
      data-tone={viewModel.statusTone}
      className={cn("mt-2 flex flex-col gap-1.5", className)}
    >
      <span
        data-testid={`environment-check-status-${viewModel.status}`}
        className={cn(
          "inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border w-fit",
          STATUS_CLASS[viewModel.status],
        )}
      >
        <StatusIcon status={viewModel.status} />
        {viewModel.statusLabel}
      </span>

      {viewModel.ruleAnnotations.length > 0 && (
        <ul
          data-testid="environment-check-annotations"
          className="text-[11px] text-muted-foreground space-y-0.5 pl-0.5"
        >
          {viewModel.ruleAnnotations.map((a) => (
            <li
              key={a.ruleId}
              data-testid={`environment-check-annotation-${a.ruleId}`}
              data-status={a.status}
            >
              <span className="font-medium text-foreground/80">{a.label}:</span>{" "}
              {a.message}
            </li>
          ))}
        </ul>
      )}

      {viewModel.reviewPrompt && (
        <p
          data-testid="environment-check-review-prompt"
          className="text-[11px] text-amber-300"
        >
          {viewModel.reviewPrompt}
        </p>
      )}
    </div>
  );
}
