/**
 * QuickLogSensorSnapshotStrip — presenter-only pre-save sensor snapshot
 * strip for the Quick Log dialog.
 *
 * Reads the latest sensor snapshot for the selected plant's tent via
 * `useLatestSensorSnapshot` and renders a compact status strip derived
 * from `buildQuickLogSnapshotStrip` (which delegates to the canonical
 * `sensorSnapshotStatusContract`).
 *
 * No classification rules live in this file. No writes. No automation.
 * Action buttons are navigation-only and point at /sensors.
 */
import { Link } from "react-router-dom";
import { Gauge } from "lucide-react";
import { useLatestSensorSnapshot } from "@/hooks/useLatestSensorSnapshot";
import {
  buildQuickLogSnapshotStrip,
  type QuickLogSnapshotStripStatus,
} from "@/lib/quickLogSnapshotStripAdapter";

interface Props {
  growId: string | null | undefined;
  tentId: string | null | undefined;
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

export default function QuickLogSensorSnapshotStrip({ growId, tentId }: Props) {
  const tentIds = tentId ? [tentId] : [];
  const state = useLatestSensorSnapshot(growId ?? null, tentIds);
  const view = buildQuickLogSnapshotStrip({
    snapshot: state.snapshot,
    loading: state.status === "loading",
    hasTent: !!tentId,
  });

  return (
    <section
      data-testid="quicklog-sensor-snapshot-strip"
      data-status={view.status}
      className={`rounded-lg border p-3 space-y-2 ${TONE[view.status]}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium">
          <Gauge className="h-3.5 w-3.5" />
          {view.title}
        </span>
        <span
          data-testid="quicklog-sensor-snapshot-pill"
          className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 ${PILL_TONE[view.status]}`}
        >
          {PILL_LABEL[view.status]}
        </span>
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
        <Link
          to={view.action.href}
          data-testid="quicklog-sensor-snapshot-action"
          data-action-kind={view.action.kind}
          className="inline-flex items-center text-[12px] font-medium text-primary hover:underline"
        >
          {view.action.label}
        </Link>
      )}
    </section>
  );
}
