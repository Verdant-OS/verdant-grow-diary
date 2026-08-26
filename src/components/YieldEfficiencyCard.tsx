/**
 * YieldEfficiencyCard — presenter only.
 *
 * Every number, unit, threshold, and "not measured" reason comes from
 * `src/lib/yieldEfficiencyRules.ts`. No arithmetic, no unit math, and no
 * fallbacks live in this file. A missing operand renders as "Not
 * measured" with the reason the rules module returned.
 */
import { Badge } from "@/components/ui/badge";
import {
  YIELD_EFFICIENCY_MEMORY_NOTE,
  type YieldEfficiencyReport,
  type YieldMetric,
} from "@/lib/yieldEfficiencyRules";

function MetricTile({ label, metric }: { label: string; metric: YieldMetric }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4" data-testid="yield-metric-tile">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      {metric.status === "ok" ? (
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-2xl font-semibold text-foreground">{metric.display}</span>
          <span className="text-sm text-muted-foreground">{metric.unit}</span>
        </div>
      ) : (
        <div className="mt-1 space-y-1">
          <Badge variant="outline" className="text-xs">
            Not measured
          </Badge>
          <p className="text-xs text-muted-foreground">{metric.message}</p>
        </div>
      )}
    </div>
  );
}

export default function YieldEfficiencyCard({ report }: { report: YieldEfficiencyReport }) {
  return (
    <section
      className="rounded-xl border border-border bg-background p-4 space-y-3"
      data-testid="yield-efficiency-card"
      aria-labelledby="yield-efficiency-heading"
    >
      <div>
        <h2 id="yield-efficiency-heading" className="text-lg font-semibold text-foreground">
          Yield efficiency
        </h2>
        <p className="text-sm text-muted-foreground">{YIELD_EFFICIENCY_MEMORY_NOTE}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricTile label="Grams per watt" metric={report.gramsPerWatt} />
        <MetricTile
          label={`Grams per ${report.totals.footprintUnit}`}
          metric={report.gramsPerArea}
        />
        <MetricTile label="Wet → dry conversion" metric={report.wetToDryRatioPct} />
      </div>

      <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-4">
        <div>
          <dt className="font-medium text-foreground">Dry weight</dt>
          <dd>
            {report.totals.dryWeightGrams === null
              ? "Not logged"
              : `${report.totals.dryWeightGrams.toFixed(1)} g`}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-foreground">Wet weight</dt>
          <dd>
            {report.totals.wetWeightGrams === null
              ? "Not logged"
              : `${report.totals.wetWeightGrams.toFixed(1)} g`}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-foreground">Light wattage</dt>
          <dd>{report.totals.wattage === null ? "Not saved" : `${report.totals.wattage} W`}</dd>
        </div>
        <div>
          <dt className="font-medium text-foreground">Footprint</dt>
          <dd>
            {report.totals.footprintArea === null
              ? "Not resolved"
              : `${report.totals.footprintArea.toFixed(2)} ${report.totals.footprintUnit}`}
          </dd>
        </div>
      </dl>
    </section>
  );
}
