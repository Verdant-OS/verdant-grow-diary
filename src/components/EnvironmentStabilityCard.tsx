import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  STABILITY_STATUS_LABEL,
  type StabilityResult,
} from "@/lib/environmentStabilityRules";
import { deriveStabilityWhyContext } from "@/lib/stabilityWhyContext";

/**
 * Presenter-only summary card for stage-aware VPD stability over the last
 * 24h and 7d. Pure render; the caller computes the result with the
 * `computeEnvironmentStability` helper.
 */
export interface EnvironmentStabilityCardProps {
  result: StabilityResult;
  testId: string;
  className?: string;
}

function statusBadgeClass(
  status: StabilityResult["status"],
): string {
  switch (status) {
    case "stable":
      return "bg-secondary/30 text-foreground border-border";
    case "watch":
      return "bg-secondary/20 text-foreground border-[hsl(var(--warning))]";
    case "unstable":
      return "bg-destructive/10 text-destructive border-destructive";
    default:
      return "bg-secondary/10 text-muted-foreground border-border";
  }
}

function formatHours(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return "0h";
  if (h < 1) {
    const mins = Math.round(h * 60);
    return `${mins}m`;
  }
  return `${Math.round(h * 10) / 10}h`;
}

export default function EnvironmentStabilityCard({
  result,
  testId,
  className,
}: EnvironmentStabilityCardProps) {
  const { status, last24h, last7d, sparse, message, stage } = result;
  const label = STABILITY_STATUS_LABEL[status];
  const inactive =
    status === "stage_unknown" ||
    status === "context_only" ||
    status === "unavailable";
  const why = deriveStabilityWhyContext(stage);

  return (
    <div
      data-testid={testId}
      role="status"
      className={cn(
        "glass rounded-2xl p-4 flex flex-col gap-3",
        className,
      )}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-display font-semibold text-sm">
            Outside VPD target
          </h3>
          <Badge
            variant="outline"
            className="text-[10px] uppercase border-muted-foreground text-muted-foreground"
          >
            Stage-aware
          </Badge>
          <Badge
            variant="outline"
            className="text-[10px] uppercase border-muted-foreground text-muted-foreground"
          >
            Read-only summary
          </Badge>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] uppercase",
            statusBadgeClass(status),
          )}
          data-testid={`${testId}-status`}
        >
          {label}
        </Badge>
      </div>

      {inactive ? (
        <p
          className="text-xs text-muted-foreground"
          data-testid={`${testId}-inactive-note`}
        >
          {message ?? "Stability summary unavailable."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div
            className="rounded-lg border border-border/40 bg-secondary/10 p-2"
            data-testid={`${testId}-window-24h`}
          >
            <div className="text-[11px] uppercase text-muted-foreground">
              Last 24h
            </div>
            <div className="font-display text-base">
              {formatHours(last24h.hoursOutside)}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {last24h.outsideCount}/{last24h.totalConsidered} readings outside
            </div>
          </div>
          <div
            className="rounded-lg border border-border/40 bg-secondary/10 p-2"
            data-testid={`${testId}-window-7d`}
          >
            <div className="text-[11px] uppercase text-muted-foreground">
              Last 7d
            </div>
            <div className="font-display text-base">
              {formatHours(last7d.hoursOutside)}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {last7d.outsideCount}/{last7d.totalConsidered} readings outside
            </div>
          </div>
        </div>
      )}

      {sparse && !inactive && (
        <p
          className="text-[11px] text-muted-foreground"
          data-testid={`${testId}-sparse-warning`}
        >
          Limited data — stability estimate may be incomplete.
        </p>
      )}
    </div>
  );
}
