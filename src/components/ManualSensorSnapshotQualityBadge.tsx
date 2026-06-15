/**
 * ManualSensorSnapshotQualityBadge — presenter-only.
 *
 * Renders a calm, read-only quality badge for a manual / current sensor
 * snapshot so growers can see at a glance whether the reading is usable
 * for AI Doctor context + Action Queue suggestion preview eligibility.
 *
 * Hard constraints (stop-ship if violated):
 *  - No data fetching. No Supabase. No writes. No alerts. No automation.
 *  - Never renders raw_payload, secrets, vendor private fields, or fixture
 *    JSON. Reasons come only from the pure helper.
 *  - Never claims live when source is csv / demo / stale / invalid /
 *    unknown. Never classifies invalid/stale data as healthy.
 */
import { Badge } from "@/components/ui/badge";
import {
  MANUAL_SNAPSHOT_QUALITY_SOURCE_LABELS,
  type ManualSensorSnapshotQuality,
} from "@/lib/manualSensorSnapshotQualityRules";

export interface ManualSensorSnapshotQualityBadgeProps {
  readonly evaluation: ManualSensorSnapshotQuality;
  readonly className?: string;
}

const VARIANT_BY_QUALITY: Record<
  ManualSensorSnapshotQuality["quality"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  usable: "default",
  needs_review: "secondary",
  invalid: "destructive",
  missing: "outline",
};

export function ManualSensorSnapshotQualityBadge({
  evaluation,
  className,
}: ManualSensorSnapshotQualityBadgeProps) {
  const sourceLabel =
    MANUAL_SNAPSHOT_QUALITY_SOURCE_LABELS[evaluation.sourceLabel];
  const status = `Quality: ${evaluation.summary}`;
  return (
    <section
      className={className}
      aria-label="Manual sensor snapshot quality"
      data-testid="manual-snapshot-quality"
      data-quality={evaluation.quality}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={VARIANT_BY_QUALITY[evaluation.quality]}>
          {evaluation.summary}
        </Badge>
        <span className="text-xs text-muted-foreground">{sourceLabel}</span>
      </div>
      <p className="sr-only" role="status">
        {status}. {sourceLabel}.
      </p>
      {evaluation.reasons.length > 0 ? (
        <ul className="mt-2 list-disc pl-4 text-xs text-muted-foreground">
          {evaluation.reasons.map((reason, i) => (
            <li key={`${i}-${reason}`}>{reason}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export default ManualSensorSnapshotQualityBadge;
