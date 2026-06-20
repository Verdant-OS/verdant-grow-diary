/**
 * TimelineSensorSourceBadge — read-only presenter that renders the
 * canonical Verdant source label (live | manual | csv | demo | stale |
 * invalid) for a sensor-derived timeline entry.
 *
 * Centralized so JSX never re-derives source labels. No I/O. No writes.
 */
import { cn } from "@/lib/utils";
import type {
  TimelineSensorSourceBadge as Badge,
  TimelineSensorSourceKind,
} from "@/lib/timelineSensorSourceBadgeRules";
import { timelineSensorSourceBadgeTestId } from "@/lib/timelineSensorSourceBadgeRules";

const TONE: Record<TimelineSensorSourceKind, string> = {
  live: "bg-emerald-500/10 border-emerald-500/40 text-emerald-300",
  manual: "bg-cyan-500/10 border-cyan-500/40 text-cyan-300",
  csv: "bg-amber-500/10 border-amber-500/40 text-amber-300",
  demo: "bg-secondary/60 border-border/60 text-muted-foreground",
  stale: "bg-yellow-500/10 border-yellow-500/40 text-yellow-300",
  invalid: "bg-destructive/10 border-destructive/40 text-destructive",
};

interface Props {
  badge: Badge;
  className?: string;
}

export default function TimelineSensorSourceBadge({ badge, className }: Props) {
  return (
    <span
      data-testid={timelineSensorSourceBadgeTestId(badge.kind)}
      data-source-kind={badge.kind}
      title={badge.description}
      className={cn(
        "inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border font-medium",
        TONE[badge.kind],
        className,
      )}
    >
      {badge.label}
    </span>
  );
}
