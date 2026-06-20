/**
 * SensorSourceInlineLegend — persistent, always-visible row that lists
 * every canonical sensor source kind. Unlike SensorSourceLegendTooltip
 * (a disclosure), this row is always shown so growers do not need to
 * hover, focus, or expand anything to understand source meaning.
 *
 * Highlights the chips that match `highlight` (e.g. the source filters
 * currently selected in the URL query). Pure presenter, no writes.
 */
import {
  SENSOR_SOURCE_KINDS,
  SENSOR_SOURCE_SHORT_LABEL,
  SENSOR_SOURCE_LEGEND,
} from "@/constants/sensorSourceLabels";
import type { TimelineSensorSourceKind } from "@/lib/timelineSensorSourceBadgeRules";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  /** Source kinds to render as highlighted. */
  highlight?: ReadonlyArray<TimelineSensorSourceKind> | null;
  /** Test id override (defaults to `sensor-source-inline-legend`). */
  testId?: string;
}

const TONE: Record<TimelineSensorSourceKind, string> = {
  live: "border-emerald-500/40 text-emerald-300",
  manual: "border-cyan-500/40 text-cyan-300",
  csv: "border-amber-500/40 text-amber-300",
  demo: "border-border/60 text-muted-foreground",
  stale: "border-yellow-500/40 text-yellow-300",
  invalid: "border-destructive/40 text-destructive",
};

export default function SensorSourceInlineLegend({
  className,
  highlight,
  testId = "sensor-source-inline-legend",
}: Props) {
  const highlightSet = new Set<TimelineSensorSourceKind>(highlight ?? []);
  return (
    <ul
      data-testid={testId}
      aria-label="Sensor source legend"
      className={cn("flex flex-wrap items-center gap-1.5", className)}
    >
      {SENSOR_SOURCE_KINDS.map((kind) => {
        const isOn = highlightSet.has(kind);
        return (
          <li
            key={kind}
            data-testid={`${testId}-row-${kind}`}
            data-source-kind={kind}
            data-highlighted={isOn ? "true" : "false"}
            aria-label={`${SENSOR_SOURCE_SHORT_LABEL[kind]}: ${SENSOR_SOURCE_LEGEND[kind]}`}
            title={SENSOR_SOURCE_LEGEND[kind]}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border bg-background/40 px-2 py-0.5 text-[11px] font-medium",
              TONE[kind],
              isOn && "ring-2 ring-primary/60",
            )}
          >
            <span>{SENSOR_SOURCE_SHORT_LABEL[kind]}</span>
            <span className="sr-only">— {SENSOR_SOURCE_LEGEND[kind]}</span>
          </li>
        );
      })}
    </ul>
  );
}
