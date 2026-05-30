/**
 * Render-only compact "Recent Move" line for Plant Detail.
 *
 * Sourced exclusively from existing `diary_entries` rows via
 * usePlantRecentActivity. No new table. No writes. No sensor_readings,
 * alerts, or action_queue access. Past entries are never rewritten.
 */
import { Link } from "react-router-dom";
import { ArrowRight, Move } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { usePlantRecentActivity } from "@/hooks/usePlantRecentActivity";
import { findLatestPlantTentMovement } from "@/lib/plantTentMovementDisplayRules";

import { tentDetailPath } from "@/lib/routes";

interface Props {
  plantId: string | null | undefined;
}

export default function PlantRecentMoveCard({ plantId }: Props) {
  const { data } = usePlantRecentActivity(plantId);
  const move = findLatestPlantTentMovement(data ?? []);
  if (!plantId || !move) return null;

  const when =
    move.occurredAt && Number.isFinite(Date.parse(move.occurredAt))
      ? formatDistanceToNow(new Date(move.occurredAt), { addSuffix: true })
      : null;

  return (
    <div
      className="mb-3 rounded-lg border bg-card/40 p-2.5 flex items-center gap-2 text-sm"
      data-testid="plant-recent-move-card"
      data-move-id={move.id}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
        <Move className="h-3 w-3" /> Recent Move
      </div>
      <div className="flex-1 min-w-0 truncate" data-testid="plant-recent-move-summary">
        {move.summary}
        {when ? (
          <span className="text-xs text-muted-foreground"> · {when}</span>
        ) : null}
      </div>
      {move.nextTentId ? (
        <Link
          to={tentDetailPath(move.nextTentId)}
          className="text-xs underline hover:text-foreground inline-flex items-center gap-0.5 shrink-0"
          data-testid="plant-recent-move-tent-link"
        >
          View <ArrowRight className="h-3 w-3" />
        </Link>
      ) : null}
    </div>
  );
}
