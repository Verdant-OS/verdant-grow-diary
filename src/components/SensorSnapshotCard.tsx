/**
 * SensorSnapshotCard — read-only presenter built on the pure
 * `resolveSensorSnapshotDisplay` resolver. Reuses the existing
 * SensorSourceBadge for provenance/status, never renders raw_payload,
 * never implies device control or automation.
 */
import { cn } from "@/lib/utils";
import SensorSourceBadge from "@/components/SensorSourceBadge";
import {
  resolveSensorSnapshotDisplay,
  type SensorSnapshotDisplayModel,
  type SensorSnapshotInput,
  type ResolveOptions,
} from "@/lib/sensorSnapshotFreshnessRules";

export interface SensorSnapshotCardProps {
  /** Raw input — resolver will normalize and freshness-classify it. */
  snapshot?: SensorSnapshotInput | null;
  /** Pre-resolved display model. Wins over `snapshot` when provided. */
  display?: SensorSnapshotDisplayModel | null;
  /** Optional clock injection for tests. */
  resolveOptions?: ResolveOptions;
  className?: string;
  testId?: string;
}

const METRIC_LABEL: Record<string, string> = {
  temp: "Temp",
  rh: "RH",
  vpd: "VPD",
  soil: "Soil",
  ec: "EC",
  ph: "pH",
};

function mapFreshnessToBadgeStatus(
  m: SensorSnapshotDisplayModel,
): "usable" | "stale" | "invalid" | "needs_review" | "no_data" {
  switch (m.freshness) {
    case "fresh":
      return "usable";
    case "stale":
      return "stale";
    case "invalid":
      return "invalid";
    case "demo":
      return "needs_review";
    case "unknown":
    default:
      return "needs_review";
  }
}

export default function SensorSnapshotCard({
  snapshot,
  display,
  resolveOptions,
  className,
  testId = "sensor-snapshot-card",
}: SensorSnapshotCardProps) {
  const model: SensorSnapshotDisplayModel | null =
    display ??
    (snapshot ? resolveSensorSnapshotDisplay(snapshot, resolveOptions) : null);

  if (!model) {
    return (
      <div
        data-testid={`${testId}-empty`}
        className={cn(
          "rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 px-3 py-2 text-xs text-muted-foreground",
          className,
        )}
      >
        No sensor snapshot available.
      </div>
    );
  }

  const badgeStatus = mapFreshnessToBadgeStatus(model);
  const badgeSource =
    model.effectiveSource === "stale" || model.effectiveSource === "invalid"
      ? model.effectiveSource
      : model.effectiveSource;

  return (
    <div
      data-testid={testId}
      data-effective-source={model.effectiveSource}
      data-freshness={model.freshness}
      data-tone={model.tone}
      className={cn(
        "rounded-md border bg-card px-3 py-2 text-xs space-y-2",
        model.freshness === "fresh"
          ? "border-border"
          : model.freshness === "stale"
            ? "border-amber-500/40"
            : model.freshness === "invalid"
              ? "border-red-500/40"
              : "border-amber-500/40",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <SensorSourceBadge source={badgeSource} status={badgeStatus} />
        {model.ageLabel && (
          <span
            data-testid={`${testId}-age`}
            className="text-[11px] text-muted-foreground"
          >
            {model.ageLabel}
          </span>
        )}
        {model.sourceDetail && (
          <span
            data-testid={`${testId}-source-detail`}
            className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
          >
            {model.sourceDetail}
          </span>
        )}
        {typeof model.confidence === "number" && (
          <span
            data-testid={`${testId}-confidence`}
            className="text-[11px] text-muted-foreground"
          >
            conf {(model.confidence * 100).toFixed(0)}%
          </span>
        )}
      </div>

      {model.metrics.length > 0 && (
        <ul
          data-testid={`${testId}-metrics`}
          className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3"
        >
          {model.metrics.map((metric) => (
            <li
              key={metric.key}
              data-testid={`${testId}-metric-${metric.key}`}
              className="flex items-baseline justify-between gap-2"
            >
              <span className="text-muted-foreground">
                {METRIC_LABEL[metric.key] ?? metric.key}
              </span>
              <span className="font-mono tabular-nums">
                {metric.display === null ? "—" : metric.display}
                {metric.unit && metric.display !== null ? (
                  <span className="ml-0.5 text-muted-foreground">
                    {metric.unit}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}

      {model.warning && (
        <p
          data-testid={`${testId}-warning`}
          role="status"
          className={cn(
            "text-[11px] leading-snug",
            model.tone === "danger"
              ? "text-red-700 dark:text-red-300"
              : "text-amber-700 dark:text-amber-300",
          )}
        >
          {model.warning}
        </p>
      )}
    </div>
  );
}
