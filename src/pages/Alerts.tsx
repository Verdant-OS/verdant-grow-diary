import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { toast } from "sonner";

import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import ScopedGrowBanner from "@/components/ScopedGrowBanner";
import GrowBreadcrumbs from "@/components/GrowBreadcrumbs";
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
import {
  acknowledgeAlert,
  dismissAlert,
  logAlertEvent,
  resolveAlert,
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

      {status === "loading" || status === "idle" ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : status === "unavailable" ? (
        <p className="text-sm text-muted-foreground">
          Alerts unavailable{error ? `: ${error}` : "."}
        </p>
      ) : alerts.length === 0 ? (
        <EmptyState icon={<Bell className="h-6 w-6" />} title="No alerts" />
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
                    <li
                      key={a.id}
                      className="glass rounded-2xl p-4 flex flex-col gap-2"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant="outline"
                          className={`text-[10px] uppercase ${SEVERITY_TONE[a.severity]}`}
                        >
                          {a.severity}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-[10px] uppercase ${STATUS_TONE[a.status]}`}
                        >
                          {a.status}
                        </Badge>
                        <span className="text-sm font-medium">{a.title}</span>
                        <span className="ml-auto text-[11px] text-muted-foreground">
                          {formatDistanceToNow(new Date(a.first_seen_at), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {a.reason}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {a.status !== "acknowledged" &&
                          a.status !== "resolved" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                handleAcknowledge(a.id, a.grow_id, a.status)
                              }
                            >
                              Acknowledge
                            </Button>
                          )}
                        {a.status !== "resolved" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              handleResolve(a.id, a.grow_id, a.status)
                            }
                          >
                            Resolve
                          </Button>
                        )}
                        {a.status !== "dismissed" &&
                          a.status !== "resolved" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                handleDismiss(a.id, a.grow_id, a.status)
                              }
                            >
                              Dismiss
                            </Button>
                          )}
                      </div>
                      <AlertHistory alertId={a.id} />
                    </li>
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
