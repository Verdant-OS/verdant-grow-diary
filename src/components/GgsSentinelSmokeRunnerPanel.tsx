/**
 * GgsSentinelSmokeRunnerPanel — presenter for the GGS Sentinel verdict.
 *
 * Renders:
 *  - one verdict pill
 *  - the compact one-line-per-metric freshness section, with the
 *    explanatory note that does NOT change verdict priority
 *  - clear visual distinction between Missing and Stale metrics
 *
 * Presenter-only. All shape decisions come from the view-model. No
 * rules, no Supabase, no AI calls, no writes, no raw-payload surface,
 * no device control.
 */
import React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CircleHelp, ClockAlert, ShieldAlert, ShieldCheck, TimerReset } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  FreshnessRowViewModel,
  FreshnessTone,
  GgsSentinelSmokeRunnerPanelViewModel,
} from "@/lib/ggsSentinelSmokeRunnerViewModel";
import type {
  GgsSentinelMetricFreshness,
  MetricFreshnessState,
} from "@/lib/ggsSentinelSmokeRunner";
import { cn } from "@/lib/utils";

const TONE_CLASSES: Readonly<Record<FreshnessTone, string>> = {
  primary: "bg-primary/15 text-primary border-primary/40",
  warning: "bg-amber-500/15 text-amber-500 border-amber-500/40",
  destructive: "bg-destructive/15 text-destructive border-destructive/40",
  muted: "bg-muted text-muted-foreground border-border",
};

const STATE_ICON: Readonly<Record<MetricFreshnessState, ComponentType<SVGProps<SVGSVGElement>>>> = {
  fresh: ShieldCheck,
  fresh_but_aging: TimerReset,
  stale: ClockAlert,
  missing: CircleHelp,
};

function FreshnessRow({ row }: { row: FreshnessRowViewModel }) {
  const Icon = STATE_ICON[row.state];
  return (
    <li
      data-testid={`ggs-sentinel-freshness-row-${row.metric}`}
      data-metric={row.metric}
      data-state={row.state}
      data-tone={row.tone}
      className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-t px-2 py-1.5 text-xs first:border-t-0"
    >
      <span className="inline-flex items-center gap-1 font-medium text-foreground">
        <Icon aria-hidden="true" className="h-3.5 w-3.5" />
        <span>{row.label}</span>
      </span>
      <span aria-hidden="true" className="text-muted-foreground">
        ·
      </span>
      <span
        data-testid={`ggs-sentinel-status-${row.metric}`}
        aria-label={`Status: ${row.statusLabel}`}
        className={`inline-flex items-center rounded-md border px-1.5 py-0.5 font-semibold ${TONE_CLASSES[row.tone]}`}
      >
        {row.statusLabel}
      </span>
      <span aria-hidden="true" className="text-muted-foreground">
        ·
      </span>
      <span data-testid={`ggs-sentinel-age-${row.metric}`} className="text-muted-foreground">
        {row.ageText}
      </span>
      {row.capturedText && (
        <>
          <span aria-hidden="true" className="text-muted-foreground">
            ·
          </span>
          <span
            data-testid={`ggs-sentinel-captured-${row.metric}`}
            className="font-mono text-[11px] text-muted-foreground"
          >
            {row.capturedText}
          </span>
        </>
      )}
      <span aria-hidden="true" className="text-muted-foreground">
        ·
      </span>
      <span
        data-testid={`ggs-sentinel-next-${row.metric}`}
        className="basis-full text-muted-foreground sm:basis-auto"
      >
        {row.nextAction}
      </span>
    </li>
  );
}

export interface GgsSentinelFreshnessGuidanceListProps {
  metricFreshness: GgsSentinelMetricFreshness[];
}

/**
 * Example composition (read by static-safety scanner):
 *   <GgsSentinelFreshnessGuidanceList metricFreshness={evaluation.metricFreshness} />
 */
