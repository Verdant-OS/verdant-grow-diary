/**
 * QuickLogSensorSnapshotStrip — presenter-only pre-save sensor snapshot
 * strip for the Quick Log dialog.
 *
 * Reads the latest sensor snapshot for the selected plant's tent via
 * the realtime-aware `useLatestTentSensorSnapshot(tentId)` hook
 * (`src/lib/sensor.ts`) and renders a compact status strip derived from
 * the strict resolver in `latestSensorSnapshotRules.ts` via the
 * `buildQuickLogStripFromTentState` adapter.
 *
 * No classification rules live in this file. No writes. No automation.
 * Action buttons are navigation-only and point at /sensors. The strip
 * never promotes provider labels (ecowitt, home_assistant, ...) to Live —
 * only the strict resolver's `fresh_live` status counts as Live.
 */

import { Gauge } from "lucide-react";
import { useLatestTentSensorSnapshot } from "@/lib/sensor";
import {
  buildQuickLogStripFromTentState,
  type QuickLogSnapshotStripStatus,
} from "@/lib/quickLogSnapshotStripAdapter";
import SnapshotTrustBadge from "@/components/SnapshotTrustBadge";
import { buildQuickLogSensorSnapshotViewModel } from "@/lib/quickLogSensorSnapshotViewModel";
import { adaptQuickLogSensorContextInput } from "@/lib/quickLogSensorSnapshotViewModelAdapter";


interface Props {
  growId?: string | null | undefined;
  tentId: string | null | undefined;
  /**
   * Whether the grower's "Attach sensor snapshot" toggle is on. When
   * omitted, defaults to true so legacy callers/tests keep their behavior.
   */
  attached?: boolean;
}

const TONE: Record<QuickLogSnapshotStripStatus, string> = {
  usable: "border-emerald-500/40 bg-emerald-500/5",
  stale: "border-amber-500/40 bg-amber-500/5",
  invalid: "border-destructive/40 bg-destructive/5",
  no_data: "border-border/60 bg-secondary/30",
};

const PILL_TONE: Record<QuickLogSnapshotStripStatus, string> = {
  usable: "bg-emerald-500/15 text-emerald-300",
  stale: "bg-amber-500/15 text-amber-300",
  invalid: "bg-destructive/15 text-destructive",
  no_data: "bg-muted text-muted-foreground",
};

const PILL_LABEL: Record<QuickLogSnapshotStripStatus, string> = {
  usable: "Usable",
  stale: "Stale",
  invalid: "Invalid",
  no_data: "No data",
};

const PILL_ARIA: Record<QuickLogSnapshotStripStatus, string> = {
  usable: "Sensor snapshot status: usable",
  stale: "Sensor snapshot status: stale",
  invalid: "Sensor snapshot status: invalid",
  no_data: "Sensor snapshot status: no data",
};

export default function QuickLogSensorSnapshotStrip({ growId: _growId, tentId, attached = true }: Props) {
  const state = useLatestTentSensorSnapshot(tentId ?? null);
  const view = buildQuickLogStripFromTentState({
    status: state.status,
    snapshot: state.snapshot,
    hasTent: !!tentId,
    attached,
  });

  // Additive: derive a single consistent freshness/empty advisory line
  // from the new pure view-model so growers see one canonical warning
  // copy before saving. This does NOT change the save path.
  const vm = buildQuickLogSensorSnapshotViewModel(
    adaptQuickLogSensorContextInput({
      state: { status: state.status, snapshot: state.snapshot },
      tentId: tentId ?? null,
      attached,
    }),
  );
  const advisory =
    vm.display && vm.display.freshness === "fresh" ? null : vm.warning ?? vm.emptyCopy;
  const advisoryKind = vm.display
    ? vm.display.freshness
    : vm.emptyCopy
      ? "missing"
      : null;

  return (
    <section
      data-testid="quicklog-sensor-snapshot-strip"
      data-status={view.status}
      aria-label="Sensor snapshot summary"
      className={`rounded-lg border p-3 space-y-2 ${TONE[view.status]}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium">
          <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
          {view.title}
        </span>
        <div className="flex items-center gap-1.5">
          {view.providerLabel && (
            <span
              data-testid="quicklog-sensor-snapshot-source"
              data-source={view.providerLabel}
              aria-label={`Sensor source: ${view.providerLabel}`}
              className="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-muted/60 text-muted-foreground"
            >
              source: {view.providerLabel}
            </span>
          )}

          <span
            data-testid="quicklog-sensor-snapshot-pill"
            role="status"
            aria-label={PILL_ARIA[view.status]}
            className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 ${PILL_TONE[view.status]}`}
          >
            {PILL_LABEL[view.status]}
          </span>

          <SnapshotTrustBadge view={view.trustBadge} showProvider={false} />


        </div>
      </div>

      <p className="text-[12px] text-muted-foreground leading-snug">{view.description}</p>

      {(view.ageLabel || view.metrics.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {view.ageLabel && (
            <span data-testid="quicklog-sensor-snapshot-age">Captured {view.ageLabel}</span>
          )}
          {view.metrics.map((m) => (
            <span key={m.label} data-testid={`quicklog-sensor-snapshot-metric-${m.label.toLowerCase()}`}>
              <span className="text-muted-foreground/70">{m.label}</span>{" "}
              <span className="text-foreground">{m.value}</span>
            </span>
          ))}
        </div>
      )}


      {view.action.kind !== "none" && (
        <a
          href={view.action.href}
          data-testid="quicklog-sensor-snapshot-action"
          data-action-kind={view.action.kind}
          aria-label={`${view.action.label} — opens sensors page`}
          className="inline-flex items-center text-[12px] font-medium text-primary hover:underline rounded-sm focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {view.action.label}
        </a>
      )}
    </section>
  );
}
