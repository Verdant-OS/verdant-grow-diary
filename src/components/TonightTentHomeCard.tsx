import { Link } from "@/lib/react-router-compat";
import { Box, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatTemperatureDisplay } from "@/lib/temperatureUnitPreference";
import { tentDetailPath } from "@/lib/routes";
import {
  TONIGHT_TENT_HOME_COPY as COPY,
  type TonightLastLog,
  type TonightMetricView,
  type TonightTentSelection,
} from "@/lib/tonightTentHomeViewModel";

function formatMetricValue(metric: TonightMetricView): string {
  switch (metric.state) {
    case "missing":
      return COPY.missing;
    case "unavailable":
      return COPY.unavailable;
    case "loading":
      return COPY.loading;
    case "invalid":
      return COPY.invalidValue;
    case "value":
      if (metric.value === null) return COPY.missing;
      if (metric.key === "temp") return formatTemperatureDisplay(metric.value, { digits: 1 });
      if (metric.key === "rh") return `${metric.value.toFixed(0)}%`;
      return `${metric.value.toFixed(2)} kPa`;
  }
}

/**
 * One-Tent Home first fold. Presenter only: every decision comes from
 * `tonightTentHomeViewModel`. Renders nothing for an account with no tent.
 */
export default function TonightTentHomeCard(props: {
  selection: TonightTentSelection;
  metrics: TonightMetricView[];
  lastLog: TonightLastLog;
  logHref: string;
}) {
  const { selection, metrics, lastLog, logHref } = props;
  if (selection.kind === "none") return null;

  if (selection.kind === "choose") {
    return (
      <section
        aria-labelledby="tonight-tent-home-heading"
        data-testid="tonight-tent-home-choose"
        className="glass rounded-2xl p-4"
      >
        <h2 id="tonight-tent-home-heading" className="font-display text-lg font-semibold">
          {COPY.chooseHeading}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{COPY.chooseBody}</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {selection.tents.map((tent) => (
            <li key={tent.id}>
              <Button asChild variant="outline" size="sm">
                <Link to={tentDetailPath(tent.id)}>{tent.name}</Link>
              </Button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const hasDemo = metrics.some((m) => m.source === "demo");
  return (
    <section
      aria-labelledby="tonight-tent-home-heading"
      data-testid="tonight-tent-home"
      className="glass rounded-2xl p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          id="tonight-tent-home-heading"
          className="flex items-center gap-2 font-display text-lg font-semibold"
        >
          <Box className="h-5 w-5 text-primary" aria-hidden="true" />
          <Link to={tentDetailPath(selection.tent.id)} className="hover:underline">
            {selection.tent.name}
          </Link>
          {hasDemo && (
            <Badge variant="outline" data-testid="tonight-tent-home-demo">
              {COPY.demo}
            </Badge>
          )}
        </h2>
        <Button asChild size="lg" className="gradient-leaf text-primary-foreground">
          <Link to={logHref} data-testid="tonight-tent-home-log">
            <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
            {COPY.log}
          </Link>
        </Button>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2">
        {metrics.map((metric) => (
          <div
            key={metric.key}
            data-testid={`tonight-tent-home-metric-${metric.key}`}
            data-state={metric.state}
            className="rounded-xl border border-border/50 p-3"
          >
            <dt className="text-xs text-muted-foreground">{metric.label}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">{formatMetricValue(metric)}</dd>
            {metric.sourceLabel && (
              <dd className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                {metric.sourceLabel}
                {metric.ageText ? ` · ${metric.ageText}` : ""}
              </dd>
            )}
          </div>
        ))}
      </dl>

      <p
        className="mt-3 text-sm text-muted-foreground"
        data-testid="tonight-tent-home-last-log"
        data-kind={lastLog.kind}
      >
        {lastLog.text}
      </p>
    </section>
  );
}
