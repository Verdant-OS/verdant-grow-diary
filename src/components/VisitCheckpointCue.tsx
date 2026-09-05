/**
 * VisitCheckpointCue — calm, read-only Plant Detail notice when a recent
 * diary note still carries a Guided Walk `Next checkpoint:` line.
 *
 * Presenter only. No Action Queue enqueue, no mutation, no device control.
 * Renders nothing when no recent checkpoint is found.
 */

import { useMemo } from "react";
import { CalendarClock } from "lucide-react";
import { usePlantRecentActivity } from "@/hooks/usePlantRecentActivity";
import { normalizeDiaryEntries } from "@/lib/diaryEntryRules";
import {
  selectVisitCheckpointResurface,
  type VisitCheckpointResurfaceResult,
} from "@/lib/visitCheckpointResurfaceRules";

export interface VisitCheckpointCueProps {
  readonly plantId: string | null | undefined;
  /** Injectable clock for tests; defaults to Date.now(). */
  readonly nowMs?: number;
}

function buildCueFromRawRows(
  plantId: string,
  rawRows: readonly unknown[] | null | undefined,
  now: number,
): VisitCheckpointResurfaceResult {
  const normalized = normalizeDiaryEntries({ rawEntries: rawRows ?? [], now });
  const scoped = normalized.filter((entry) => entry.plantId === plantId);
  return selectVisitCheckpointResurface({
    notes: scoped.map((entry) => ({
      id: entry.id,
      note: entry.note,
      occurredAt: entry.createdAt,
    })),
    now,
  });
}

export default function VisitCheckpointCue({ plantId, nowMs }: VisitCheckpointCueProps) {
  const { data: rawRows, isLoading, isError } = usePlantRecentActivity(plantId ?? null);

  const cue = useMemo(() => {
    if (!plantId || isLoading || isError) {
      return { show: false as const, reason: "no_notes" as const };
    }
    const now = typeof nowMs === "number" && Number.isFinite(nowMs) ? nowMs : Date.now();
    return buildCueFromRawRows(plantId, rawRows, now);
  }, [plantId, rawRows, isLoading, isError, nowMs]);

  if (!cue.show) return null;

  return (
    <section
      className="glass rounded-2xl p-4 my-3"
      aria-label={cue.ariaLabel}
      data-testid="visit-checkpoint-cue"
      data-checkpoint={cue.checkpointLabel}
    >
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-muted p-2">
          <CalendarClock className="h-4 w-4 text-muted-foreground" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-sm font-semibold">{cue.headline}</h2>
          <p
            className="mt-0.5 text-xs text-muted-foreground"
            data-testid="visit-checkpoint-cue-body"
          >
            {cue.body}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Reminder only — nothing was queued automatically.
          </p>
        </div>
      </div>
    </section>
  );
}
