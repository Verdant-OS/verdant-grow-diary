import { formatDistanceToNow } from "date-fns";
import {
  TENT_SENSOR_STRIP_COPY,
  type TentSensorStripFreshness,
} from "@/lib/tentSensorStripRules";

/** Source, age and staleness for the compact sensor strip on Grow → Tent. */
export default function TentSensorStripFreshnessLine({
  freshness,
  testIdPrefix = "tent-detail-sensor-strip",
}: {
  freshness: TentSensorStripFreshness;
  testIdPrefix?: string;
}) {
  if (freshness.kind === "none") {
    return (
      <p
        className="mb-2 text-xs text-muted-foreground"
        data-testid={`${testIdPrefix}-freshness`}
        data-kind="none"
      >
        {TENT_SENSOR_STRIP_COPY.none}
      </p>
    );
  }
  return (
    <p
      className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
      data-testid={`${testIdPrefix}-freshness`}
      data-kind={freshness.kind}
      data-stale={freshness.stale ? "true" : "false"}
    >
      {freshness.kind === "mixed" ? (
        <span>{TENT_SENSOR_STRIP_COPY.mixed}</span>
      ) : (
        <>
          <span className="rounded-md border px-1.5 py-0.5">{freshness.sourceLabel}</span>
          {freshness.capturedAt ? (
            <span data-testid={`${testIdPrefix}-captured`}>
              Captured {formatDistanceToNow(new Date(freshness.capturedAt), { addSuffix: true })}
            </span>
          ) : null}
        </>
      )}
      {freshness.stale ? (
        <span
          className="rounded-md border border-[hsl(var(--warning))] px-1.5 py-0.5 text-[hsl(var(--warning))]"
          data-testid={`${testIdPrefix}-stale`}
        >
          {TENT_SENSOR_STRIP_COPY.stale}
        </span>
      ) : null}
    </p>
  );
}
