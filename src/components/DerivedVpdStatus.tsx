/**
 * DerivedVpdStatus — presentational-only component for derived VPD + stage
 * target status. No business rules live here; consult
 * `buildDerivedVpdStatusViewModel` in src/lib for all logic.
 *
 * Safety:
 *  - Read-only UI. No writes, no fetch, no supabase client, no
 *    edge-function invocation, no device control.
 *  - VPD is DERIVED and is never labeled "Live".
 */

import { Info } from "lucide-react";
import {
  buildDerivedVpdStatusViewModel,
  type DerivedVpdStatusInput,
} from "@/lib/derivedVpdStatusViewModel";

interface Props extends DerivedVpdStatusInput {
  testId?: string;
  className?: string;
}

const toneClasses: Record<string, string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  muted: "text-muted-foreground",
  unavailable: "text-muted-foreground",
};

export default function DerivedVpdStatus({
  testId = "derived-vpd-status",
  className,
  ...input
}: Props) {
  const vm = buildDerivedVpdStatusViewModel(input);

  return (
    <div
      className={`flex flex-col gap-1 text-[11px] ${className ?? ""}`.trim()}
      data-testid={testId}
      data-classification={vm.classification}
    >
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span className="font-medium text-foreground">{vm.vpdLabel}</span>
        {vm.available ? (
          <span data-testid={`${testId}-value`}>
            ≈ <strong>{vm.vpdKpa} kPa</strong>
          </span>
        ) : (
          <span data-testid={`${testId}-unavailable`}>VPD unavailable</span>
        )}
        <span
          title={vm.helpCopy}
          role="img"
          aria-label="Derived VPD help"
          className="inline-flex"
        >
          <Info className="h-3 w-3 opacity-60" />
        </span>
      </div>
      <div className={`flex items-center gap-1.5 ${toneClasses[vm.statusTone]}`}>
        <span data-testid={`${testId}-status`}>{vm.statusLabel}</span>
        {vm.targetBandLabel && vm.classification !== "stage_unknown" && (
          <span
            className="text-muted-foreground"
            data-testid={`${testId}-band`}
          >
            (target {vm.targetBandLabel})
          </span>
        )}
      </div>
      <span className="sr-only">{vm.helpCopy}</span>
    </div>
  );
}
