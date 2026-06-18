import { useState } from "react";
import { ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import {
  buildEnvironmentCheckInsightsViewModel,
  ENVIRONMENT_CHECK_INSIGHTS_DISCLAIMER,
  ENVIRONMENT_CHECK_INSIGHTS_NOT_ENOUGH,
  ENVIRONMENT_CHECK_INSIGHTS_OUT_OF_RANGE,
  ENVIRONMENT_CHECK_INSIGHTS_TITLE,
  type EnvironmentCheckInsightsTargets,
} from "@/lib/environmentCheckInsightsViewModel";
import type { EnvironmentCheckTimelineRawEntry } from "@/lib/environmentCheckTimelineViewModel";
import { cn } from "@/lib/utils";

export const ENVIRONMENT_CHECK_INSIGHTS_EXPAND_LABEL = "Show insights";
export const ENVIRONMENT_CHECK_INSIGHTS_COLLAPSE_LABEL = "Hide insights";

interface EnvironmentCheckInsightsPanelProps {
  rawEntries: readonly EnvironmentCheckTimelineRawEntry[] | null | undefined;
  targets?: EnvironmentCheckInsightsTargets;
  plantSpecificTargets?: boolean;
}

export default function EnvironmentCheckInsightsPanel({
  rawEntries,
  targets,
  plantSpecificTargets,
}: EnvironmentCheckInsightsPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const vm = buildEnvironmentCheckInsightsViewModel(rawEntries, {
    targets,
    plantSpecificTargets,
  });

  const regionId = "env-check-insights-region";

  return (
    <section
      className="rounded-xl border border-border/50 bg-secondary/30 p-3 mb-3"
      aria-label={ENVIRONMENT_CHECK_INSIGHTS_TITLE}
      data-testid="env-check-insights-panel"
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={regionId}
        aria-label={
          expanded
            ? ENVIRONMENT_CHECK_INSIGHTS_COLLAPSE_LABEL
            : ENVIRONMENT_CHECK_INSIGHTS_EXPAND_LABEL
        }
        onClick={() => setExpanded((p) => !p)}
        data-testid="env-check-insights-toggle"
        className={cn(
          "flex w-full items-start gap-2 text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-md",
        )}
      >
        <Sparkles className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" aria-hidden />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {ENVIRONMENT_CHECK_INSIGHTS_TITLE}
            </span>
            {expanded ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" aria-hidden />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" aria-hidden />
            )}
          </div>
          <p
            className="text-[11px] text-foreground mt-1"
            data-testid="env-check-insights-summary"
          >
            {vm.hasEnoughHistory
              ? vm.summary
              : ENVIRONMENT_CHECK_INSIGHTS_NOT_ENOUGH}
          </p>
          <p
            className="text-[10px] text-muted-foreground mt-1 italic"
            data-testid="env-check-insights-disclaimer-collapsed"
          >
            {ENVIRONMENT_CHECK_INSIGHTS_DISCLAIMER}
          </p>
        </div>
      </button>

      {expanded && (
        <div
          id={regionId}
          className="mt-3 pt-3 border-t border-border/40 space-y-3"
          data-testid="env-check-insights-expanded"
        >
          <p className="text-[11px] text-muted-foreground">
            <span data-testid="env-check-insights-count">
              {vm.count} Environment Check{vm.count === 1 ? "" : "s"} in view
            </span>
          </p>

          {vm.latest && vm.latest.values.length > 0 && (
            <div data-testid="env-check-insights-latest">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                Latest values
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {vm.latest.values.map((v) => (
                  <li
                    key={v.key}
                    className="inline-flex items-center gap-1 rounded-full bg-secondary/60 px-2 py-0.5 text-[11px] text-foreground"
                  >
                    <span className="text-muted-foreground">{v.label}</span>
                    <span className="font-medium">{v.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {vm.metrics.length > 0 && (
            <div data-testid="env-check-insights-stats">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                Range across diary entries
              </p>
              <ul className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-[11px]">
                {vm.metrics.map((m) => (
                  <li
                    key={m.key}
                    className="contents"
                    data-testid={`env-check-insights-metric-${m.key}`}
                  >
                    <span className="text-muted-foreground">{m.label}</span>
                    <span className="text-foreground">
                      min {m.min}{m.unit} · avg {m.avg}{m.unit} · max {m.max}{m.unit}
                      {m.outOfRange && (
                        <span
                          className="ml-2 inline-flex items-center rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 text-[10px]"
                          data-testid={`env-check-insights-out-of-range-${m.key}`}
                        >
                          {ENVIRONMENT_CHECK_INSIGHTS_OUT_OF_RANGE}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {vm.usingGenericTargets && vm.genericTargetsNote && (
            <p
              className="text-[10px] text-muted-foreground"
              data-testid="env-check-insights-generic-targets"
            >
              {vm.genericTargetsNote}
            </p>
          )}

          {vm.missingDataNote && (
            <p
              className="text-[10px] text-muted-foreground"
              data-testid="env-check-insights-missing-data"
            >
              {vm.missingDataNote}
            </p>
          )}

          <p
            className="text-[10px] text-muted-foreground italic"
            data-testid="env-check-insights-disclaimer-expanded"
          >
            {ENVIRONMENT_CHECK_INSIGHTS_DISCLAIMER}
          </p>
        </div>
      )}
    </section>
  );
}
