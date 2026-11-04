import { useId } from "react";
import {
  TIMELINE_GROW_SWITCHER_COPY,
  type TimelineGrowSwitcher as Switcher,
} from "@/lib/timelineGrowSwitcherRules";

/** Labelled, full-size grow picker for the Timeline header (item 16). */
export function TimelineGrowSwitcher({
  switcher,
  onChange,
}: {
  switcher: Switcher;
  onChange: (growId: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2" data-testid="timeline-grow-switcher">
      <label htmlFor={id} className="text-sm font-medium text-muted-foreground">
        {TIMELINE_GROW_SWITCHER_COPY.label}
      </label>
      <select
        id={id}
        value={switcher.value}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
        data-testid="timeline-grow-switcher-select"
        className="h-9 min-w-[10rem] max-w-full rounded-md border border-border/60 bg-background px-2 text-sm"
      >
        {!switcher.value && (
          <option value="" disabled>
            {TIMELINE_GROW_SWITCHER_COPY.choose}
          </option>
        )}
        {switcher.options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
