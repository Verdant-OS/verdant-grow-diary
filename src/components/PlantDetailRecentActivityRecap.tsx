/**
 * PlantDetailRecentActivityRecap — presentation-only mini-recap of the
 * latest plant timeline items for Plant Detail.
 *
 * Read-only except for the optional `onAddQuickCheck` callback, which only
 * opens the existing Quick Log sheet owned by PlantDetail. This component does
 * not write, call RPC, call AI, create alerts, or schedule anything.
 */
import { useMemo } from "react";
import { Activity, ArrowDown, Link2, RotateCcw, ShieldCheck, Zap } from "lucide-react";

import { usePlantRecentActivity } from "@/hooks/usePlantRecentActivity";
import { buildPlantRecentActivity } from "@/lib/plantRecentActivityRules";
import {
  buildPlantRecentActivityRecap,
  PLANT_RECENT_ACTIVITY_RECAP_DEFAULT_LIMIT,
} from "@/lib/plantRecentActivityRecap";
import { buildNoRecentLogRecovery } from "@/lib/noRecentLogRecoveryRules";
import { buildOutcomeFollowUp } from "@/lib/outcomeFollowUpRules";
import { buildActionResponsePairing } from "@/lib/actionResponsePairingRules";
import {
  buildPlantStabilizeModeViewModel,
  shouldShowPlantStabilizeMode,
} from "@/lib/plantStabilizeModeViewModel";
import { PLANT_RELATIVE_TIMELINE_ANCHOR_ID } from "@/lib/plantDetailQuickActions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface PlantDetailRecentActivityRecapProps {
  plantId: string | null | undefined;
  plantStage?: string | null;
  plantStatus?: string | null;
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
  plantStage,
  plantStatus,
  onAddQuickCheck,
}: PlantDetailRecentActivityRecapProps) {
  const { data: rawRows, isLoading } = usePlantRecentActivity(plantId ?? null);

  const rows = useMemo(() => {
    if (!plantId) return [];
    return buildPlantRecentActivity(rawRows ?? [], {
      plantId,
      limit: 10,
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

  const actionResponsePair = useMemo(
    () => buildActionResponsePairing({ rows }),
    [rows],
  );

  const followUp = useMemo(
    () =>
      buildOutcomeFollowUp({
        rows,
        now: Date.now(),
      }),
    [rows],
  );

  const stabilize = useMemo(
    () =>
      buildPlantStabilizeModeViewModel({
        rows,
        now: Date.now(),
        plantStage,
        plantStatus,
      }),
    [plantStage, plantStatus, rows],
  );
  const showStabilize = shouldShowPlantStabilizeMode(stabilize);

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
      ) : (
        <div className="space-y-3">
          {showStabilize && (
            <div
              data-testid="plant-detail-stabilize-mode"
              data-level={stabilize.level}
              className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 rounded-full border border-amber-400/40 bg-background/40 p-2 text-amber-200">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <div>
                    <p className="font-medium text-amber-100">{stabilize.headline}</p>
                    <p className="mt-1 text-amber-100/80">{stabilize.one_thing_to_watch}</p>
                  </div>
                  <p className="text-amber-100/80">{stabilize.why_now[0]}</p>
                  <p className="font-medium text-amber-50">{stabilize.what_not_to_do[0]}</p>
                  <p className="text-amber-100/80">{stabilize.safe_next_log_prompt}</p>
                </div>
              </div>
            </div>
          )}

          {actionResponsePair.show && (
            <div
              data-testid="plant-detail-action-response-pair"
              data-reason={actionResponsePair.reason}
              data-response-status={actionResponsePair.responseStatus ?? "pending"}
              className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 rounded-full border border-emerald-400/35 bg-background/40 p-2 text-emerald-200">
                  <Link2 className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="font-medium text-emerald-50">{actionResponsePair.title}</p>
                  <div className="grid gap-1 text-emerald-50/85">
                    <p>
                      <span className="font-medium">What changed:</span>{" "}
                      {actionResponsePair.actionLabel}
                    </p>
                    <p>
                      <span className="font-medium">Response:</span>{" "}
                      {actionResponsePair.responseLabel}
                    </p>
                  </div>
                  <p className="text-emerald-50/75">{actionResponsePair.helper}</p>
                </div>
              </div>
            </div>
          )}

          {followUp.showPrompt && onAddQuickCheck && (
            <div
              data-testid="plant-detail-outcome-follow-up"
              data-reason={followUp.reason}
              className="rounded-xl border border-primary/25 bg-primary/10 p-4 text-sm"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 rounded-full border border-primary/30 bg-background/40 p-2 text-primary">
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{followUp.headline}</p>
                  <p className="mt-1 text-muted-foreground">{followUp.body}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Last change: {followUp.actionSummary}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onAddQuickCheck}
                    aria-label={followUp.ariaLabel}
                    data-testid="plant-detail-add-follow-up-check"
                    className="mt-3 min-h-10"
                  >
                    {followUp.ctaLabel}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {items.length === 0 ? (
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
        </div>
      )}
    </section>
  );
}
