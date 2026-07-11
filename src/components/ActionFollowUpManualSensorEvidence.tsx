/**
 * ActionFollowUpManualSensorEvidence — read-only presenter for a
 * Manual sensor snapshot associated with an existing follow-up.
 *
 * Safety:
 *  - Read-only. No mutation of the sensor snapshot. No writes.
 *  - Renders "Manual" provenance only — never promotes to "Live".
 *  - Never displays the raw snapshot ID or raw_payload.
 *  - Unavailable state uses stable copy: does not hide the outer card.
 */
import { Badge } from "@/components/ui/badge";
import SensorSourceBadge from "@/components/sensor/SensorSourceBadge";
import { cn } from "@/lib/utils";
import type { ManualSnapshotTimelineCard } from "@/lib/manualSensorSnapshotViewModel";

export const ACTION_FOLLOWUP_SENSOR_UNAVAILABLE_COPY =
  "Associated sensor snapshot is unavailable.";

export type ActionFollowUpManualSensorEvidenceState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; card: ManualSnapshotTimelineCard };

export interface ActionFollowUpManualSensorEvidenceProps {
  state: ActionFollowUpManualSensorEvidenceState;
  className?: string;
}

function formatCapturedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const RENDERABLE_FIELDS: ReadonlyArray<{
  field: string;
  label: string;
  digits: number;
}> = [
  { field: "air_temp_c", label: "Temp", digits: 1 },
  { field: "humidity_pct", label: "RH", digits: 0 },
  { field: "vpd_kpa", label: "VPD", digits: 2 },
  { field: "co2_ppm", label: "CO₂", digits: 0 },
  { field: "soil_moisture_pct", label: "Soil", digits: 0 },
];

export default function ActionFollowUpManualSensorEvidence({
  state,
  className,
}: ActionFollowUpManualSensorEvidenceProps) {
  return (
    <div
      data-testid="action-followup-manual-sensor-evidence"
      className={cn(
        "rounded-xl border border-border/40 bg-secondary/20 p-3 space-y-2",
        className,
      )}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="uppercase text-[10px]">
          Associated sensor evidence
        </Badge>
        {state.status === "ready" && (
          <SensorSourceBadge
            source="manual"
            testId="action-followup-manual-sensor-source"
          />
        )}
      </div>

      {state.status === "loading" && (
        <p
          className="text-xs text-muted-foreground"
          data-testid="action-followup-manual-sensor-loading"
        >
          Loading associated snapshot…
        </p>
      )}

      {state.status === "unavailable" && (
        <p
          className="text-xs text-muted-foreground italic"
          data-testid="action-followup-manual-sensor-unavailable"
        >
          {ACTION_FOLLOWUP_SENSOR_UNAVAILABLE_COPY}
        </p>
      )}

      {state.status === "ready" && (
        <>
          <p
            className="text-xs text-muted-foreground"
            data-testid="action-followup-manual-sensor-captured-at"
          >
            Captured {formatCapturedAt(state.card.capturedAt)}
          </p>
          <ul
            className="flex flex-wrap gap-x-3 gap-y-1 text-xs"
            data-testid="action-followup-manual-sensor-metrics"
          >
            {RENDERABLE_FIELDS.map(({ field, label, digits }) => {
              const r = state.card.readings.find((x) => x.field === field);
              if (!r) return null;
              return (
                <li key={field} data-testid={`action-followup-manual-sensor-metric-${field}`}>
                  <span className="text-muted-foreground">{label}: </span>
                  <span>
                    {r.value.toFixed(digits)}
                    {r.unit}
                  </span>
                </li>
              );
            })}
          </ul>
          {state.card.severity !== "ok" && (
            <p
              className="text-[11px] text-amber-500"
              data-testid="action-followup-manual-sensor-warning"
            >
              This Manual snapshot had validation notes. Sensor values
              do not prove the outcome.
            </p>
          )}
        </>
      )}
    </div>
  );
}
