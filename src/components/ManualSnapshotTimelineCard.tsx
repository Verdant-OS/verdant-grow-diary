/**
 * ManualSnapshotTimelineCard — presenter-only card that renders a single
 * manual sensor snapshot for the plant or tent timeline.
 *
 * Hard constraints:
 *  - No business logic in JSX. All mapping (metric → unit, severity) lives
 *    in `manualSensorSnapshotViewModel`.
 *  - Card title is exactly the constant `MANUAL_SNAPSHOT_CARD_TITLE`.
 *  - Source label is exactly the constant `MANUAL_SNAPSHOT_SOURCE_LABEL`
 *    ("Manual"). Never "live", "synced", "connected", or "imported".
 *  - No reads, no writes, no Supabase, no automation.
 */
import { Gauge, AlertTriangle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  MANUAL_SNAPSHOT_CARD_TITLE,
  MANUAL_SNAPSHOT_SOURCE_LABEL,
  type ManualSnapshotTimelineCard as ManualSnapshotTimelineCardModel,
} from "@/lib/manualSensorSnapshotViewModel";
import { formatSensorFieldLabel } from "@/constants/sensorFields";
import { DERIVED_LABEL, formatSensorValue } from "@/lib/sensorFormat";
import { formatSnapshotTimestamp } from "@/lib/dateFormat";

interface Props {
  card: ManualSnapshotTimelineCardModel;
}

function severityIcon(severity: ManualSnapshotTimelineCardModel["severity"]) {
  if (severity === "invalid") return <XCircle className="h-3.5 w-3.5" aria-hidden />;
  if (severity === "warning") return <AlertTriangle className="h-3.5 w-3.5" aria-hidden />;
  return null;
}

export default function ManualSnapshotTimelineCard({ card }: Props) {
  return (
    <Card
      data-testid="manual-snapshot-timeline-card"
      data-card-id={card.id}
      data-severity={card.severity}
      data-source={card.source}
      data-source-label={card.sourceLabel}
      data-tent-level={card.isTentLevel ? "true" : "false"}
      className={cn(
        "border-border/60",
        card.severity === "invalid" && "border-destructive/40",
        card.severity === "warning" && "border-warning/40",
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle
            className="text-sm flex items-center gap-2"
            data-testid="manual-snapshot-timeline-card-title"
          >
            <Gauge className="h-4 w-4" aria-hidden /> {MANUAL_SNAPSHOT_CARD_TITLE}
          </CardTitle>
          <Badge
            variant="secondary"
            className="gap-1"
            data-testid="manual-snapshot-timeline-card-source"
          >
            {MANUAL_SNAPSHOT_SOURCE_LABEL}
          </Badge>
        </div>
        <p
          className="text-xs text-muted-foreground"
          data-testid="manual-snapshot-timeline-card-captured-at"
        >
          {formatSnapshotTimestamp(card.capturedAt)}
        </p>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {card.readings.length > 0 ? (
          <ul
            className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs"
            data-testid="manual-snapshot-timeline-card-readings"
          >
            {card.readings.map((r) => (
              <li
                key={r.field}
                data-testid="manual-snapshot-timeline-card-reading"
                data-field={r.field}
                data-derived={r.derived ? "true" : "false"}
                className="flex items-center justify-between gap-2 rounded-md border border-border/40 px-2 py-1 bg-secondary/20"
              >
                <span className="font-medium">{formatSensorFieldLabel(r.field)}</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="tabular-nums text-muted-foreground">
                    {formatSensorValue(r.field, r.value)}
                  </span>
                  {r.derived && (
                    <Badge
                      variant="outline"
                      className="h-4 px-1 text-[10px] uppercase tracking-wide"
                      data-testid="manual-snapshot-timeline-card-derived-badge"
                    >
                      {DERIVED_LABEL}
                    </Badge>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p
            className="text-xs text-muted-foreground italic"
            data-testid="manual-snapshot-timeline-card-no-readings"
          >
            No usable readings.
          </p>
        )}
        {card.notes && (
          <p
            className="text-xs text-foreground/90"
            data-testid="manual-snapshot-timeline-card-notes"
          >
            {card.notes}
          </p>
        )}
        {(card.errors.length > 0 || card.warnings.length > 0) && (
          <ul
            className="space-y-1 text-xs"
            data-testid="manual-snapshot-timeline-card-validation"
          >
            {card.errors.map((m, i) => (
              <li
                key={`err-${i}`}
                className="flex items-start gap-1.5 text-destructive"
                data-testid="manual-snapshot-timeline-card-error"
              >
                {severityIcon("invalid")}
                <span>{m}</span>
              </li>
            ))}
            {card.warnings.map((m, i) => (
              <li
                key={`warn-${i}`}
                className="flex items-start gap-1.5 text-warning-foreground"
                data-testid="manual-snapshot-timeline-card-warning"
              >
                {severityIcon("warning")}
                <span>{m}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
