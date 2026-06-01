/**
 * PlantQuickStatusStrip — compact at-a-glance status row for Plant Detail.
 *
 * Reuses existing hooks that the page already loads (React Query dedupes
 * by key — no new queries are introduced). Pure formatting + safe link
 * derivation lives in `plantQuickStatusRules`.
 *
 * Strictly presentation-only: no writes, no automation, no device control,
 * no calendar / notification / email / scheduling, no edge function invokes.
 */
import { useCallback } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDownToLine,
  Bell,
  Clock,
  ListTodo,
  Sprout,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
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

function escapeAttr(id: string): string {
  if (typeof (globalThis as { CSS?: { escape?: (s: string) => string } }).CSS?.escape === "function") {
    return (globalThis as { CSS: { escape: (s: string) => string } }).CSS.escape(id);
  }
  return id.replace(/["\\]/g, "\\$&");
}

export default function PlantQuickStatusStrip({
  plantId,
  plantStartedAt,
  stage,
  tentId,
  growId,
}: Props) {
  const { data: rawEntries, isLoading: entriesLoading } =
    usePlantRecentActivity(plantId ?? null);
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

  const alertsLoading = hasTent && alertStatus !== "ok";
  const alertCount = hasTent && alertStatus === "ok" ? alertRows.length : null;
  const actionCount =
    hasTent && !actionsLoading ? actionRows.length : null;

  const view = buildPlantQuickStatusView({
    stage,
    timelineItems,
    alertCount,
    actionCount,
    timelineLoading: !!plantId && entriesLoading,
    alertsLoading: hasTent ? alertsLoading : false,
    actionsLoading: hasTent ? actionsLoading : false,
    growId: growId ?? null,
    tentId: tentId ?? null,
  });

  const handleViewLatest = useCallback(() => {
    const id = view.viewLatestEntry.targetItemId;
    if (!id || typeof document === "undefined") return;
    const el = document.querySelector<HTMLElement>(
      `[data-item-id="${escapeAttr(id)}"]`,
    );
    if (!el) return;
    try {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {
      el.scrollIntoView();
    }
    // Make the target programmatically focusable without disturbing tab order.
    if (!el.hasAttribute("tabindex")) {
      el.setAttribute("tabindex", "-1");
    }
    if (typeof el.focus === "function") {
      try {
        el.focus({ preventScroll: true });
      } catch {
        /* noop */
      }
    }
  }, [view.viewLatestEntry.targetItemId]);


  return (
    <div
      data-testid="plant-quick-status-strip"
      data-compact={view.compact}
      data-stage-fallback={view.stageIsFallback ? "true" : "false"}
      data-last-update-fallback={view.lastUpdateIsFallback ? "true" : "false"}
      data-alert-count={view.hasAlertCount ? view.alertCount : "unknown"}
      data-action-count={view.hasActionCount ? view.actionCount : "unknown"}
      data-alerts-state={view.alertsState}
      data-actions-state={view.actionsState}
      data-timeline-loading={view.timelineLoading ? "true" : "false"}
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
      {view.timelineLoading ? (
        <span
          data-testid="plant-quick-status-last-update-loading"
          className="inline-flex items-center gap-1.5 text-muted-foreground/70"
        >
          <Clock className="h-3.5 w-3.5" aria-hidden />
          <Skeleton
            className="h-3 w-28"
            aria-label="Checking recent activity…"
          />
        </span>
      ) : (
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
      )}

      {view.alertsState === "loading" ? (
        <>
          <span aria-hidden className="text-muted-foreground/40">·</span>
          <span
            data-testid="plant-quick-status-alerts-loading"
            className="inline-flex items-center gap-1.5 italic text-muted-foreground/70"
          >
            <Bell className="h-3.5 w-3.5" aria-hidden />{" "}
            {view.alertsStatusLabel}
          </span>
        </>
      ) : view.hasAlertCount && view.alertLabel ? (
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
      ) : view.alertsStatusLabel ? (
        <>
          <span aria-hidden className="text-muted-foreground/40">·</span>
          <span
            data-testid="plant-quick-status-alerts-unavailable"
            className="inline-flex items-center gap-1.5 italic text-muted-foreground/70"
          >
            <Bell className="h-3.5 w-3.5" aria-hidden />{" "}
            {view.alertsStatusLabel}
          </span>
        </>
      ) : null}

      {view.actionsState === "loading" ? (
        <>
          <span aria-hidden className="text-muted-foreground/40">·</span>
          <span
            data-testid="plant-quick-status-actions-loading"
            className="inline-flex items-center gap-1.5 italic text-muted-foreground/70"
          >
            <ListTodo className="h-3.5 w-3.5" aria-hidden />{" "}
            {view.actionsStatusLabel}
          </span>
        </>
      ) : view.hasActionCount && view.actionLabel ? (
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
      ) : view.actionsStatusLabel ? (
        <>
          <span aria-hidden className="text-muted-foreground/40">·</span>
          <span
            data-testid="plant-quick-status-actions-unavailable"
            className="inline-flex items-center gap-1.5 italic text-muted-foreground/70"
          >
            <ListTodo className="h-3.5 w-3.5" aria-hidden />{" "}
            {view.actionsStatusLabel}
          </span>
        </>
      ) : null}

      <span
        aria-hidden
        className="hidden sm:inline text-muted-foreground/40"
      >
        ·
      </span>

      {/* Quick links + scroll affordance */}
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
        {view.alertsLink.disabled ? (
          <span
            data-testid="plant-quick-status-alerts-link"
            data-disabled="true"
            aria-disabled="true"
            role="link"
            aria-label={view.alertsLink.ariaLabel}
            title={view.alertsLink.disabledReason ?? undefined}
            className="inline-flex cursor-not-allowed items-center gap-1 italic text-muted-foreground/70"
          >
            <span>{view.alertsLink.label}</span>
            <span
              data-testid="plant-quick-status-alerts-link-reason"
              className="text-muted-foreground/60 not-italic text-[11px]"
            >
              ({view.alertsLink.disabledReason})
            </span>
          </span>
        ) : (
          <Link
            data-testid="plant-quick-status-alerts-link"
            to={view.alertsLink.href ?? "#"}
            aria-label={view.alertsLink.ariaLabel}
            className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
          >
            {view.alertsLink.label}
          </Link>
        )}
        <span aria-hidden className="text-muted-foreground/40">·</span>
        {view.actionsLink.disabled ? (
          <span
            data-testid="plant-quick-status-actions-link"
            data-disabled="true"
            aria-disabled="true"
            role="link"
            aria-label={view.actionsLink.ariaLabel}
            title={view.actionsLink.disabledReason ?? undefined}
            className="inline-flex cursor-not-allowed items-center gap-1 italic text-muted-foreground/70"
          >
            <span>{view.actionsLink.label}</span>
            <span
              data-testid="plant-quick-status-actions-link-reason"
              className="text-muted-foreground/60 not-italic text-[11px]"
            >
              ({view.actionsLink.disabledReason})
            </span>
          </span>
        ) : (
          <Link
            data-testid="plant-quick-status-actions-link"
            to={view.actionsLink.href ?? "#"}
            aria-label={view.actionsLink.ariaLabel}
            className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
          >
            {view.actionsLink.label}
          </Link>
        )}
        <span aria-hidden className="text-muted-foreground/40">·</span>
        {view.viewLatestEntry.disabled ? (
          <span
            data-testid="plant-quick-status-view-latest"
            data-disabled="true"
            aria-disabled="true"
            role="button"
            aria-label={view.viewLatestEntry.ariaLabel}
            title={view.viewLatestEntry.disabledReason ?? undefined}
            className="inline-flex cursor-not-allowed items-center gap-1 italic text-muted-foreground/70"
          >
            <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden />
            <span>{view.viewLatestEntry.label}</span>
            <span
              data-testid="plant-quick-status-view-latest-reason"
              className="text-muted-foreground/60 not-italic text-[11px]"
            >
              ({view.viewLatestEntry.disabledReason})
            </span>
          </span>
        ) : (
          <button
            type="button"
            data-testid="plant-quick-status-view-latest"
            aria-label={view.viewLatestEntry.ariaLabel}
            onClick={handleViewLatest}
            className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
          >
            <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden />
            {view.viewLatestEntry.label}
          </button>
        )}
      </span>

    </div>
  );
}
