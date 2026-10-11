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
import { Button } from "@/components/ui/button";
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
  const { cards, readStatus, refetch } = useManualSnapshotTimelineCards(scope);

  return (
    <Card data-testid="manual-snapshot-timeline-section" data-scope={props.scope}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardList className="h-4 w-4" aria-hidden />
          {props.scope === "plant"
            ? "Manual snapshots attached to this plant"
            : "Manual snapshots in this tent’s diary"}
        </CardTitle>
        <p
          className="text-xs text-muted-foreground"
          data-testid="manual-snapshot-timeline-section-helper"
        >
          {props.scope === "plant"
            ? "Grower-recorded readings attached to this plant’s diary. Shared tent records can also appear in QuickLog memory."
            : "Grower-recorded readings in this tent’s diary, including its plants."}{" "}
          Not live, not synced, not imported.
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
        ) : (
          <>
            {readStatus === "loading" ? (
              <div
                role="status"
                aria-label="Manual snapshot read status"
                className="h-16 rounded-md bg-muted/40 animate-pulse"
                data-testid="manual-snapshot-timeline-section-loading"
              >
                <span className="sr-only">Loading manual snapshots…</span>
              </div>
            ) : readStatus !== "success" ? (
              <div
                role="status"
                aria-label="Manual snapshot read status"
                className="mb-3 text-sm text-muted-foreground"
                data-testid={
                  readStatus === "error" ? "manual-snapshot-timeline-section-error" : undefined
                }
              >
                <p>
                  {readStatus === "paused"
                    ? "Waiting for connection to load manual snapshots."
                    : readStatus === "refreshing"
                      ? "Refreshing manual snapshots…"
                      : "Couldn't load manual snapshots right now."}
                  {cards.length > 0 &&
                    " Showing previously loaded snapshots; the latest read is unconfirmed."}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  disabled={readStatus === "refreshing"}
                  onClick={() => void refetch()}
                >
                  Retry
                </Button>
              </div>
            ) : null}
            {cards.length > 0 ? (
              <ul className="space-y-3" data-testid="manual-snapshot-timeline-section-list">
                {cards.map((card) => (
                  <li key={card.id}>
                    <ManualSnapshotTimelineCard card={card} />
                  </li>
                ))}
              </ul>
            ) : readStatus === "success" ? (
              <p
                className="text-sm text-muted-foreground"
                data-testid="manual-snapshot-timeline-section-empty"
              >
                {props.scope === "plant"
                  ? "No manual sensor snapshots attached to this plant yet."
                  : "No manual sensor snapshots in this tent’s diary yet."}
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
