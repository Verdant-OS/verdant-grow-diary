/**
 * SensorSourceBadge — presenter-only badge for sensor provenance.
 *
 * No data fetching. No writes. No automation language. Demo/stale/invalid
 * are visually and textually distinct from live.
 */
import { cn } from "@/lib/utils";
import {
  normalizeSensorSource,
  sensorSourceLabel,
  type SensorSource,
} from "@/lib/sensor/sensorSourceRules";

export interface SensorSourceBadgeProps {
  source: SensorSource | string;
  className?: string;
  testId?: string;
}

const TONE: Record<SensorSource, string> = {
  live: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  manual: "border-primary/40 bg-primary/10 text-primary",
  csv: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  demo: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  stale: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  invalid: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
};

export default function SensorSourceBadge({
  source,
  className,
  testId = "sensor-source-badge",
}: SensorSourceBadgeProps) {
  const resolved = normalizeSensorSource(source);
  const label = sensorSourceLabel(resolved);

  return (
    <span
      data-testid={testId}
      data-source={resolved}
      role="status"
      aria-label={`Sensor source: ${label}`}
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        TONE[resolved],
        className,
      )}
    >
      {label}
    </span>
  );
}
