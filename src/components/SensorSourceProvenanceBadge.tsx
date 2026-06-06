/**
 * SensorSourceProvenanceBadge — thin presenter that renders the unified
 * sensor-source badge model from `buildSensorSourceBadge`. This is the
 * One-Tent Loop's shared source/provenance chip:
 *
 *   - Manual readings render as "Manual reading" (and never as Live).
 *   - Live readings render as "Live" or the promoted vendor label.
 *   - Demo / stale / invalid / unknown render with a degraded tone, so
 *     they cannot visually pass as healthy live telemetry.
 *
 * Pure presenter — no I/O, no writes, no automation. All label and tone
 * rules live in `src/lib/sensorSourceLabelViewModel.ts`.
 */
import { cn } from "@/lib/utils";
import {
  buildSensorSourceBadge,
  sourceBadgeToneClass,
  type BuildSensorSourceBadgeInput,
} from "@/lib/sensorSourceLabelViewModel";

export interface SensorSourceProvenanceBadgeProps
  extends BuildSensorSourceBadgeInput {
  className?: string;
  /** Override testid. Default: "sensor-source-provenance-badge". */
  testId?: string;
}

export default function SensorSourceProvenanceBadge({
  className,
  testId = "sensor-source-provenance-badge",
  ...input
}: SensorSourceProvenanceBadgeProps) {
  const badge = buildSensorSourceBadge(input);
  return (
    <span
      data-testid={testId}
      data-source={input.source ?? "unknown"}
      data-tone={badge.tone}
      data-degraded={badge.isDegraded ? "true" : "false"}
      data-manual={badge.isManual ? "true" : "false"}
      aria-label={badge.ariaLabel}
      title={badge.ariaLabel}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        sourceBadgeToneClass(badge.tone),
        className,
      )}
    >
      {badge.label}
    </span>
  );
}
