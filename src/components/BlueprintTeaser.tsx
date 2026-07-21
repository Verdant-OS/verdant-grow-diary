/**
 * BlueprintTeaser — presenter for the locked-state Pro Blueprint preview.
 *
 * Shown to non-Craft growers above the paywall CTA: a read-only list of the
 * REAL per-stage SOP target bands for this plant's stage, framed as "this is
 * what Craft scores your readings against." No live values, no green/amber/red
 * scoring — that is the paid value, deliberately withheld.
 *
 * Pure presenter: props in, JSX out. No data fetching, no gating, no writes.
 */

import type { BlueprintTeaserRow, BlueprintTeaserViewModel } from "@/lib/blueprintTeaserViewModel";
import { cn } from "@/lib/utils";

function formatBand(row: BlueprintTeaserRow): string {
  const range = `${row.band.min}–${row.band.max}`;
  return row.unit ? `${range} ${row.unit}` : range;
}

export interface BlueprintTeaserProps {
  vm: BlueprintTeaserViewModel;
  className?: string;
  "data-testid"?: string;
}

export function BlueprintTeaser({
  vm,
  className,
  "data-testid": testId = "pro-blueprint-teaser",
}: BlueprintTeaserProps) {
  return (
    <section
      data-testid={testId}
      aria-label="Pro Blueprint target preview"
      className={cn(
        "rounded-3xl border border-dashed border-primary/30 bg-card/50 p-4 sm:p-5",
        className,
      )}
    >
      <header className="mb-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/80">
          Pro Blueprint · preview
        </p>
        <h2
          data-testid={`${testId}-stage`}
          className="font-display text-lg font-bold text-foreground"
        >
          {vm.stageKnown ? `${vm.stageLabel} targets` : "Pro stage targets"}
        </h2>
      </header>

      {vm.stageKnown ? (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            The {vm.targetCount} pro stage targets Craft scores against. Upgrade to see each of your
            live and logged readings scored{" "}
            <span className="font-medium text-emerald-700 dark:text-emerald-400">green</span>,{" "}
            <span className="font-medium text-amber-700 dark:text-amber-400">amber</span> or{" "}
            <span className="font-medium text-red-700 dark:text-red-400">red</span> against them.
          </p>
          <ul className="flex flex-col gap-1.5" data-testid={`${testId}-rows`}>
            {vm.rows.map((row) => (
              <li
                key={row.metricKey}
                data-testid={`${testId}-row-${row.metricKey}`}
                className="flex items-baseline justify-between gap-3 rounded-2xl border border-border/50 bg-background/40 px-3 py-2"
              >
                <span className="font-medium text-foreground">{row.label}</span>
                <span className="tabular-nums text-sm text-muted-foreground">
                  Target {formatBand(row)}
                  {row.context ? ` · ${row.context}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p data-testid={`${testId}-stage-unknown`} className="text-sm text-muted-foreground">
          Set this plant&rsquo;s stage to preview the pro targets Craft scores your readings
          against.
        </p>
      )}
    </section>
  );
}

export default BlueprintTeaser;
