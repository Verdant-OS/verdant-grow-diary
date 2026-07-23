/**
 * Render-only panel: recent diary activity for one plant.
 *
 * Reads from the existing `diary_entries` table (same source QuickLog writes
 * to). No writes. No sensor_readings access. No action_queue / alerts.
 */
import { Link } from "react-router-dom";
import { ArrowRight, Camera, Gauge, NotebookPen, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePlantRecentActivity } from "@/hooks/usePlantRecentActivity";
import { tentDetailPath, timelinePath } from "@/lib/routes";

import {
  buildPlantRecentActivity,
  type PlantRecentActivityRow,
} from "@/lib/plantRecentActivityRules";
import {
  PHOTO_NON_DIAGNOSTIC_LABEL,
  PHOTO_NON_DIAGNOSTIC_TESTID,
} from "@/lib/photoEventNonDiagnosticLabelRules";
import {
  describeQuickLogDetailsFromExtras,
  type QuickLogDetailDisplayLine,
} from "@/lib/quickLogActivityDetailFields";

interface Props {
  plantId: string | null | undefined;
  plantName?: string | null;
}

function EntryRow({
  row,
  plantName,
  detailLines,
}: {
  row: PlantRecentActivityRow;
  plantName?: string | null;
  detailLines: readonly QuickLogDetailDisplayLine[];
}) {
  return (
    <li
      className="rounded-lg border bg-card/40 p-3 text-sm"
      data-testid="plant-recent-activity-row"
      data-entry-id={row.id}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="capitalize" data-testid="plant-recent-activity-event-type">
            {row.eventType}
          </Badge>
          {row.isManualEntry ? (
            <Badge
              variant="outline"
              className="gap-1 text-[10px] uppercase tracking-wide border-primary/40 text-primary"
              data-testid="plant-recent-activity-manual-badge"
              title="Logged manually via Quick Log"
            >
              Manual entry
            </Badge>
          ) : null}
          <span className="text-xs text-muted-foreground" data-testid="plant-recent-activity-timestamp">
            {row.occurredAtLabel}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {row.hasPhoto ? (
            <Badge variant="outline" className="gap-1" data-testid="plant-recent-activity-photo-badge">
              <Camera className="h-3 w-3" /> Photo
            </Badge>
          ) : null}
          {row.hasSnapshot ? (
            <Badge
              variant="outline"
              className="gap-1"
              data-testid="plant-recent-activity-snapshot-badge"
            >
              <Gauge className="h-3 w-3" /> Snapshot
              {row.snapshotSourceLabel ? ` · ${row.snapshotSourceLabel}` : ""}
              {row.snapshotStale ? " · Stale" : ""}
            </Badge>
          ) : null}
        </div>
      </div>
      {detailLines.length > 0 ? (
        <ul
          className="mt-2 flex flex-wrap gap-1.5"
          data-testid="plant-recent-activity-detail-lines"
        >
          {detailLines.map((line) => (
            <li key={line.key}>
              <Badge
                variant="outline"
                className="text-[11px] font-normal"
                data-testid={`plant-recent-activity-detail-${line.key}`}
              >
                {line.label}: {line.value}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
      {row.notePreview ? (
        <p className="mt-2 text-sm leading-snug">{row.notePreview}</p>
      ) : !row.hasHardwareReadings && detailLines.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground italic">No note</p>
      ) : null}
      {row.hasPhoto && row.showPhotoNonDiagnosticLabel ? (
        <div
          data-testid={PHOTO_NON_DIAGNOSTIC_TESTID}
          className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground/80"
        >
          {PHOTO_NON_DIAGNOSTIC_LABEL}
        </div>
      ) : null}
      {row.hasHardwareReadings ? (
        <div
          className="mt-2 rounded-md border border-dashed bg-muted/40 p-2"
          data-testid="plant-recent-activity-hardware-readings"
        >
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Wrench className="h-3 w-3" />
            Manual handheld readings
          </div>
          {row.hardwareReadingLines.length > 0 ? (
            <ul className="mt-1 space-y-0.5 text-xs leading-snug">
              {row.hardwareReadingLines.map((line, i) => (
                <li key={i} data-testid="plant-recent-activity-hardware-line">
                  {line.replace(/^[-•]\s*/, "")}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        {plantName ? <span>{plantName}</span> : null}
        {row.tentId ? (
          <Link
            to={tentDetailPath(row.tentId)}
            className="underline hover:text-foreground"
            data-testid="plant-recent-activity-tent-link"
          >
            Tent
          </Link>
        ) : null}
      </div>
    </li>
  );
}

export default function PlantRecentActivityPanel({ plantId, plantName }: Props) {
  const enabled = !!plantId;
  const { data, isLoading } = usePlantRecentActivity(plantId);
  const rawRows = enabled ? data ?? [] : [];
  const rows = buildPlantRecentActivity(rawRows, {
    plantId: plantId ?? null,
  });
  // Structured activity detail (e.g. training technique) is recovered from the
  // raw stored details here in the presenter — deliberately NOT in
  // buildPlantRecentActivity, which is mirrored into the edge bundle and must
  // stay free of UI-only describe logic. Keyed by entry id for O(1) lookup.
  const detailLinesById = new Map<string, readonly QuickLogDetailDisplayLine[]>();
  for (const raw of rawRows as Array<{ id?: unknown; details?: unknown }>) {
    if (typeof raw?.id !== "string") continue;
    const lines = describeQuickLogDetailsFromExtras(raw.details);
    if (lines.length > 0) detailLinesById.set(raw.id, lines);
  }

  return (
    <Card
      id="plant-recent-activity"
      data-testid="plant-recent-activity-panel"
      className="mt-4 scroll-mt-20"
    >
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <NotebookPen className="h-4 w-4" /> Recent Plant Activity
        </CardTitle>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-7 px-2 gap-1"
          data-testid="plant-recent-activity-open-timeline"
        >
          <Link to={timelinePath()}>
            Open Timeline <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="text-sm">
        {!enabled ? (
          <p className="text-muted-foreground" data-testid="plant-recent-activity-empty-no-plant">
            No plant selected.
          </p>
        ) : isLoading ? (
          <p className="text-muted-foreground">Loading recent activity…</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground" data-testid="plant-recent-activity-empty">
            No activity logged for this plant yet.
          </p>
        ) : (
          <ul className="space-y-2" data-testid="plant-recent-activity-list">
            {rows.map((r) => (
              <EntryRow
                key={r.id}
                row={r}
                plantName={plantName}
                detailLines={detailLinesById.get(r.id) ?? []}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
