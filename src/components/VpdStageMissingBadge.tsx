import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Presenter-only info badge shown when a VPD value is present but the
 * relevant grow/plant stage is unknown. Pure render; gating lives at each
 * call site so existing gating tests keep passing.
 */
export interface VpdStageMissingBadgeProps {
  testId: string;
  className?: string;
}

export default function VpdStageMissingBadge({
  testId,
  className,
}: VpdStageMissingBadgeProps) {
  return (
    <div
      data-testid={testId}
      role="status"
      className={cn(
        "rounded-lg border border-border/40 bg-secondary/10 p-2 text-xs text-muted-foreground flex items-center gap-2 flex-wrap",
        className,
      )}
    >
      <Badge
        variant="outline"
        className="text-[10px] uppercase border-muted-foreground text-muted-foreground"
      >
        Info
      </Badge>
      <span>Set plant stage to evaluate VPD targets.</span>
    </div>
  );
}
