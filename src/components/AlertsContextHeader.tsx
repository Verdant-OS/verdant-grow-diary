/**
 * AlertsContextHeader — presenter for the Alerts page operator-context
 * panel. All business logic lives in `src/lib/alertFreshnessContext.ts`.
 *
 * Strict UI rules:
 *   - Never claims alerts will persist for non-persistable snapshots.
 *   - Stale / missing / unavailable states never relabeled as healthy.
 *   - Does not expose internal IDs in visible copy.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SlidersHorizontal } from "lucide-react";
import GrowTargetsEditor from "@/components/GrowTargetsEditor";
import {
  describeLatestSnapshotForAlerts,
  type AlertsHeaderContextViewModel,
} from "@/lib/alertFreshnessContext";

interface Props {
  vm: AlertsHeaderContextViewModel;
  growId?: string | null;
  /** Pass-through to the pure helper for deterministic tests. */
  now?: number;
  /** Echoed back from buildAlertsHeaderContext args so the stale-copy
   * helper can be re-run without re-passing the whole snapshot. */
  freshnessArgs: Parameters<typeof describeLatestSnapshotForAlerts>[0];
  /** When true, the header is showing a fallback grow context (not
   * scoped via ?growId=). Renders a small "Showing alert context for X"
   * note so the operator knows which grow is being used. */
  isFallback?: boolean;
  testId?: string;
}

function formatRange(min: number | null, max: number | null): string {
  const lo = min === null ? "—" : String(min);
  const hi = max === null ? "—" : String(max);
  return `${lo}–${hi}`;
}

export default function AlertsContextHeader({
  vm,
  growId,
  freshnessArgs,
  isFallback = false,
  testId = "alerts-context-header",
}: Props) {
  const [editorOpen, setEditorOpen] = useState(false);
  const message = describeLatestSnapshotForAlerts(freshnessArgs);
  const persistNote = vm.alertsCanPersist
    ? `Manual/live snapshots must be under ${vm.freshnessWindowLabel.replace(" alert window", "")} old to persist alerts.`
    : `Alerts will not persist from the current snapshot — needs a fresh manual or live reading inside the ${vm.freshnessWindowLabel}.`;

  return (
    <section
      className="glass rounded-2xl p-3 mb-3 space-y-1"
      data-testid={testId}
      aria-label="Alert context"
    >
      <div className="flex items-start gap-2 flex-wrap">
        <p className="text-xs font-medium" data-testid={`${testId}-summary`}>
          <span className="text-muted-foreground">Alert context: </span>
          {vm.stageLabel ? (
            <span data-testid={`${testId}-stage`}>
              Using <strong>{vm.stageLabel}</strong> targets.{" "}
            </span>
          ) : (
            <span data-testid={`${testId}-stage-missing`}>
              No active stage target set.{" "}
            </span>
          )}
          {vm.ranges.rh ? (
            <span data-testid={`${testId}-range-rh`}>
              RH {formatRange(vm.ranges.rh.min, vm.ranges.rh.max)}
              {vm.ranges.rh.unit}.{" "}
            </span>
          ) : null}
          {vm.ranges.temp ? (
            <span data-testid={`${testId}-range-temp`}>
              Temp {formatRange(vm.ranges.temp.min, vm.ranges.temp.max)}
              {vm.ranges.temp.unit}.{" "}
            </span>
          ) : null}
          {vm.ranges.vpd ? (
            <span data-testid={`${testId}-range-vpd`}>
              VPD {formatRange(vm.ranges.vpd.min, vm.ranges.vpd.max)}{" "}
              {vm.ranges.vpd.unit}.{" "}
            </span>
          ) : null}
        </p>
        {growId ? (
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() => setEditorOpen(true)}
            data-testid={`${testId}-manage-targets`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Manage Targets
          </Button>
        ) : null}
      </div>
      <p
        className="text-[11px] text-muted-foreground"
        data-testid={`${testId}-freshness-window`}
      >
        {persistNote}
      </p>
      {message ? (
        <p
          className="text-[11px]"
          data-testid={`${testId}-latest-message`}
          data-freshness={vm.latestFreshness}
          data-source={vm.latestSource ?? ""}
        >
          <span
            className={
              vm.latestFreshness === "fresh"
                ? "text-emerald-700 dark:text-emerald-300"
                : "text-amber-700 dark:text-amber-300"
            }
          >
            {message}
          </span>
        </p>
      ) : null}
      {growId ? (
        <GrowTargetsEditor
          open={editorOpen}
          onOpenChange={setEditorOpen}
          growId={growId}
        />
      ) : null}
    </section>
  );
}
