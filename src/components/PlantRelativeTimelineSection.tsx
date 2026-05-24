/**
 * Render-only Relative Cultivation Timeline section for Plant Detail.
 *
 * Read-only: projects existing diary entries onto plant-day / stage-day
 * via `relativeTimelineProjectionRules`. No create/edit/delete/drag
 * controls. No writes. No alerts. No Action Queue execution. No device
 * control. No reminder scheduling. No calendar event tables.
 */
import { Camera, Gauge, NotebookPen, Sprout } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePlantRecentActivity } from "@/hooks/usePlantRecentActivity";
import {
  buildRelativeTimelineProjection,
  groupRelativeTimelineByStage,
  type RelativeTimelineItem,
} from "@/lib/relativeTimelineProjectionRules";

interface Props {
  plantId: string | null | undefined;
  plantStartedAt: string | number | Date | null | undefined;
  currentStage?: string | null;
  stageStartedAt?: string | number | Date | null;
}

const SOURCE_LABEL: Record<RelativeTimelineItem["source"], string> = {
  note: "Note",
  photo: "Photo",
  sensor: "Sensor",
};

function SourceIcon({ source }: { source: RelativeTimelineItem["source"] }) {
  if (source === "photo") return <Camera className="h-3.5 w-3.5" aria-hidden />;
  if (source === "sensor") return <Gauge className="h-3.5 w-3.5" aria-hidden />;
  return <NotebookPen className="h-3.5 w-3.5" aria-hidden />;
}

function TimelineRow({ item }: { item: RelativeTimelineItem }) {
  return (
    <li
      className="rounded-lg border bg-card/40 p-3 text-sm"
      data-testid="relative-timeline-item"
      data-item-id={item.id}
      data-event-type={item.eventType}
      data-source={item.source}
      data-plant-day={item.plantDay ?? ""}
      data-stage-day={item.stageDay ?? ""}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant="secondary"
            className="capitalize gap-1"
            data-testid="relative-timeline-source-badge"
          >
            <SourceIcon source={item.source} /> {SOURCE_LABEL[item.source]}
          </Badge>
          {item.stagePreset && (
            <Badge
              variant="outline"
              className={`stage-token-${item.stagePreset.colorToken}`}
              data-testid="relative-timeline-stage-badge"
              data-stage-key={item.stagePreset.key}
              data-stage-color-token={item.stagePreset.colorToken}
            >
              {item.stagePreset.label}
            </Badge>
          )}
          <Badge
            variant="outline"
            className="capitalize"
            data-testid="relative-timeline-event-type"
          >
            {item.eventType}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {item.plantDay !== null && (
            <span data-testid="relative-timeline-plant-day">
              Plant day {item.plantDay}
            </span>
          )}
          {item.stageDay !== null && (
            <span data-testid="relative-timeline-stage-day">
              Stage day {item.stageDay}
            </span>
          )}
          <span data-testid="relative-timeline-timestamp">
            {item.occurredAtLabel}
          </span>
        </div>
      </div>
      <p
        className="mt-1.5 text-sm text-foreground/90 break-words"
        data-testid="relative-timeline-title"
      >
        {item.title}
      </p>
    </li>
  );
}

export default function PlantRelativeTimelineSection({
  plantId,
  plantStartedAt,
  currentStage,
  stageStartedAt,
}: Props) {
  const { data, isLoading } = usePlantRecentActivity(plantId);
  const items = buildRelativeTimelineProjection({
    rawEntries: data ?? [],
    plantId: plantId ?? null,
    plantStartedAt: plantStartedAt ?? null,
    currentStage: currentStage ?? null,
    stageStartedAt: stageStartedAt ?? null,
  });

  return (
    <Card data-testid="plant-relative-timeline-section">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Sprout className="h-4 w-4" /> Relative Timeline
        </CardTitle>
        <p
          className="text-xs text-muted-foreground"
          data-testid="relative-timeline-helper"
        >
          This timeline is based on plant days, not just calendar dates.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div
            className="h-16 rounded-md bg-muted/40 animate-pulse"
            data-testid="relative-timeline-loading"
          />
        ) : items.length === 0 ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="relative-timeline-empty"
          >
            Your plant timeline starts with the first quick log, photo, or sensor
            snapshot.
          </p>
        ) : (
          <ol
            className="space-y-2 max-h-[28rem] overflow-y-auto pr-1"
            data-testid="relative-timeline-list"
          >
            {items.map((item) => (
              <TimelineRow key={item.id} item={item} />
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
