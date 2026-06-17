/**
 * SensorSourceSummaryWidget — read-only summary card that shows how
 * many sensor readings came from each canonical source for the supplied
 * readings/date range.
 *
 * Rows with count > 0 link to the Timeline filtered by that source
 * (and optional date range / plant). Rows with count = 0 stay visible
 * but render as accessible-disabled non-links so growers can still see
 * the full legend at a glance.
 *
 * Pure presenter. No I/O. No writes. No AI calls.
 */
import { Link } from "react-router-dom";
import {
  SENSOR_SOURCE_KINDS,
  SENSOR_SOURCE_SHORT_LABEL,
  SENSOR_SOURCE_LEGEND,
} from "@/constants/sensorSourceLabels";
import {
  SENSOR_SOURCE_SUMMARY_EMPTY_TEXT,
  summarizeSensorSources,
  type SensorSourceSummaryOptions,
  type SensorSourceSummaryReading,
} from "@/lib/sensorSourceSummaryRules";
import SensorSourceLegendTooltip from "@/components/SensorSourceLegendTooltip";
import { buildTimelineFilterUrl } from "@/lib/sensorSourceUrlRules";
import type { TimelineSensorSourceKind } from "@/lib/timelineSensorSourceBadgeRules";
import { cn } from "@/lib/utils";

interface Props {
  readings: ReadonlyArray<SensorSourceSummaryReading> | null | undefined;
  options?: SensorSourceSummaryOptions;
  className?: string;
  title?: string;
  /**
   * Optional date range applied to the click-through Timeline URL.
   * Should be YYYY-MM-DD strings.
   */
  dateRange?: { from?: string | null; to?: string | null } | null;
  /** Optional plant scope applied to the click-through URL. */
  plantId?: string | null;
  /** Override the link base (default `/timeline`). */
  linkBase?: string;
  /** When false, rows are non-clicking even when count > 0. */
  enableLinks?: boolean;
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
  dateRange,
  plantId,
  linkBase,
  enableLinks = true,
}: Props) {
  const summary = summarizeSensorSources(readings, options);

  function renderRow(kind: TimelineSensorSourceKind) {
    const count = summary.counts[kind];
    const label = SENSOR_SOURCE_SHORT_LABEL[kind];
    const legend = SENSOR_SOURCE_LEGEND[kind];
    const baseCls = cn(
      "flex items-center justify-between rounded-lg border bg-background/40 px-2.5 py-1.5 text-xs",
      TONE[kind],
    );
    const a11yLabel = `${label}: ${count} ${count === 1 ? "reading" : "readings"} — ${legend}`;
    const inner = (
      <>
        <span className="font-medium">{label}</span>
        <span
          className="tabular-nums font-semibold"
          data-testid={`sensor-source-summary-count-${kind}`}
        >
          {count}
        </span>
      </>
    );
    const sharedAttrs = {
      "data-testid": `sensor-source-summary-row-${kind}`,
      "data-source-kind": kind,
      "data-source-count": String(count),
      "aria-label": a11yLabel,
      title: legend,
    } as const;

    if (!enableLinks || count <= 0) {
      return (
        <li
          key={kind}
          {...sharedAttrs}
          data-clickable="false"
          aria-disabled={count <= 0 ? "true" : undefined}
          className={cn(baseCls, count <= 0 && "opacity-60")}
        >
          {inner}
        </li>
      );
    }
    const to = buildTimelineFilterUrl({
      sources: [kind],
      from: dateRange?.from ?? null,
      to: dateRange?.to ?? null,
      plantId: plantId ?? null,
      base: linkBase,
    });
    return (
      <li key={kind} {...sharedAttrs} data-clickable="true">
        <Link
          to={to}
          aria-label={`Open Timeline filtered to ${label} source (${count} ${count === 1 ? "reading" : "readings"})`}
          data-testid={`sensor-source-summary-link-${kind}`}
          className={cn(
            baseCls,
            "w-full hover:bg-background/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
          )}
        >
          {inner}
        </Link>
      </li>
    );
  }

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
          {SENSOR_SOURCE_KINDS.map(renderRow)}
        </ul>
      )}
    </section>
  );
}
