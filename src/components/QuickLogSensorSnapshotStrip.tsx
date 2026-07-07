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

import { Gauge, History } from "lucide-react";
import { useLatestTentSensorSnapshot } from "@/lib/sensor";
import {
  buildQuickLogStripFromTentState,
  type QuickLogSnapshotStripStatus,
} from "@/lib/quickLogSnapshotStripAdapter";
import SnapshotTrustBadge from "@/components/SnapshotTrustBadge";
import { buildQuickLogSensorSnapshotViewModel } from "@/lib/quickLogSensorSnapshotViewModel";
import { adaptQuickLogSensorContextInput } from "@/lib/quickLogSensorSnapshotViewModelAdapter";
import {
  encodeManualCorrectionHash,
  hasCorrectableOriginalIds,
  type ManualCorrectionMetric,
} from "@/lib/manualSensorCorrectionContext";


interface Props {
  growId?: string | null | undefined;
  tentId: string | null | undefined;
  /**
   * Whether the grower's "Attach sensor snapshot" toggle is on. When
   * omitted, defaults to true so legacy callers/tests keep their behavior.
   */
  attached?: boolean;
  /**
   * Per-metric ORIGINAL sensor_readings row IDs for the currently-shown
   * MANUAL snapshot. When supplied AND at least one is a real uuid AND
   * the resolved source is manual, the strip renders a "Correct manual
   * reading" link that deep-links to /sensors#manual-reading with the
   * correction context. Never inferred from timestamp/metric — callers
   * must pass real IDs. When absent, the affordance is hidden.
   */
  manualReadingIds?: Partial<Record<ManualCorrectionMetric, string>>;
  /** Captured_at of the currently-shown manual snapshot (for the banner). */
  manualCapturedAt?: string | null;
  /** Optional numeric values for prefill; safe subset only. */
  manualValues?: Partial<Record<ManualCorrectionMetric, number>>;
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

// Canonical-badge contract: the SnapshotTrustBadge is the authoritative
// sensor-truth signal (Live/Stale/Invalid/Manual/Demo/CSV) and must
// always render so growers (and the trust-badge tests) can read it.
// When the secondary status pill would repeat the exact same visible
// label as the canonical badge, we suppress the pill text instead —
// never the badge. The dedupe comparison is case-insensitive and
// trim-normalized but does not change user-facing copy.
function shouldRenderTrustBadge(_status: QuickLogSnapshotStripStatus, _trustLabel: string): boolean {
  // Always render the canonical trust badge. See isPillRedundantWithBadge
  // for the inverse decision used to hide the duplicate pill label.
  return true;
}

function isPillRedundantWithBadge(
  status: QuickLogSnapshotStripStatus,
  trustLabel: string,
): boolean {
  if (!trustLabel) return false;
  return trustLabel.trim().toLowerCase() === PILL_LABEL[status].toLowerCase();
}

export default function QuickLogSensorSnapshotStrip({
  growId: _growId,
  tentId,
  attached = true,
  manualReadingIds,
  manualCapturedAt,
  manualValues,
}: Props) {
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
  const showTrustBadge = shouldRenderTrustBadge(view.status, view.trustBadge.label);
  const pillIsRedundant = isPillRedundantWithBadge(view.status, view.trustBadge.label);

  // "Correct manual reading" affordance — only for manual snapshots
  // with real original reading IDs supplied by the caller. Never
  // inferred from timestamp/metric. Hidden for live/demo/csv/stale/
  // invalid snapshots and when tentId is missing.
  const effectiveSource = vm.display?.effectiveSource ?? null;
  const correctionHref =
    tentId &&
    effectiveSource === "manual" &&
    manualCapturedAt &&
    hasCorrectableOriginalIds(manualReadingIds)
      ? `/sensors${encodeManualCorrectionHash({
          tentId,
          originalCapturedAt: manualCapturedAt,
          originalReadingIds: manualReadingIds ?? {},
          originalValues: manualValues ?? {},
        })}`
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

          {/*
            Canonical strip status pill: ALWAYS rendered so growers and
            tests can read the resolver-derived status (Usable / Stale /
            Invalid / No data) with role="status" + a deterministic
            aria-label. `pillIsRedundant` is retained for the
            dedupe-rule source check but no longer gates the pill —
            suppressing the pill removed required stale/invalid
            user-facing copy. The trust badge below is the surface that
            yields when its label duplicates the pill.
          */}
          <span
            data-testid="quicklog-sensor-snapshot-pill"
            data-pill-redundant={pillIsRedundant ? "true" : "false"}
            role="status"
            aria-label={PILL_ARIA[view.status]}
            className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 ${PILL_TONE[view.status]}`}
          >
            {PILL_LABEL[view.status]}
          </span>

          {showTrustBadge && <SnapshotTrustBadge view={view.trustBadge} showProvider={false} />}


        </div>
      </div>

      <p className="text-[12px] text-muted-foreground leading-snug">{view.description}</p>

      {advisory && (
        <p
          data-testid="quicklog-sensor-snapshot-advisory"
          data-advisory-kind={advisoryKind ?? "missing"}
          role="note"
          className="text-[11px] leading-snug text-muted-foreground"
        >
          {advisory}
        </p>
      )}

      {(view.ageLabel || view.capturedAtLabel || view.metrics.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {view.ageLabel && (
            <span data-testid="quicklog-sensor-snapshot-age">Captured {view.ageLabel}</span>
          )}
          {view.capturedAtLabel && (
            <span
              data-testid="quicklog-sensor-snapshot-captured-at"
              title={view.capturedAt ?? undefined}
            >
              Captured: {view.capturedAtLabel}
            </span>
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
      {correctionHref && (
        <a
          href={correctionHref}
          data-testid="quicklog-sensor-snapshot-correct-action"
          aria-label="Correct manual reading — opens sensors page"
          className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline rounded-sm focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <History className="h-3 w-3" aria-hidden />
          Correct manual reading
        </a>
      )}
    </section>
  );
}
