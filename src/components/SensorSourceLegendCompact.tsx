/**
 * Compact sensor source legend — presenter only. All copy/data come from
 * src/lib/sensorSourceLegendViewModel.ts. No business logic.
 */
import { SENSOR_SOURCE_LEGEND } from "@/lib/sensorSourceLegendViewModel";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  testId?: string;
}

export default function SensorSourceLegendCompact({
  className,
  testId = "sensor-source-legend-compact",
}: Props) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground",
        className,
      )}
    >
      <p className="mb-2 font-semibold text-foreground">Source labels</p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
        {SENSOR_SOURCE_LEGEND.map((entry) => (
          <li
            key={entry.kind}
            data-testid={`sensor-source-legend-entry-${entry.kind}`}
            data-tone={entry.tone}
            className="flex items-baseline gap-2"
          >
            <span
              className={cn(
                "inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px]",
                entry.tone === "caution"
                  ? "border-[hsl(var(--warning))] text-[hsl(var(--warning))]"
                  : "border-border/60 text-muted-foreground",
              )}
            >
              {entry.label}
            </span>
            <span className="text-[11px]">{entry.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
