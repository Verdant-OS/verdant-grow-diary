/**
 * AlertDetail — read-only-first inspection of a single persisted alert.
 *
 * Safety constraints (see docs/security-checklist.md):
 *   - No coach invocations.
 *   - No outbound equipment surface and no execution paths.
 *   - No privileged role usage.
 *   - Status mutations always: update alert -> append alert_events row.
 *   - "Add to Action Queue" is user-initiated only, creates a
 *     suggested/pending_approval row, never runs anything.
 *     Mapping lives in src/lib/alertToActionQueueRules.ts (no JSX duplication).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Bell, History, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { AlertWhyContext } from "@/components/AlertWhyContext";

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
import { actionDetailPath, alertsPath, growDetailPath } from "@/lib/routes";
import { actionMatchesAlert, buildActionQueueDraftFromAlert } from "@/lib/alertToActionQueueRules";
import {
  getActionQueueSourceLabel,
  hasPendingActionsForClosedAlert,
  isActionDerivedFromAlert,
} from "@/lib/actionQueueProvenanceRules";
import {
  pickLatestOutcomeForAction,
  type RawOutcomeDiaryRow,
} from "@/lib/relatedActionOutcomeRules";
import { ACTION_OUTCOME_EVENT_TYPE } from "@/lib/actionOutcomeRules";

import { supabase } from "@/integrations/supabase/client";

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

interface RelatedActionRow {
  id: string;
  grow_id: string | null;
  source: string | null;
  reason: string | null;
  status: string | null;
  risk_level: string | null;
  suggested_change: string | null;
  action_type: string | null;
  created_at: string | null;
}

export default function AlertDetail() {
  const { alertId } = useParams<{ alertId: string }>();
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [alert, setAlert] = useState<AlertRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eventsKey, setEventsKey] = useState(0);
  const [existingActionId, setExistingActionId] = useState<string | null>(null);
  const [queuing, setQueuing] = useState(false);
  const [relatedActions, setRelatedActions] = useState<RelatedActionRow[]>([]);
  const [relatedLoaded, setRelatedLoaded] = useState(false);
  const [outcomeRows, setOutcomeRows] = useState<RawOutcomeDiaryRow[]>([]);

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
      toast.warning(`Alert ${label}d, but audit log failed: ${(logErr as Error).message}`);
    }
    setEventsKey((k) => k + 1);
  };

  const draftResult = useMemo(
    () => (alert ? buildActionQueueDraftFromAlert(alert) : null),
    [alert],
  );
  const canQueue = !!draftResult && draftResult.ok && alert?.status === "open";

  // Read-only stale-action warning: closed alert + still-pending related items.
  const showStaleActionWarning = useMemo(
    () => hasPendingActionsForClosedAlert(alert?.status, relatedActions),
    [alert?.status, relatedActions],
  );

  // Idempotency probe: look for an existing pending/approved action row that
  // already references this alert via its back-pointer token.
  useEffect(() => {
    let cancelled = false;
    setExistingActionId(null);
    if (!alert || !alert.grow_id) return;
    (async () => {
      const { data, error: probeErr } = await supabase
        .from("action_queue")
        .select("id,source,status,reason,grow_id")
        .eq("grow_id", alert.grow_id)
        .eq("source", "environment_alert")
        .in("status", ["pending_approval", "approved"])
        .like("reason", `%[alert:${alert.id}]%`)
        .limit(1);
      if (cancelled || probeErr) return;
      const match = (data ?? []).find((r) => actionMatchesAlert(r as never, alert));
      if (match) setExistingActionId(match.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [alert]);

  // Read-only reverse provenance: list action_queue rows derived from this alert.
  useEffect(() => {
    let cancelled = false;
    setRelatedActions([]);
    setRelatedLoaded(false);
    if (!alert || !alert.grow_id) return;
    (async () => {
      const { data, error: relErr } = await supabase
        .from("action_queue")
        .select(
          "id,grow_id,source,reason,status,risk_level,suggested_change,action_type,created_at",
        )
        .eq("grow_id", alert.grow_id)
        .eq("source", "environment_alert")
        .like("reason", `%[alert:${alert.id}]%`)
        .order("created_at", { ascending: false })
        .limit(20);
      if (cancelled) return;
      if (relErr) {
        setRelatedLoaded(true);
        return;
      }
      const rows = (data ?? []) as RelatedActionRow[];
      // Deterministic filter via shared pure helper — no inline regex.
      const matched = rows
        .filter((r) => isActionDerivedFromAlert(r, alert.id))
        .sort((a, b) => {
          const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
          const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
          if (tb !== ta) return tb - ta;
          return a.id.localeCompare(b.id);
        });
      setRelatedActions(matched);
      setRelatedLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [alert]);

  // Read-only outcome rollup: grower-recorded action_outcome diary entries
  // tied to this alert via details.source_alert_id. RLS handles ownership.
  // No user_id in payloads. No inserts/updates/deletes.
  useEffect(() => {
    let cancelled = false;
    setOutcomeRows([]);
    if (!alert || !relatedLoaded || relatedActions.length === 0) return;
    (async () => {
      const { data, error: outcomeErr } = await supabase
        .from("diary_entries")
        .select("id,entry_at,created_at,note,details")
        .eq("grow_id", alert.grow_id)
        .contains("details", {
          event_type: ACTION_OUTCOME_EVENT_TYPE,
          source_alert_id: alert.id,
        })
        .order("entry_at", { ascending: false })
        .limit(50);
      if (cancelled || outcomeErr) return;
      setOutcomeRows((data ?? []) as RawOutcomeDiaryRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [alert, relatedLoaded, relatedActions.length]);

  async function addAlertToActionQueue() {
    if (!alert || !draftResult || !draftResult.ok || existingActionId) return;
    setQueuing(true);
    const { draft } = draftResult;
    // SECURITY: never send user_id from the client. DB default (auth.uid()) wins.
    const { data: inserted, error: insErr } = await supabase
      .from("action_queue")
      .insert({
        grow_id: draft.grow_id,
        tent_id: draft.tent_id,
        plant_id: draft.plant_id,
        action_type: draft.action_type,
        target_metric: draft.target_metric,
        suggested_change: draft.suggested_change,
        reason: draft.reason,
        risk_level: draft.risk_level,
        source: draft.source,
        status: draft.status,
      })
      .select("id,grow_id")
      .single();
    if (insErr) {
      setQueuing(false);
      const msg = (insErr.message || "").toLowerCase();
      if (
        insErr.code === "42501" ||
        msg.includes("row-level security") ||
        msg.includes("violates")
      ) {
        toast.error("This action cannot be queued until the plant/tent is assigned to this grow.", {
          description: "Open Lineage Repair to assign tents to this grow.",
        });
        return;
      }
      toast.error(insErr.message);
      return;
    }
    if (inserted?.id) {
      setExistingActionId(inserted.id);
      const { error: auditError } = await supabase.from("action_queue_events").insert({
        action_queue_id: inserted.id,
        grow_id: inserted.grow_id ?? draft.grow_id,
        event_type: "created",
        previous_status: null,
        new_status: "pending_approval",
        note: draft.audit_note,
      });
      if (auditError) {
        setQueuing(false);
        toast.warning("Action queued, but audit log failed.", {
          description: auditError.message,
        });
        return;
      }
    }
    setQueuing(false);
    toast.success("Action queued for approval.");
  }

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
            <h2 className="font-display font-semibold text-base">{alert.title}</h2>
            <p className="text-sm text-muted-foreground mt-1">{alert.reason}</p>
            <div className="mt-3">
              <AlertWhyContext alert={alert} variant="detailed" />
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs mt-4">
              <div className="rounded-lg border border-border/40 bg-secondary/20 p-2">
                <dt className="uppercase tracking-wider text-muted-foreground">Grow</dt>
                <dd className="font-medium">
                  <Link to={growDetailPath(alert.grow_id)} className="text-primary hover:underline">
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
                    runStatusChange("acknowledged", () => acknowledgeAlert(alert.id), "acknowledge")
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
                    runStatusChange("resolved", () => resolveAlert(alert.id), "resolve")
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
                    runStatusChange("dismissed", () => dismissAlert(alert.id), "dismiss")
                  }
                >
                  Dismiss
                </Button>
              )}
              {(alert.status === "dismissed" || alert.status === "resolved") && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => runStatusChange("reopened", () => reopenAlert(alert.id), "reopen")}
                >
                  Reopen
                </Button>
              )}
            </div>

            {alert.status === "open" && (
              <div
                className="mt-4 rounded-lg border border-border/40 bg-secondary/10 p-3"
                aria-label="Action queue handoff"
              >
                <div className="flex items-start gap-2">
                  <ListChecks className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-xs font-medium">Suggested action</p>
                    <p className="text-[11px] text-muted-foreground/90 mt-0.5">
                      Verdant can prepare a recommended action for review. Nothing is executed
                      automatically.
                    </p>
                    {draftResult && draftResult.ok ? (
                      <p className="text-xs text-muted-foreground mt-1">
                        {draftResult.draft.suggested_change}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-1">
                        Not enough alert context to draft a safe action.
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {existingActionId ? (
                        <>
                          <Button asChild size="sm" variant="secondary">
                            <Link to={`/actions/${existingActionId}`}>
                              ✓ Action already queued — view details
                            </Link>
                          </Button>
                          <p className="w-full text-[10px] text-muted-foreground/80">
                            A recommended action for this alert already exists and is awaiting your
                            review.
                          </p>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!canQueue || queuing}
                          onClick={addAlertToActionQueue}
                        >
                          {queuing ? "Adding…" : "Add to Action Queue"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="glass rounded-2xl p-4" aria-label="Related Action Queue Items">
            <div className="flex items-center gap-2 mb-2">
              <ListChecks className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-display font-semibold text-sm">
                Related Action Queue Items{" "}
                <span className="text-xs text-muted-foreground">{relatedActions.length}</span>
              </h2>
            </div>
            {showStaleActionWarning && (
              <div
                role="alert"
                aria-label="Stale action warning"
                data-testid="stale-action-warning"
                className="mb-3 rounded-lg border border-amber-500/60 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300"
              >
                This alert is no longer open, but related actions are still pending review. Confirm the current grow conditions before approving.
              </div>
            )}

            {!relatedLoaded ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : relatedActions.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No queue items have been created from this alert yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {relatedActions.map((a) => {
                  const outcome = pickLatestOutcomeForAction(outcomeRows, a.id);
                  const isCompleted = a.status === "completed";
                  return (
                  <li key={a.id} className="rounded-lg border border-border/40 bg-secondary/20 p-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {a.status && (
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {a.status}
                        </Badge>
                      )}
                      {a.risk_level && (
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {a.risk_level}
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className="text-[10px] uppercase border-primary text-primary"
                      >
                        {getActionQueueSourceLabel(a)}
                      </Badge>
                      {outcome && (
                        <Badge
                          variant="outline"
                          data-testid="related-action-outcome-badge"
                          className="text-[10px] uppercase border-emerald-500/60 text-emerald-600 dark:text-emerald-300"
                        >
                          Outcome: {outcome.label}
                        </Badge>
                      )}
                      <Link
                        to={actionDetailPath(a.id)}
                        className="ml-auto text-xs text-primary hover:underline"
                      >
                        Open
                      </Link>
                    </div>
                    <p className="text-sm mt-1 break-words">
                      {a.suggested_change ?? a.action_type ?? a.id}
                    </p>
                    {a.created_at && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(a.created_at), {
                          addSuffix: true,
                        })}
                      </p>
                    )}
                    {outcome ? (
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        <span>Grower-recorded outcome</span>
                        {outcome.recorded_at && (
                          <span>
                            {" "}— recorded{" "}
                            {formatDistanceToNow(new Date(outcome.recorded_at), {
                              addSuffix: true,
                            })}
                          </span>
                        )}
                        <div className="text-[10px] opacity-80">Recorded after follow-up</div>
                        {outcome.note && (
                          <div className="text-[11px] mt-0.5 opacity-90 break-words">
                            {outcome.note}
                          </div>
                        )}
                      </div>
                    ) : isCompleted ? (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        No outcome recorded yet
                      </p>
                    ) : null}
                  </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="glass rounded-2xl p-4" aria-label="Alert history">
            <div className="flex items-center gap-2 mb-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-display font-semibold text-sm">
                History <span className="text-xs text-muted-foreground">{events.length}</span>
              </h2>
            </div>
            {events.length === 0 ? (
              <p className="text-xs text-muted-foreground">No events yet.</p>
            ) : (
              <ol className="space-y-1 pl-3 border-l border-border/40">
                {events.map((e) => (
                  <li key={e.id} className="text-xs text-muted-foreground">
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
                    {e.note ? <div className="text-[11px] opacity-80 mt-0.5">{e.note}</div> : null}
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
