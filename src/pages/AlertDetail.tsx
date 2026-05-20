/**
 * AlertDetail — read-only-first inspection of a single persisted alert.
 *
 * Safety:
 *   - No ai-coach calls.
 *   - No Action Queue writes.
 *   - No external device control.
 *   - No service_role usage.
 *   - Status mutations always: update alert -> append alert_events row.
 *     Audit-log failure surfaces a warning toast but does not roll back.
 */
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Bell, History } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

import PageHeader from "@/components/PageHeader";
import GrowBreadcrumbs from "@/components/GrowBreadcrumbs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  acknowledgeAlert,
  dismissAlert,
  getAlertById,
  logAlertEvent,
  reopenAlert,
  resolveAlert,
  type AlertRow,
  type AlertSeverityRow,
  type AlertStatusRow,
} from "@/lib/alerts";
import { useAlertEvents } from "@/hooks/useAlertEvents";
import {
  alertsPath,
  growDetailPath,
} from "@/lib/routes";

type LoadStatus = "idle" | "loading" | "ok" | "not_found" | "error";

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

function fmt(ts: string | null | undefined): string {
  if (!ts) return "—";
  try {
    return `${new Date(ts).toLocaleString()} (${formatDistanceToNow(new Date(ts), { addSuffix: true })})`;
  } catch {
    return ts;
  }
}

