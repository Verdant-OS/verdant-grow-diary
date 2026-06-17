/**
 * SensorSourceSummaryWidget — read-only summary card that shows how
 * many sensor readings came from each canonical source for the supplied
 * readings/date range.
 *
 * Pure presenter. No I/O. No writes. No AI calls.
 */
import {
  SENSOR_SOURCE_KINDS,
  SENSOR_SOURCE_SHORT_LABEL,
} from "@/constants/sensorSourceLabels";
import {
  SENSOR_SOURCE_SUMMARY_EMPTY_TEXT,
  summarizeSensorSources,
  type SensorSourceSummaryOptions,
  type SensorSourceSummaryReading,
} from "@/lib/sensorSourceSummaryRules";
import SensorSourceLegendTooltip from "@/components/SensorSourceLegendTooltip";
import { cn } from "@/lib/utils";

interface Props {
  readings: ReadonlyArray<SensorSourceSummaryReading> | null | undefined;
  options?: SensorSourceSummaryOptions;
  className?: string;
  title?: string;
}

const TONE: Record<string, string> = {
  live: "border-emerald-500/40 text-emerald-300",
  manual: "border-cyan-500/40 text-cyan-300",
  csv: "border-amber-500/40 text-amber-300",
  demo: "border-border/60 text-muted-foreground",
  stale: "border-yellow-500/40 text-yellow-300",
  invalid: "border-destructive/40 text-destructive",
};

export default function SensorSourceSummaryWidget({
  readings,
  options,
  className,
  title = "Sensor source summary",
}: Props) {
  const summary = summarizeSensorSources(readings, options);

  return (
    <section
      data-testid="sensor-source-summary-widget"
      aria-label={title}
      className={cn(
        "rounded-2xl border border-border/50 bg-secondary/20 p-4",
        className,
      )}
    >
      <header className="mb-3 flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-[11px] text-muted-foreground">
            {summary.total} {summary.total === 1 ? "reading" : "readings"} in range
          </p>
        </div>
        <SensorSourceLegendTooltip testIdSuffix="summary" />
      </header>

      {summary.isEmpty ? (
        <p
          className="text-xs text-muted-foreground py-4 text-center"
          data-testid="sensor-source-summary-empty"
        >
          {SENSOR_SOURCE_SUMMARY_EMPTY_TEXT}
        </p>
      ) : (
        <ul
          className="grid grid-cols-2 gap-1.5 sm:grid-cols-3"
          data-testid="sensor-source-summary-rows"
        >
          {SENSOR_SOURCE_KINDS.map((kind) => (
            <li
              key={kind}
              data-testid={`sensor-source-summary-row-${kind}`}
              data-source-kind={kind}
              className={cn(
                "flex items-center justify-between rounded-lg border bg-background/40 px-2.5 py-1.5 text-xs",
                TONE[kind],
              )}
            >
              <span className="font-medium">{SENSOR_SOURCE_SHORT_LABEL[kind]}</span>
              <span
                className="tabular-nums font-semibold"
                data-testid={`sensor-source-summary-count-${kind}`}
              >
                {summary.counts[kind]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
