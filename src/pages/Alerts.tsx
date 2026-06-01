import { useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SEVERITY_LABEL,
  STATUS_LABEL,
  buildAlertRowAriaLabel,
  formatAlertSeenLabel,
  formatAlertSourceLabel,
} from "@/lib/alertsRouteView";

import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import ScopedGrowBanner from "@/components/ScopedGrowBanner";
import GrowBreadcrumbs from "@/components/GrowBreadcrumbs";
import { AlertWhyContext } from "@/components/AlertWhyContext";
import { LinkedActionCountBadge } from "@/components/LinkedActionCountBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useScopedGrow } from "@/hooks/useScopedGrow";
import { useAlertsList } from "@/hooks/useAlertsList";
import { useAlertEvents } from "@/hooks/useAlertEvents";
import { useAlertsLinkedActionCounts } from "@/hooks/useAlertsLinkedActionCounts";
import {
  acknowledgeAlert,
  dismissAlert,
  logAlertEvent,
  resolveAlert,
  type AlertRow,
  type AlertSeverityRow,
  type AlertStatusRow,
} from "@/lib/alerts";
import { alertDetailPath, alertsPath } from "@/lib/routes";
import { formatDistanceToNow } from "date-fns";

type StatusFilter = AlertStatusRow | "all";
type SeverityFilter = AlertSeverityRow | "all";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
];

const SEVERITY_OPTIONS: { value: SeverityFilter; label: string }[] = [
  { value: "all", label: "All severities" },
  { value: "critical", label: "Critical" },
  { value: "warning", label: "Warning" },
  { value: "watch", label: "Watch" },
  { value: "info", label: "Info" },
];

const SEVERITY_TONE: Record<AlertSeverityRow, string> = {
  critical: "border-destructive text-destructive",
  warning: "border-amber-500 text-amber-600",
  watch: "border-amber-400 text-amber-500",
  info: "border-muted-foreground text-muted-foreground",
};

const STATUS_TONE: Record<AlertStatusRow, string> = {
  open: "border-primary text-primary",
  acknowledged: "border-amber-500 text-amber-600",
  resolved: "border-emerald-500 text-emerald-600",
  dismissed: "border-muted-foreground text-muted-foreground",
};

