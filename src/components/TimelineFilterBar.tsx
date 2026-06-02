/**
 * TimelineFilterBar — presenter-only chip strip + Show all reset.
 *
 * Hard constraints:
 *  - No business logic: chips/counts come from `timelineFilterViewModel`.
 *  - No live / synced / connected / imported labeling.
 */
import { cn } from "@/lib/utils";
import type { TimelineFilterChip } from "@/lib/timelineFilterViewModel";
import type { TimelineFilterKey } from "@/lib/timelineFilterRules";

interface Props {
  chips: TimelineFilterChip[];
  selected: TimelineFilterKey;
  onSelect: (key: TimelineFilterKey) => void;
  resetKey: TimelineFilterKey;
}

export default function TimelineFilterBar({
  chips,
  selected,
  onSelect,
  resetKey,
}: Props) {
  const canReset = selected !== resetKey;
  return (
    <div
      role="radiogroup"
      aria-label="Filter timeline by event type"
      data-testid="timeline-filter-bar"
      className="flex flex-wrap items-center gap-1.5"
    >
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          role="radio"
          aria-checked={chip.selected}
          data-testid={`timeline-filter-chip-${chip.key}`}
          data-selected={chip.selected ? "true" : "false"}
          data-count={chip.count}
          onClick={() => onSelect(chip.key)}
          className={cn(
            "inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border min-h-[32px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            chip.selected
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-secondary/40 text-foreground border-border/40 hover:bg-secondary/60",
          )}
        >
          <span>{chip.label}</span>
          <span
            className={cn(
              "tabular-nums rounded-full px-1.5 text-[10px] leading-4",
              chip.selected
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-background/60 text-muted-foreground",
            )}
          >
            {chip.count}
          </span>
        </button>
      ))}
      {canReset && (
        <button
          type="button"
          data-testid="timeline-filter-reset"
          onClick={() => onSelect(resetKey)}
          className="text-xs underline text-muted-foreground hover:text-foreground min-h-[32px] px-2"
        >
          Show all
        </button>
      )}
    </div>
  );
}
