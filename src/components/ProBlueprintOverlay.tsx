/**
 * ProBlueprintOverlay — presenter for the Pro Blueprint live target-band
 * overlay. Renders a `BlueprintOverlayViewModel` as a green/amber/red
 * per-metric readout against the plant's per-stage SOP targets.
 *
 * Pure presenter: props in, JSX out. No data fetching, no gating, no writes.
 * The container (data hooks + entitlement gate) wraps this; PlantDetail mounts
 * the container. See docs/spec-pro-blueprint-overlay.md.
 */

import type {
  BlueprintOverlayRow,
  BlueprintOverlayViewModel,
} from "@/lib/blueprintOverlayViewModel";
import type { BlueprintTone } from "@/lib/blueprintMetricRules";
import { cn } from "@/lib/utils";

const DOT_TONE: Record<BlueprintTone, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  neutral: "bg-muted-foreground/40",
};

const CHIP_TONE: Record<BlueprintTone, string> = {
  green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-600",
  red: "border-red-500/30 bg-red-500/10 text-red-600",
  neutral: "border-border/60 bg-muted/40 text-muted-foreground",
};

const PROVENANCE_LABEL: Record<BlueprintOverlayRow["provenance"], string> = {
  live: "Live",
  manual: "Logged",
  derived: "Computed",
  missing: "No reading",
};

function formatValue(value: number | null, unit: string): string {
  if (value === null || !Number.isFinite(value)) return "—";
  // Whole numbers render clean; fractional values keep up to 2 dp.
  const shown = Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
  return unit ? `${shown} ${unit}` : shown;
}

function formatBand(row: BlueprintOverlayRow): string | null {
  if (!row.band) return null;
  return row.unit
    ? `Target ${row.band.min}–${row.band.max} ${row.unit}`
    : `Target ${row.band.min}–${row.band.max}`;
}

export interface ProBlueprintOverlayProps {
  vm: BlueprintOverlayViewModel;
  className?: string;
  "data-testid"?: string;
}

export function ProBlueprintOverlay({
  vm,
  className,
  "data-testid": testId = "pro-blueprint-overlay",
}: ProBlueprintOverlayProps) {
  const { summary } = vm;
  return (
    <section
      data-testid={testId}
      aria-label="Pro Blueprint target-band overlay"
      className={cn(
        "rounded-3xl border border-border/60 bg-card/70 p-4 shadow-card sm:p-5",
        className,
      )}
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/80">
            Pro Blueprint
          </p>
          <h3
            data-testid={`${testId}-stage`}
            className="font-display text-lg font-bold text-foreground"
          >
            {vm.stageLabel}
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" data-testid={`${testId}-summary`}>
          <SummaryChip tone="green" label="in band" count={summary.green} />
          <SummaryChip tone="amber" label="watch" count={summary.amber} />
          <SummaryChip tone="red" label="out" count={summary.red} />
          <SummaryChip tone="neutral" label="no data" count={summary.missing} />
        </div>
      </header>

      {!vm.stageKnown && (
        <p
          data-testid={`${testId}-stage-unknown`}
          className="mb-3 rounded-2xl border border-dashed border-border/70 bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
        >
          Set this plant&rsquo;s stage to score its readings against the Blueprint.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {vm.rows.map((row) => (
          <BlueprintRow key={row.metricKey} row={row} testIdBase={testId} />
        ))}
      </ul>
    </section>
  );
}

function SummaryChip({
  tone,
  label,
  count,
}: {
  tone: BlueprintTone;
  label: string;
  count: number;
}) {
  return (
    <span
      data-testid={`pro-blueprint-summary-${tone}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        CHIP_TONE[tone],
      )}
    >
      <span className={cn("size-1.5 rounded-full", DOT_TONE[tone])} aria-hidden="true" />
      {count} {label}
    </span>
  );
}

function BlueprintRow({ row, testIdBase }: { row: BlueprintOverlayRow; testIdBase: string }) {
  const tone = row.result.tone;
  const band = formatBand(row);
  return (
    <li
      data-testid={`${testIdBase}-row-${row.metricKey}`}
      data-tone={tone}
      className="flex min-w-0 items-start gap-3 rounded-2xl border border-border/50 bg-background/40 px-3 py-2"
    >
      <span
        className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", DOT_TONE[tone])}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="font-medium text-foreground">{row.label}</span>
          <span
            data-testid={`${testIdBase}-value-${row.metricKey}`}
            className="tabular-nums text-sm text-foreground"
          >
            {formatValue(row.value, row.unit)}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {band && <span>{band}</span>}
          {row.context && <span>· {row.context}</span>}
          <span className="rounded-full bg-muted/50 px-1.5 py-px text-[10px] uppercase tracking-wide">
            {PROVENANCE_LABEL[row.provenance]}
          </span>
        </div>
        {row.nudge && (
          <p
            data-testid={`${testIdBase}-nudge-${row.metricKey}`}
            className="mt-1 text-xs text-primary/80"
          >
            {row.nudge}
          </p>
        )}
      </div>
    </li>
  );
}

export default ProBlueprintOverlay;
