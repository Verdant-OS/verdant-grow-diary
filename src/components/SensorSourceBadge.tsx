/**
 * SensorSourceBadge — small, reusable presenter that renders a sensor
 * reading's *provenance* (source) and *health* (canonical Snapshot
 * Status Contract status) consistently across the app.
 *
 * Safety contract:
 *  - Synthetic/demo data MUST never visually pass as live/healthy.
 *    `source === "demo"` always renders with a non-green DEMO label,
 *    regardless of the status value.
 *  - When `status` is missing/unknown the badge resolves to a
 *    `needs_review` treatment — never defaults to `usable`/healthy.
 *  - No classification logic lives here; the canonical status comes
 *    from `sensorSnapshotStatusContract.ts`. We only map status → tone.
 */
import { cn } from "@/lib/utils";
import {
  mapSensorSnapshotStatusToSeverity,
  type SnapshotStatus,
} from "@/lib/sensorSnapshotStatusContract";
import { resolveSensorSourceLabel } from "@/lib/sensorSourceLabelRules";
import type { SensorReadingSource } from "@/mock";

export interface SensorSourceBadgeProps {
  source: SensorReadingSource;
  /** Pass the canonical status from the contract. Missing → needs_review. */
  status?: SnapshotStatus | null;
  /**
   * Optional hardware vendor lineage (e.g. `metadata.vendor === "ecowitt"`).
   * When provided AND `source === "live"`, the badge renders the vendor
   * label (e.g. "Ecowitt") instead of generic "Live." Stale / invalid /
   * manual / csv / demo readings always keep their canonical label.
   */
  vendor?: string | null;
  className?: string;
  /** Optional override testid (default: "sensor-source-badge"). */
  testId?: string;
}

const STATUS_LABEL: Record<SnapshotStatus, string> = {
  usable: "Usable",
  stale: "Stale",
  invalid: "Invalid",
  needs_review: "Needs review",
  no_data: "No data",
};

/**
 * Visual tone per severity. Only `ok` may render in the green/healthy
 * treatment — every other tone is explicitly non-healthy.
 */
const TONE_CLASS: Record<
  ReturnType<typeof mapSensorSnapshotStatusToSeverity>,
  string
> = {
  ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warning:
    "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  danger: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
  empty: "border-muted-foreground/30 bg-muted/40 text-muted-foreground",
  unknown: "border-muted-foreground/30 bg-muted/40 text-muted-foreground",
};

/** Resolve `status` defensively. Missing → `needs_review`, never `usable`. */
function resolveStatus(
  status: SnapshotStatus | null | undefined,
): SnapshotStatus {
  return status ?? "needs_review";
}

export default function SensorSourceBadge({
  source,
  status,
  className,
  testId = "sensor-source-badge",
}: SensorSourceBadgeProps) {
  const resolvedStatus = resolveStatus(status);
  // Demo data is *always* visually flagged as non-healthy regardless of
  // any caller-supplied status. This is the core "no fake live data" gate.
  const severity =
    source === "demo"
      ? "warning"
      : mapSensorSnapshotStatusToSeverity(resolvedStatus);
  const sourceLabel = SOURCE_LABEL[source];
  const statusLabel = STATUS_LABEL[resolvedStatus];
  const demo = source === "demo";

  return (
    <span
      data-testid={testId}
      data-source={source}
      data-status={resolvedStatus}
      data-severity={severity}
      data-demo={demo ? "true" : "false"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        TONE_CLASS[severity],
        className,
      )}
      title={`Source: ${sourceLabel} · Status: ${statusLabel}`}
    >
      {demo && (
        <span
          data-testid="sensor-source-badge-demo-prefix"
          className="rounded-sm bg-amber-500/30 px-1 py-0.5 text-[9px] font-bold text-amber-900 dark:text-amber-100"
        >
          DEMO
        </span>
      )}
      <span data-testid="sensor-source-badge-source">{sourceLabel}</span>
      <span aria-hidden="true" className="opacity-50">
        ·
      </span>
      <span data-testid="sensor-source-badge-status">{statusLabel}</span>
    </span>
  );
}
