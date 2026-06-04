/**
 * VpdTimelineStatusWidget — small read-only diary-timeline widget showing
 * canonical stage, target band status, and review-first guidance.
 *
 * Presentational only. All logic lives in
 * `src/lib/vpdTimelineStatusViewModel.ts`. No fetch / no Supabase /
 * no alerts / no Action Queue writes / no device control.
 *
 * VPD is DERIVED — this widget never labels it "Live", and guidance is
 * review-first only (no nutrient / irrigation / equipment / device
 * recommendations).
 */

import {
  buildVpdTimelineStatusViewModel,
  type VpdTimelineStatusInput,
} from "@/lib/vpdTimelineStatusViewModel";

interface Props extends VpdTimelineStatusInput {
  testId?: string;
  className?: string;
}

const toneTextClass: Record<string, string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  muted: "text-muted-foreground",
  unavailable: "text-muted-foreground",
};

export default function VpdTimelineStatusWidget({
  testId = "vpd-timeline-status-widget",
  className,
  ...input
}: Props) {
  const vm = buildVpdTimelineStatusViewModel(input);

  if (!vm.shouldRender) {
    return null;
  }

  return (
    <div
      className={`flex flex-col gap-0.5 text-[11px] ${className ?? ""}`.trim()}
      data-testid={testId}
      data-status={vm.status}
      role="group"
      aria-label={`Derived VPD timeline status: ${vm.statusLabel}`}
    >
      <div className="flex items-center gap-1.5">
        <span className="font-medium text-foreground">{vm.vpdLabel}</span>
        {vm.vpdKpa !== null && (
          <span
            className="text-muted-foreground"
            data-testid={`${testId}-value`}
          >
            ≈ {vm.vpdKpa.toFixed(2)} kPa
          </span>
        )}
        <span
          className={toneTextClass[vm.tone]}
          data-testid={`${testId}-status`}
        >
          · {vm.statusLabel}
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span data-testid={`${testId}-stage`}>
          {vm.canonicalStageLabel ?? "Stage unknown"}
        </span>
        {vm.targetBandLabel && (
          <span data-testid={`${testId}-band`}>
            · target {vm.targetBandLabel}
          </span>
        )}
      </div>
      <span
        data-testid={`${testId}-guidance`}
        className="text-muted-foreground"
      >
        {vm.guidanceLabel}
      </span>
    </div>
  );
}