function FreshnessBadge({ freshness }: { freshness: GgsSentinelMetricFreshness }) {
  const f = freshness;
  const tooltipText =
    f.freshnessStatus === "missing"
      ? "Missing means no row was found in the freshness window."
      : "Rows are fresh through 75% of the window, aging after 75%, and stale after 15 min.";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`${f.freshnessStatus} freshness details`}
          className="rounded border px-1.5 py-0.5 text-xs"
        >
          <span data-testid={`ggs-freshness-badge-${f.freshnessStatus}`}>
            {f.freshnessStatus}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent>{tooltipText}</TooltipContent>
    </Tooltip>
  );
}

/** Compact per-metric freshness guidance list. Reads directly from the domain model. */
export function GgsSentinelFreshnessGuidanceList({
  metricFreshness,
}: GgsSentinelFreshnessGuidanceListProps): React.ReactElement | null {
  if (metricFreshness.length === 0) return null;
  return (
    <TooltipProvider>
      <div data-testid="ggs-freshness-compact-list" className="space-y-2">
        <p data-testid="ggs-freshness-priority-note" className="text-xs text-muted-foreground">
          Freshness guidance explains metric timing only — result-state priority still comes from the smoke-check result above.
        </p>
        <ul className="overflow-hidden rounded-md border bg-muted/20">
          {metricFreshness.map((f) => (
            <li
              key={f.metric}
              data-testid={`ggs-freshness-row-${f.freshnessStatus}`}
              title={f.nextActionLabel}
              className={cn(
                "grid grid-cols-[minmax(6.5rem,1.15fr)_auto_auto_minmax(7.5rem,1fr)] items-center gap-x-2 border-l-4 border-t px-2 py-1.5 text-xs first:border-t-0",
                f.missing && "border-dashed border-l-muted-foreground",
                f.stale && "border-l-destructive",
                !f.missing && !f.stale && "border-l-transparent",
              )}
            >
              {f.stale && <span aria-label="row expired" className="sr-only" />}
              {f.missing && <span aria-label="no row found" className="sr-only" />}
              <span className="font-medium text-foreground">{f.ageLabel}</span>
              <FreshnessBadge freshness={f} />
              <span aria-hidden="true" className="text-muted-foreground">·</span>
              <span className="text-muted-foreground truncate">{f.nextActionLabel}</span>
            </li>
          ))}
        </ul>
      </div>
    </TooltipProvider>
  );
}

export interface GgsSentinelSmokeRunnerPanelProps {
  viewModel: GgsSentinelSmokeRunnerPanelViewModel;
}

export function GgsSentinelSmokeRunnerPanel({ viewModel }: GgsSentinelSmokeRunnerPanelProps) {
  const { pill, freshnessNote, rows } = viewModel;
  const isPass = pill.state === "PASS_LIVE_SENTINEL_READY";
  const HeaderIcon = isPass ? ShieldCheck : ShieldAlert;

  return (
    <Card data-testid="ggs-sentinel-smoke-runner-panel" data-verdict-state={pill.state}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-0.5">
            <CardTitle className="text-base">GGS Sentinel Smoke Runner</CardTitle>
            <CardDescription>
              Read-only verdict · diary first · sensors second · no device control.
            </CardDescription>
          </div>
          <span
            data-testid="ggs-sentinel-verdict-pill"
            aria-label={`Verdict: ${pill.label}`}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold ${TONE_CLASSES[pill.tone]}`}
          >
            <HeaderIcon aria-hidden="true" className="h-3.5 w-3.5" />
            {pill.label}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <section aria-labelledby="ggs-sentinel-freshness-heading" className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h3
              id="ggs-sentinel-freshness-heading"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Freshness guidance
            </h3>
          </div>
          <p data-testid="ggs-sentinel-freshness-note" className="text-xs text-muted-foreground">
            {freshnessNote}
          </p>
          <ul
            data-testid="ggs-sentinel-freshness-rows"
            className="overflow-hidden rounded-md border bg-muted/20"
          >
            {rows.map((row) => (
              <FreshnessRow key={row.metric} row={row} />
            ))}
          </ul>
        </section>
      </CardContent>
    </Card>
  );
}

export default GgsSentinelSmokeRunnerPanel;
