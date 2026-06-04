/**
 * VpdSnapshotBandChart — small read-only chart showing a snapshot's
 * derived VPD against its canonical target band.
 *
 * Presentational only. All logic lives in
 * `src/lib/vpdSnapshotBandChartViewModel.ts`. No fetch / no Supabase /
 * no alerts / no Action Queue writes / no device control.
 *
 * VPD is DERIVED — this component never labels it "Live".
 */

import {
  buildVpdSnapshotBandChartViewModel,
  type VpdSnapshotBandChartInput,
} from "@/lib/vpdSnapshotBandChartViewModel";

interface Props extends VpdSnapshotBandChartInput {
  testId?: string;
  className?: string;
}

const toneTextClass: Record<string, string> = {
  low: "text-amber-600 dark:text-amber-400",
  in_band: "text-emerald-600 dark:text-emerald-400",
  high: "text-amber-600 dark:text-amber-400",
  stage_unknown: "text-muted-foreground",
  unavailable: "text-muted-foreground",
};

export default function VpdSnapshotBandChart({
  testId = "vpd-snapshot-band-chart",
  className,
  ...input
}: Props) {
  const vm = buildVpdSnapshotBandChartViewModel(input);

  if (!vm.renderable) {
    return (
      <div
        className={`flex flex-col gap-1 text-[11px] ${className ?? ""}`.trim()}
        data-testid={testId}
        data-status={vm.status}
        role="group"
        aria-label={vm.ariaLabel}
      >
        <span className="font-medium text-foreground">{vm.vpdLabel}</span>
        <span
          data-testid={`${testId}-unavailable`}
          className="text-muted-foreground"
        >
          {vm.guidanceLabel}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col gap-1 text-[11px] ${className ?? ""}`.trim()}
      data-testid={testId}
      data-status={vm.status}
      role="group"
      aria-label={vm.ariaLabel}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium text-foreground">{vm.vpdLabel}</span>
        <span
          className={toneTextClass[vm.status]}
          data-testid={`${testId}-value`}
        >
          {vm.currentVpdKpa?.toFixed(2)} kPa
        </span>
      </div>

      <div
        className="relative h-2 w-full rounded-full bg-muted"
        data-testid={`${testId}-axis`}
        aria-hidden="true"
      >
        {vm.bandStartPercent !== null && vm.bandEndPercent !== null && (
          <div
            className="absolute top-0 h-full rounded-full bg-emerald-200/70 dark:bg-emerald-900/40"
            data-testid={`${testId}-band`}
            style={{
              left: `${vm.bandStartPercent}%`,
              width: `${Math.max(vm.bandEndPercent - vm.bandStartPercent, 0)}%`,
            }}
            aria-label={`Target band ${vm.targetBandLabel ?? ""}`}
          />
        )}
        {vm.markerPercent !== null && (
          <div
            className="absolute top-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded bg-foreground"
            data-testid={`${testId}-marker`}
            style={{ left: `${vm.markerPercent}%` }}
            aria-label="Current derived VPD"
          />
        )}
      </div>

      <div className="flex items-center justify-between text-muted-foreground">
        <span data-testid={`${testId}-stage`}>
          {vm.canonicalStageLabel ?? "Stage unknown"}
        </span>
        {vm.targetBandLabel && (
          <span data-testid={`${testId}-target-band`}>
            Target band {vm.targetBandLabel}
          </span>
        )}
      </div>

      <span
        data-testid={`${testId}-guidance`}
        className="text-muted-foreground"
      >
        {vm.guidanceLabel}
      </span>
      <span className="sr-only">{vm.ariaLabel}</span>
    </div>
  );
}
