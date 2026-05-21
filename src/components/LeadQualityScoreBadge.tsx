import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  scoreLeadQuality,
  type LeadQualityGrade,
} from "@/lib/leadQualityScoreRules";
import type { LeadRow } from "@/hooks/useLeadsList";

const GRADE_VARIANT: Record<
  LeadQualityGrade,
  "destructive" | "default" | "secondary" | "outline"
> = {
  A: "default",
  B: "default",
  C: "secondary",
  D: "outline",
  F: "destructive",
  Unknown: "outline",
};

export interface LeadQualityScoreBadgeProps {
  lead: LeadRow | null;
  /** Compact mode hides reasons/warnings for use inside list rows. */
  compact?: boolean;
  className?: string;
}

/**
 * Read-only presenter for the Lead Quality Score.
 *
 * Performs no I/O and no external communication.
 */
export default function LeadQualityScoreBadge({
  lead,
  compact = false,
  className,
}: LeadQualityScoreBadgeProps) {
  if (!lead) {
    return (
      <Badge
        variant="outline"
        className={className}
        data-testid="lead-quality-empty"
      >
        Quality —
      </Badge>
    );
  }

  const q = scoreLeadQuality(lead);

  if (compact) {
    return (
      <Badge
        variant={GRADE_VARIANT[q.grade]}
        className={cn("tabular-nums", className)}
        data-testid="lead-quality-badge"
        data-grade={q.grade}
        data-score={q.score}
        title={`${q.label} (${q.score}/100)`}
      >
        {q.grade} · {q.score}
      </Badge>
    );
  }

  return (
    <div
      className={cn(
        "rounded-md border border-border/40 bg-card/30 p-3 space-y-2",
        className,
      )}
      data-testid="lead-quality-panel"
      data-grade={q.grade}
      data-score={q.score}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-foreground">
          Quality: {q.label}
        </span>
        <Badge variant={GRADE_VARIANT[q.grade]} className="tabular-nums">
          {q.grade} · {q.score}/100
        </Badge>
      </div>
      {q.reasons.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {q.reasons.join(" · ")}
        </p>
      )}
      {q.warnings.length > 0 && (
        <p
          className="text-xs text-destructive"
          data-testid="lead-quality-warnings"
        >
          {q.warnings.join("; ")}
        </p>
      )}
    </div>
  );
}
