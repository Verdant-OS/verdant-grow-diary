/**
 * AlertsContextHeader — presenter for the Alerts page operator-context
 * panel. All business logic lives in `src/lib/alertFreshnessContext.ts`.
 *
 * Strict UI rules:
 *   - Never claims alerts will persist for non-persistable snapshots.
 *   - Stale / missing / unavailable states never relabeled as healthy.
 *   - Does not expose internal IDs in visible copy.
 *   - Only the `eligible` chip tone renders the success colour.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SlidersHorizontal } from "lucide-react";
import GrowTargetsEditor from "@/components/GrowTargetsEditor";
import {
  SOURCE_ELIGIBILITY_HELP,
  buildSourceChip,
  describeLatestSnapshotForAlerts,
  duplicateReassuranceCopy,
  type AlertsHeaderContextViewModel,
  type SourceChipTone,
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
  /** True when the relevant grow already has at least one open alert.
   * Drives the duplicate-prevention reassurance banner. */
  hasOpenAlerts?: boolean;
  testId?: string;
}

function formatRange(min: number | null, max: number | null): string {
  const lo = min === null ? "—" : String(min);
  const hi = max === null ? "—" : String(max);
  return `${lo}–${hi}`;
}

const CHIP_TONE_CLASS: Record<SourceChipTone, string> = {
  // Success/eligible — reserved for fresh manual/live only.
  eligible:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  // Warning — stale manual/live.
  warning:
    "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  // Context-only — csv/diary/sim.
  context: "border-border bg-muted text-muted-foreground",
  // Caution — invalid/unavailable/unknown.
  caution:
    "border-destructive/40 bg-destructive/10 text-destructive",
};

export default function AlertsContextHeader({
  vm,
  growId,
  freshnessArgs,
  isFallback = false,
  hasOpenAlerts = false,
  testId = "alerts-context-header",
}: Props) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const message = describeLatestSnapshotForAlerts(freshnessArgs);
  const chip = buildSourceChip(freshnessArgs);
  const reassurance = duplicateReassuranceCopy({
    canPersist: vm.alertsCanPersist,
    hasOpenAlerts,
  });
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
        {isFallback && vm.growName ? (
          <p
            className="text-[11px] text-muted-foreground basis-full"
            data-testid={`${testId}-fallback-context`}
          >
            Showing alert context for {vm.growName}.
          </p>
        ) : null}
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

      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${CHIP_TONE_CLASS[chip.tone]}`}
          data-testid={`${testId}-source-chip`}
          data-tone={chip.tone}
          data-can-persist={chip.canPersist ? "true" : "false"}
          aria-label={`Latest snapshot source: ${chip.label}${chip.qualifier ? ` (${chip.qualifier})` : ""}`}
        >
          {chip.label}
          {chip.qualifier ? (
            <span className="opacity-75">· {chip.qualifier}</span>
          ) : null}
        </span>
        <button
          type="button"
          className="text-[10px] underline text-muted-foreground hover:text-foreground"
          onClick={() => setHelpOpen((v) => !v)}
          aria-expanded={helpOpen}
          aria-controls={`${testId}-source-help`}
          data-testid={`${testId}-source-help-toggle`}
        >
          {helpOpen ? "Hide source rules" : "Why?"}
        </button>
      </div>

      {helpOpen ? (
        <div
          id={`${testId}-source-help`}
          className="rounded-md border border-border bg-muted/40 p-2 text-[11px] space-y-1"
          data-testid={`${testId}-source-help`}
          role="region"
          aria-label={SOURCE_ELIGIBILITY_HELP.title}
        >
          <p className="font-medium">{SOURCE_ELIGIBILITY_HELP.title}</p>
          <p data-testid={`${testId}-source-help-eligible`}>
            {SOURCE_ELIGIBILITY_HELP.eligible}
          </p>
          <p data-testid={`${testId}-source-help-context-only`}>
            {SOURCE_ELIGIBILITY_HELP.contextOnly}
          </p>
          <p
            className="text-muted-foreground"
            data-testid={`${testId}-source-help-why`}
          >
            {SOURCE_ELIGIBILITY_HELP.why}
          </p>
        </div>
      ) : null}

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
      {vm.latestDetail ? (
        <p
          className="text-[11px] text-muted-foreground"
          data-testid={`${testId}-latest-detail`}
          data-source={vm.latestSource ?? ""}
          data-inside-window={vm.latestDetail.insideWindow ? "true" : "false"}
          data-can-persist={vm.latestDetail.canPersist ? "true" : "false"}
        >
          {vm.latestDetail.detailLine}
        </p>
      ) : null}
      {reassurance ? (
        <p
          className="text-[11px] rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-800 dark:text-emerald-200"
          role="status"
          data-testid={`${testId}-duplicate-reassurance`}
        >
          {reassurance}
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
