/**
 * ManualSnapshotTimelineSection — read-only timeline section that renders
 * Manual Sensor Snapshot cards for a plant or a tent.
 *
 * - Plant scope: only snapshots linked to that plant_id.
 * - Tent scope: snapshots linked to the tent (including tent-level rows
 *   where plant_id is null), via pure `selectManualSnapshotsForTimeline`.
 *
 * No mapping/validation tables are duplicated here — all logic lives in
 * `manualSnapshotDiaryAdapter`, `manualSensorSnapshotRules`, and
 * `manualSensorSnapshotViewModel`.
 *
 * Failure mode: a non-blocking notice is shown if the read fails; existing
 * diary timeline elsewhere on the page is untouched.
 */
import { ClipboardList } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ManualSnapshotTimelineCard from "@/components/ManualSnapshotTimelineCard";
import {
  useManualSnapshotTimelineCards,
  type ManualSnapshotTimelineScope,
} from "@/hooks/useManualSnapshotTimelineCards";

type Props =
  | { scope: "plant"; plantId: string | null | undefined }
  | { scope: "tent"; tentId: string | null | undefined };

function toScope(props: Props): ManualSnapshotTimelineScope | null {
  if (props.scope === "plant") {
    return props.plantId ? { kind: "plant", plantId: props.plantId } : null;
  }
  return props.tentId ? { kind: "tent", tentId: props.tentId } : null;
}

export default function ManualSnapshotTimelineSection(props: Props) {
  const scope = toScope(props);
  const { cards, isLoading, isError } = useManualSnapshotTimelineCards(scope);

  return (
    <Card data-testid="manual-snapshot-timeline-section" data-scope={props.scope}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardList className="h-4 w-4" aria-hidden /> Manual sensor snapshots
        </CardTitle>
        <p
          className="text-xs text-muted-foreground"
          data-testid="manual-snapshot-timeline-section-helper"
        >
          Grower-recorded readings. Not live, not synced, not imported.
        </p>
      </CardHeader>
      <CardContent>
        {scope === null ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="manual-snapshot-timeline-section-no-scope"
          >
            Open a {props.scope} to see manual snapshots.
          </p>
        ) : isLoading ? (
          <div
            className="h-16 rounded-md bg-muted/40 animate-pulse"
            data-testid="manual-snapshot-timeline-section-loading"
          />
        ) : isError ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="manual-snapshot-timeline-section-error"
          >
            Couldn't load manual snapshots right now. Other entries are still shown.
          </p>
        ) : cards.length === 0 ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="manual-snapshot-timeline-section-empty"
          >
            No manual sensor snapshots yet.
          </p>
        ) : (
          <ul
            className="space-y-3"
            data-testid="manual-snapshot-timeline-section-list"
          >
            {cards.map((card) => (
              <li key={card.id}>
                <ManualSnapshotTimelineCard card={card} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
