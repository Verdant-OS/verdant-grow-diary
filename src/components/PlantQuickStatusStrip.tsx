/**
 * PlantQuickStatusStrip — compact at-a-glance status row for Plant Detail.
 *
 * Reuses existing hooks that the page already loads (React Query dedupes
 * by key — no new queries are introduced). Pure formatting lives in
 * `plantQuickStatusRules`.
 *
 * Strictly presentation-only: no writes, no automation, no device control,
 * no calendar / notification / email / scheduling, no edge function invokes.
 */
import { AlertTriangle, Bell, Clock, ListTodo, Sprout } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlantRecentActivity } from "@/hooks/usePlantRecentActivity";
import { usePlantAssignedTentAlerts } from "@/hooks/usePlantAssignedTentAlerts";
import { usePlantAssignedTentActions } from "@/hooks/usePlantAssignedTentActions";
import { buildRelativeTimelineProjection } from "@/lib/relativeTimelineProjectionRules";
import { buildPlantQuickStatusView } from "@/lib/plantQuickStatusRules";

interface Props {
  plantId: string | null | undefined;
  plantStartedAt: string | number | Date | null | undefined;
  stage?: string | null;
  tentId?: string | null;
  growId?: string | null;
}

export default function PlantQuickStatusStrip({
  plantId,
  plantStartedAt,
  stage,
  tentId,
  growId,
}: Props) {
  const { data: rawEntries } = usePlantRecentActivity(plantId ?? null);
  const timelineItems = buildRelativeTimelineProjection({
    rawEntries: rawEntries ?? [],
    plantId: plantId ?? null,
    plantStartedAt: plantStartedAt ?? null,
  });

  const hasTent = !!tentId;
  const { rows: alertRows, status: alertStatus } = usePlantAssignedTentAlerts(
    hasTent ? tentId ?? null : null,
    growId ?? null,
  );
  const { rows: actionRows, isLoading: actionsLoading } =
    usePlantAssignedTentActions(
      hasTent ? tentId ?? null : null,
      growId ?? null,
    );

  const alertCount =
    hasTent && alertStatus === "ok" ? alertRows.length : null;
  const actionCount =
    hasTent && !actionsLoading ? actionRows.length : null;

  const view = buildPlantQuickStatusView({
    stage,
    timelineItems,
    alertCount,
    actionCount,
  });

  return (
    <div
      data-testid="plant-quick-status-strip"
      data-compact={view.compact}
      data-stage-fallback={view.stageIsFallback ? "true" : "false"}
      data-last-update-fallback={view.lastUpdateIsFallback ? "true" : "false"}
      data-alert-count={view.hasAlertCount ? view.alertCount : "unknown"}
      data-action-count={view.hasActionCount ? view.actionCount : "unknown"}
      aria-label={view.compact}
      className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border/50 bg-card/40 px-3 py-2 text-xs"
    >
      <span
        data-testid="plant-quick-status-stage"
        className={cn(
          "inline-flex items-center gap-1.5",
          view.stageIsFallback
            ? "italic text-muted-foreground"
            : "font-medium text-foreground",
        )}
      >
        <Sprout className="h-3.5 w-3.5" aria-hidden /> {view.stageLabel}
      </span>
      <span aria-hidden className="text-muted-foreground/40">·</span>
      <span
        data-testid="plant-quick-status-last-update"
        className={cn(
          "inline-flex items-center gap-1.5",
          view.lastUpdateIsFallback
            ? "italic text-muted-foreground/80"
            : "text-muted-foreground",
        )}
      >
        <Clock className="h-3.5 w-3.5" aria-hidden /> {view.lastUpdateLabel}
      </span>
      {view.hasAlertCount && view.alertLabel && (
        <>
          <span aria-hidden className="text-muted-foreground/40">·</span>
          <span
            data-testid="plant-quick-status-alerts"
            data-count={view.alertCount ?? 0}
            className={cn(
              "inline-flex items-center gap-1.5",
              (view.alertCount ?? 0) > 0
                ? "text-[hsl(var(--warning))]"
                : "text-muted-foreground",
            )}
          >
            {(view.alertCount ?? 0) > 0 ? (
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Bell className="h-3.5 w-3.5" aria-hidden />
            )}{" "}
            {view.alertLabel}
          </span>
        </>
      )}
      {view.hasActionCount && view.actionLabel && (
        <>
          <span aria-hidden className="text-muted-foreground/40">·</span>
          <span
            data-testid="plant-quick-status-actions"
            data-count={view.actionCount ?? 0}
            className="inline-flex items-center gap-1.5 text-muted-foreground"
          >
            <ListTodo className="h-3.5 w-3.5" aria-hidden /> {view.actionLabel}
          </span>
        </>
      )}
    </div>
  );
}