export default function Alerts() {
  const { urlGrowId, scopedGrowName, isValidScopedGrow, backHref } =
    useScopedGrow();
  const scopedGrowId = isValidScopedGrow ? urlGrowId ?? undefined : undefined;
  // A grow id was passed in the URL but doesn't map to a grow the viewer
  // owns. Showing every alert would be misleading — render a calm prompt.
  const hasInvalidScope = !!urlGrowId && !isValidScopedGrow;

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");

  const { status, alerts, error, reload } = useAlertsList({
    growId: scopedGrowId ?? null,
    status: statusFilter,
    severity: severityFilter,
  });

  const grouped = useMemo(() => {
    return {
      open: alerts.filter((a) => a.status === "open"),
      acknowledged: alerts.filter((a) => a.status === "acknowledged"),
      resolved: alerts.filter((a) => a.status === "resolved"),
      dismissed: alerts.filter((a) => a.status === "dismissed"),
    };
  }, [alerts]);

  // Read-only per-alert summary of open linked Action Queue items.
  const visibleAlertIds = useMemo(() => alerts.map((a) => a.id), [alerts]);
  const linkedActionCounts = useAlertsLinkedActionCounts(visibleAlertIds);

  /**
   * Status-change handler:
   *   1. Update alert status (single write).
   *   2. On success, append an immutable audit event.
   *   3. If only the audit log fails, show a warning toast — the user-visible
   *      status change is still accepted, but the missing audit row is surfaced.
   */
  const runStatusChange = async (
    id: string,
    grow_id: string,
    previous_status: AlertStatusRow,
    event_type: "acknowledged" | "resolved" | "dismissed",
    op: () => Promise<{ status: AlertStatusRow }>,
    label: string,
  ) => {
    let newStatus: AlertStatusRow | null = null;
    try {
      const updated = await op();
      newStatus = updated.status ?? event_type;
    } catch (e) {
      toast.error(`Failed to ${label}: ${(e as Error).message}`);
      return;
    }
    try {
      await logAlertEvent({
        alert_id: id,
        grow_id,
        event_type,
        previous_status,
        new_status: newStatus,
      });
      toast.success(`Alert ${label}d`);
    } catch (logErr) {
      toast.warning(
        `Alert ${label}d, but audit log failed: ${(logErr as Error).message}`,
      );
    }
    reload();
  };

  const handleAcknowledge = (id: string, grow_id: string, prev: AlertStatusRow) =>
    runStatusChange(id, grow_id, prev, "acknowledged", () => acknowledgeAlert(id), "acknowledge");
  const handleResolve = (id: string, grow_id: string, prev: AlertStatusRow) =>
    runStatusChange(id, grow_id, prev, "resolved", () => resolveAlert(id), "resolve");
  const handleDismiss = (id: string, grow_id: string, prev: AlertStatusRow) =>
    runStatusChange(id, grow_id, prev, "dismissed", () => dismissAlert(id), "dismiss");

  return (
    <div>
      <GrowBreadcrumbs
        growId={urlGrowId}
        growName={scopedGrowName}
        current="Alerts"
        section="alerts"
      />
      <PageHeader
        title="Alert Center"
        description="Persistent environment alerts. Read-only insights — no automation."
        icon={<Bell className="h-5 w-5" />}
      />
      {urlGrowId && (
        <ScopedGrowBanner
          growId={urlGrowId}
          growName={scopedGrowName}
          label="alerts"
          clearHref={alertsPath()}
          backHref={backHref}
        />
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as StatusFilter)}
        >
          <SelectTrigger className="w-[180px]" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={severityFilter}
          onValueChange={(v) => setSeverityFilter(v as SeverityFilter)}
        >
          <SelectTrigger className="w-[180px]" aria-label="Filter by severity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SEVERITY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {hasInvalidScope ? (
        <div
          role="status"
          className="glass rounded-2xl p-6 text-center flex flex-col items-center gap-2"
          data-testid="alerts-missing-context"
        >
          <Bell className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <p className="font-display font-semibold text-base">
            Select a grow or tent to review alerts.
          </p>
          <p className="text-sm text-muted-foreground max-w-sm">
            Alerts are scoped to a grow or tent so you only see warnings that
            match what you’re working on.
          </p>
        </div>
      ) : status === "loading" || status === "idle" ? (
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label="Loading alerts"
          className="space-y-2"
          data-testid="alerts-loading-skeleton"
        >
          <span className="sr-only">Loading alerts…</span>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="glass rounded-2xl p-4 flex flex-col gap-2"
              aria-hidden="true"
            >
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="ml-auto h-3 w-20" />
              </div>
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : status === "unavailable" ? (
        <div
          role="alert"
          className="glass rounded-2xl p-4 flex flex-col gap-2 text-sm"
          data-testid="alerts-unavailable"
        >
          <p className="font-medium">Alerts unavailable</p>
          <p className="text-muted-foreground">
            We couldn’t load alerts right now. Check your connection and try
            again.
          </p>
          {error ? (
            <p className="text-[11px] text-muted-foreground/80">{error}</p>
          ) : null}
          <div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => reload()}
              aria-label="Retry loading alerts"
            >
              Retry
            </Button>
          </div>
        </div>
      ) : alerts.length === 0 ? (
        <EmptyState
          icon={<Bell className="h-6 w-6" />}
          title="No open alerts."
          description="Verdant will show environment or grow warnings here when they appear. Nothing needs your attention right now."
        />
      ) : (
        <div className="space-y-6">
          {(
            [
              { key: "open", label: "Open" },
              { key: "acknowledged", label: "Acknowledged" },
              { key: "resolved", label: "Resolved" },
              { key: "dismissed", label: "Dismissed" },
            ] as const
          ).map((group) => {
            const items = grouped[group.key];
            if (items.length === 0) return null;
            return (
              <section key={group.key} aria-label={`${group.label} alerts`}>
                <h2 className="font-display font-semibold text-sm mb-2">
                  {group.label}{" "}
                  <span className="text-xs text-muted-foreground">
                    {items.length}
                  </span>
                </h2>
                <ul className="space-y-2">
                  {items.map((a) => (
                    <AlertCard
                      key={a.id}
                      alert={a}
                      linkedSummary={linkedActionCounts.get(a.id)}
                      onAcknowledge={handleAcknowledge}
                      onResolve={handleResolve}
                      onDismiss={handleDismiss}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Read-only per-alert audit history. Reads `alert_events` via RLS-protected
 * select. Renders nothing if there are no events or the table is unavailable.
 */
function AlertHistory({ alertId }: { alertId: string }) {
  const { status, events } = useAlertEvents(alertId);
  if (status !== "ok" || events.length === 0) return null;
  return (
    <details className="mt-1">
      <summary className="text-[11px] text-muted-foreground cursor-pointer select-none">
        History ({events.length})
      </summary>
      <ol className="mt-1 space-y-1 pl-3 border-l border-border/40">
        {events.slice(0, 8).map((e) => (
          <li key={e.id} className="text-[11px] text-muted-foreground">
            <span className="font-medium">{e.event_type}</span>
            {e.previous_status && e.new_status ? (
              <span>
                {" "}
                — {e.previous_status} → {e.new_status}
              </span>
            ) : null}{" "}
            <span className="opacity-70">
              {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}

type AlertActionHandler = (
  id: string,
  growId: string,
  prev: AlertStatusRow,
) => void;

interface AlertCardProps {
  alert: AlertRow;
  linkedSummary: ReturnType<
    ReturnType<typeof useAlertsLinkedActionCounts>["get"]
  >;
  onAcknowledge: AlertActionHandler;
  onResolve: AlertActionHandler;
  onDismiss: AlertActionHandler;
}

function AlertCard({
  alert: a,
  linkedSummary,
  onAcknowledge,
  onResolve,
  onDismiss,
}: AlertCardProps) {
  const titleId = useId();
  const seenLabel = formatAlertSeenLabel(a.first_seen_at);
  const sourceLabel = formatAlertSourceLabel(a.source);
  const severityLabel = SEVERITY_LABEL[a.severity] ?? "Info";
  const statusLabel = STATUS_LABEL[a.status] ?? "Open";
  const ariaLabel = buildAlertRowAriaLabel({
    severity: a.severity,
    status: a.status,
    title: a.title,
    source: a.source,
    firstSeenAt: a.first_seen_at,
  });
  const seenIso =
    a.first_seen_at && Number.isFinite(Date.parse(a.first_seen_at))
      ? a.first_seen_at
      : undefined;
  return (
    <li>
      <article
        aria-labelledby={titleId}
        aria-label={ariaLabel}
        className="glass rounded-2xl p-4 flex flex-col gap-2 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant="outline"
            className={`text-[10px] uppercase ${SEVERITY_TONE[a.severity]}`}
            aria-label={`Severity: ${severityLabel}`}
          >
            {severityLabel}
          </Badge>
          <Badge
            variant="outline"
            className={`text-[10px] uppercase ${STATUS_TONE[a.status]}`}
            aria-label={`Status: ${statusLabel}`}
          >
            {statusLabel}
          </Badge>
          <h3 id={titleId} className="text-sm font-medium m-0">
            <Link
              to={alertDetailPath(a.id)}
              className="hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
            >
              {a.title}
            </Link>
          </h3>
          <span
            className="text-[11px] text-muted-foreground"
            aria-label={`Source: ${sourceLabel}`}
            data-testid="alert-row-source"
          >
            {sourceLabel}
          </span>
          <time
            className="ml-auto text-[11px] text-muted-foreground"
            dateTime={seenIso}
            aria-label={`First seen ${seenLabel}`}
          >
            {seenLabel}
          </time>
        </div>
        <p className="text-xs text-muted-foreground">{a.reason}</p>
        <AlertWhyContext alert={a} variant="compact" />
        <LinkedActionCountBadge
          alertId={a.id}
          summary={linkedSummary}
          growId={a.grow_id}
          testIdPrefix="alert-row"
        />

        <div className="flex flex-wrap gap-2">
          {a.status !== "acknowledged" && a.status !== "resolved" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAcknowledge(a.id, a.grow_id, a.status)}
              aria-label={`Acknowledge alert: ${a.title || "Untitled alert"}`}
              data-testid="alert-row-acknowledge"
            >
              Acknowledge
            </Button>
          )}
          {a.status !== "resolved" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onResolve(a.id, a.grow_id, a.status)}
              aria-label={`Resolve alert: ${a.title || "Untitled alert"}`}
              data-testid="alert-row-resolve"
            >
              Resolve
            </Button>
          )}
          {a.status !== "dismissed" && a.status !== "resolved" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDismiss(a.id, a.grow_id, a.status)}
              aria-label={`Dismiss alert: ${a.title || "Untitled alert"}`}
              data-testid="alert-row-dismiss"
            >
              Dismiss
            </Button>
          )}
        </div>
        <AlertHistory alertId={a.id} />
      </article>
    </li>
  );
}