export default function AlertDetail() {
  const { alertId } = useParams<{ alertId: string }>();
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [alert, setAlert] = useState<AlertRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eventsKey, setEventsKey] = useState(0);

  const load = useCallback(async () => {
    if (!alertId) return;
    setStatus("loading");
    setError(null);
    try {
      const row = await getAlertById(alertId);
      if (!row) {
        setAlert(null);
        setStatus("not_found");
        return;
      }
      setAlert(row);
      setStatus("ok");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, [alertId]);

  useEffect(() => {
    load();
  }, [load]);

  const { events } = useAlertEvents(alertId ?? null, eventsKey);

  const runStatusChange = async (
    event_type: "acknowledged" | "resolved" | "dismissed" | "reopened",
    op: () => Promise<AlertRow>,
    label: string,
  ) => {
    if (!alert) return;
    const previous_status = alert.status;
    let updated: AlertRow;
    try {
      updated = await op();
    } catch (e) {
      toast.error(`Failed to ${label}: ${(e as Error).message}`);
      return;
    }
    setAlert(updated);
    try {
      await logAlertEvent({
        alert_id: alert.id,
        grow_id: alert.grow_id,
        event_type,
        previous_status,
        new_status: updated.status,
      });
      toast.success(`Alert ${label}d`);
    } catch (logErr) {
      toast.warning(
        `Alert ${label}d, but audit log failed: ${(logErr as Error).message}`,
      );
    }
    setEventsKey((k) => k + 1);
  };

  return (
    <div>
      <GrowBreadcrumbs
        growId={alert?.grow_id ?? null}
        growName={null}
        current="Alert"
        section="alerts"
      />
      <PageHeader
        title="Alert detail"
        description="Inspect a saved alert, its status, and audit history."
        icon={<Bell className="h-5 w-5" />}
        actions={
          <Button asChild size="sm" variant="ghost">
            <Link to={alertsPath()}>
              <ArrowLeft className="h-3 w-3 mr-1" /> Back to Alert Center
            </Link>
          </Button>
        }
      />

      {status === "loading" || status === "idle" ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : status === "not_found" ? (
        <div className="glass rounded-2xl p-6">
          <p className="text-sm font-medium">Alert not found.</p>
          <p className="text-xs text-muted-foreground mt-1">
            It may have been deleted, or you may not have access to it.
          </p>
          <Button asChild size="sm" variant="outline" className="mt-3">
            <Link to={alertsPath()}>Back to Alert Center</Link>
          </Button>
        </div>
      ) : status === "error" ? (
        <p className="text-sm text-muted-foreground">
          Alert unavailable{error ? `: ${error}` : "."}
        </p>
      ) : alert ? (
        <div className="space-y-4">
          <section className="glass rounded-2xl p-4">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <Badge
                variant="outline"
                className={`text-[10px] uppercase ${SEVERITY_TONE[alert.severity]}`}
              >
                {alert.severity}
              </Badge>
              <Badge
                variant="outline"
                className={`text-[10px] uppercase ${STATUS_TONE[alert.status]}`}
              >
                {alert.status}
              </Badge>
              {alert.metric && (
                <Badge variant="outline" className="text-[10px] uppercase">
                  {alert.metric}
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px] uppercase">
                {alert.source}
              </Badge>
            </div>
            <h2 className="font-display font-semibold text-base">
              {alert.title}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">{alert.reason}</p>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs mt-4">
              <div className="rounded-lg border border-border/40 bg-secondary/20 p-2">
                <dt className="uppercase tracking-wider text-muted-foreground">Grow</dt>
                <dd className="font-medium">
                  <Link
                    to={growDetailPath(alert.grow_id)}
                    className="text-primary hover:underline"
                  >
                    {alert.grow_id}
                  </Link>
                </dd>
              </div>
              {alert.tent_id && (
                <div className="rounded-lg border border-border/40 bg-secondary/20 p-2">
                  <dt className="uppercase tracking-wider text-muted-foreground">Tent</dt>
                  <dd className="font-medium">
                    <Link
                      to={`/tents/${encodeURIComponent(alert.tent_id)}`}
                      className="text-primary hover:underline"
                    >
                      {alert.tent_id}
                    </Link>
                  </dd>
                </div>
              )}
              {alert.plant_id && (
                <div className="rounded-lg border border-border/40 bg-secondary/20 p-2">
                  <dt className="uppercase tracking-wider text-muted-foreground">Plant</dt>
                  <dd className="font-medium">
                    <Link
                      to={`/plants/${encodeURIComponent(alert.plant_id)}`}
                      className="text-primary hover:underline"
                    >
                      {alert.plant_id}
                    </Link>
                  </dd>
                </div>
              )}
              <div className="rounded-lg border border-border/40 bg-secondary/20 p-2">
                <dt className="uppercase tracking-wider text-muted-foreground">First seen</dt>
                <dd>{fmt(alert.first_seen_at)}</dd>
              </div>
              <div className="rounded-lg border border-border/40 bg-secondary/20 p-2">
                <dt className="uppercase tracking-wider text-muted-foreground">Last seen</dt>
                <dd>{fmt(alert.last_seen_at)}</dd>
              </div>
              {alert.acknowledged_at && (
                <div className="rounded-lg border border-border/40 bg-secondary/20 p-2">
                  <dt className="uppercase tracking-wider text-muted-foreground">Acknowledged</dt>
                  <dd>{fmt(alert.acknowledged_at)}</dd>
                </div>
              )}
              {alert.resolved_at && (
                <div className="rounded-lg border border-border/40 bg-secondary/20 p-2">
                  <dt className="uppercase tracking-wider text-muted-foreground">Resolved</dt>
                  <dd>{fmt(alert.resolved_at)}</dd>
                </div>
              )}
              <div className="rounded-lg border border-border/40 bg-secondary/20 p-2">
                <dt className="uppercase tracking-wider text-muted-foreground">Created</dt>
                <dd>{fmt(alert.created_at)}</dd>
              </div>
              <div className="rounded-lg border border-border/40 bg-secondary/20 p-2">
                <dt className="uppercase tracking-wider text-muted-foreground">Updated</dt>
                <dd>{fmt(alert.updated_at)}</dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-2 mt-4">
              {alert.status === "open" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    runStatusChange(
                      "acknowledged",
                      () => acknowledgeAlert(alert.id),
                      "acknowledge",
                    )
                  }
                >
                  Acknowledge
                </Button>
              )}
              {(alert.status === "open" || alert.status === "acknowledged") && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    runStatusChange(
                      "resolved",
                      () => resolveAlert(alert.id),
                      "resolve",
                    )
                  }
                >
                  Resolve
                </Button>
              )}
              {(alert.status === "open" || alert.status === "acknowledged") && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    runStatusChange(
                      "dismissed",
                      () => dismissAlert(alert.id),
                      "dismiss",
                    )
                  }
                >
                  Dismiss
                </Button>
              )}
              {(alert.status === "dismissed" || alert.status === "resolved") && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    runStatusChange(
                      "reopened",
                      () => reopenAlert(alert.id),
                      "reopen",
                    )
                  }
                >
                  Reopen
                </Button>
              )}
            </div>
          </section>

          <section className="glass rounded-2xl p-4" aria-label="Alert history">
            <div className="flex items-center gap-2 mb-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-display font-semibold text-sm">
                History{" "}
                <span className="text-xs text-muted-foreground">
                  {events.length}
                </span>
              </h2>
            </div>
            {events.length === 0 ? (
              <p className="text-xs text-muted-foreground">No events yet.</p>
            ) : (
              <ol className="space-y-1 pl-3 border-l border-border/40">
                {events.map((e) => (
                  <li
                    key={e.id}
                    className="text-xs text-muted-foreground"
                  >
                    <span className="font-medium">{e.event_type}</span>
                    {e.previous_status && e.new_status ? (
                      <span>
                        {" "}
                        — {e.previous_status} → {e.new_status}
                      </span>
                    ) : null}{" "}
                    <span className="opacity-70">
                      {formatDistanceToNow(new Date(e.created_at), {
                        addSuffix: true,
                      })}
                    </span>
                    {e.note ? (
                      <div className="text-[11px] opacity-80 mt-0.5">
                        {e.note}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
