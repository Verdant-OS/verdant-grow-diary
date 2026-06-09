/**
 * PlantDetailRecentActivityRecap — presentation-only mini-recap of the
 * latest plant timeline items for Plant Detail.
 *
 * Read-only except for the optional `onAddQuickCheck` callback, which only
 * opens the existing Quick Log sheet owned by PlantDetail. This component does
 * not write, call RPC, call AI, create alerts, or schedule anything.
 */
import { useMemo } from "react";
import { Activity, ArrowDown, Zap } from "lucide-react";

import { usePlantRecentActivity } from "@/hooks/usePlantRecentActivity";
import { buildPlantRecentActivity } from "@/lib/plantRecentActivityRules";
import {
  buildPlantRecentActivityRecap,
  PLANT_RECENT_ACTIVITY_RECAP_DEFAULT_LIMIT,
} from "@/lib/plantRecentActivityRecap";
import { buildNoRecentLogRecovery } from "@/lib/noRecentLogRecoveryRules";
import { PLANT_RELATIVE_TIMELINE_ANCHOR_ID } from "@/lib/plantDetailQuickActions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface PlantDetailRecentActivityRecapProps {
  plantId: string | null | undefined;
  onAddQuickCheck?: () => void;
}

const HEADING_ID = "plant-detail-recent-activity-recap-heading";

function scrollToTimeline() {
  if (typeof document === "undefined") return;
  const el = document.getElementById(PLANT_RELATIVE_TIMELINE_ANCHOR_ID);
  if (!el) return;
  try {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch {
    /* noop */
  }
  try {
    (el as HTMLElement).focus({ preventScroll: true });
  } catch {
    /* noop */
  }
}

export default function PlantDetailRecentActivityRecap({
  plantId,
  onAddQuickCheck,
}: PlantDetailRecentActivityRecapProps) {
  const { data: rawRows, isLoading } = usePlantRecentActivity(plantId ?? null);

  const rows = useMemo(() => {
    if (!plantId) return [];
    return buildPlantRecentActivity(rawRows ?? [], {
      plantId,
      limit: PLANT_RECENT_ACTIVITY_RECAP_DEFAULT_LIMIT,
    });
  }, [plantId, rawRows]);

  const items = useMemo(
    () =>
      buildPlantRecentActivityRecap({
        rows,
        limit: PLANT_RECENT_ACTIVITY_RECAP_DEFAULT_LIMIT,
      }),
    [rows],
  );

  const recovery = useMemo(
    () =>
      buildNoRecentLogRecovery({
        rows,
        now: Date.now(),
      }),
    [rows],
  );

  return (
    <section
      aria-labelledby={HEADING_ID}
      data-testid="plant-detail-recent-activity-recap"
      className="glass rounded-2xl p-4 my-3"
    >
      <header className="flex items-center justify-between gap-2 mb-3">
        <h2
          id={HEADING_ID}
          className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          <Activity className="h-3.5 w-3.5 text-primary" />
          Recent activity
        </h2>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={scrollToTimeline}
          data-testid="plant-detail-recent-activity-recap-view-timeline"
          className="h-7 gap-1 focus-visible:ring-2 focus-visible:ring-ring"
        >
          View full timeline <ArrowDown className="h-3.5 w-3.5" />
        </Button>
      </header>

      {isLoading ? (
        <ul
          data-testid="plant-detail-recent-activity-recap-loading"
          role="status"
          aria-live="polite"
          className="space-y-2"
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <li
              key={i}
              className="h-10 rounded-lg bg-secondary/40 animate-pulse"
              aria-hidden
            />
          ))}
          <span className="sr-only">Loading recent activity…</span>
        </ul>
      ) : recovery.showPrompt && onAddQuickCheck ? (
        <div
          data-testid="plant-detail-no-recent-log-recovery"
          data-reason={recovery.reason}
          className="rounded-xl border border-dashed border-border/50 bg-secondary/20 p-4"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-full border border-primary/30 bg-primary/10 p-2 text-primary">
              <Zap className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{recovery.headline}</p>
              <p className="mt-1 text-sm text-muted-foreground">{recovery.body}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onAddQuickCheck}
                aria-label={recovery.ariaLabel}
                data-testid="plant-detail-add-quick-check"
                className="mt-3 min-h-10"
              >
                {recovery.ctaLabel}
              </Button>
            </div>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div
          data-testid="plant-detail-recent-activity-recap-empty"
          className="rounded-xl border border-dashed border-border/50 bg-secondary/20 p-4 text-center"
        >
          <p className="text-sm text-muted-foreground">No recent activity yet.</p>
          <p className="text-[11px] text-muted-foreground/80 mt-1">
            Use Quick Log, manual sensor snapshots, or photos to start building plant memory.
          </p>
        </div>
      ) : (
        <ul
          data-testid="plant-detail-recent-activity-recap-list"
          className="space-y-2"
        >
          {items.map((item) => (
            <li
              key={item.key}
              data-testid="plant-detail-recent-activity-recap-item"
              data-category={item.category}
              className="flex items-start gap-2 rounded-lg border border-border/40 bg-card/30 p-2"
            >
              <Badge
                variant="outline"
                className="shrink-0 text-[10px] uppercase tracking-wide"
              >
                {item.categoryLabel}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground/90 truncate sm:whitespace-normal sm:line-clamp-2">
                  {item.summary}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {item.timestampLabel}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
