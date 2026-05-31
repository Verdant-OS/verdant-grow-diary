import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { useGrows } from "@/store/grows";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Check, X, FlaskConical, ListChecks, History, CheckCircle2, Ban } from "lucide-react";
import ScopedGrowBanner from "@/components/ScopedGrowBanner";
import GrowBreadcrumbs from "@/components/GrowBreadcrumbs";
import { useScopedGrow } from "@/hooks/useScopedGrow";
import { actionDetailPath, actionsPath, aiDoctorSessionDetailPath } from "@/lib/routes";
import { toast } from "sonner";
import {
  type ActionStatus,
  type ActionEventType,
  type TransitionKind,
  isTerminalStatus,
  canComplete,
  canCancel,
  buildTransitionPatch,
  
  eventTypeFor,
  nextStatusFor,
  normalizeNote,
} from "@/lib/actionQueueTransitions";
import {
  ACTION_QUEUE_SOURCE_VALUES,
  getActionQueueSourceLabel,
  isAlertDerived,
  isAiDoctorDerived,
  extractSourceAiDoctorSessionId,
  stripBackPointerTokens,
} from "@/lib/actionQueueProvenanceRules";
import { buildActionQueueGrowContextHint } from "@/lib/actionQueueGrowContextHintRules";


type Status = ActionStatus;
type EventType = ActionEventType;

type StatusFilter = "all" | "pending" | "simulated" | "approved" | "rejected" | "completed" | "cancelled";
type RiskFilter = "all" | "low" | "medium" | "high" | "critical";
type SourceFilter =
  | "all"
  | typeof ACTION_QUEUE_SOURCE_VALUES.ENVIRONMENT_ALERT
  | typeof ACTION_QUEUE_SOURCE_VALUES.AI_COACH
  | typeof ACTION_QUEUE_SOURCE_VALUES.AI_DOCTOR
  | typeof ACTION_QUEUE_SOURCE_VALUES.MANUAL;


type SortOrder = "newest" | "oldest" | "risk";


interface ActionRow {
  id: string;
  grow_id: string;
  tent_id: string | null;
  plant_id: string | null;
  source: string;
  action_type: string;
  target_metric: string | null;
  target_device: string | null;
  suggested_change: string;
  reason: string;
  risk_level: "low" | "medium" | "high" | "critical";
  status: Status;
  approved_at: string | null;
  rejected_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface EventRow {
  id: string;
  action_queue_id: string;
  event_type: EventType;
  previous_status: string | null;
  new_status: string | null;
  note: string | null;
  created_at: string;
}

const RISK_VARIANT: Record<ActionRow["risk_level"], string> = {
  low: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  high: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  critical: "bg-red-500/15 text-red-300 border-red-500/30",
};

const RISK_RANK: Record<ActionRow["risk_level"], number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Read-only AI Doctor session back-link affordance. Renders nothing when
 * the row is not AI Doctor-derived or when no safe session id can be parsed
 * from the reason. Never exposes raw `[session:<id>]` tokens or device fields.
 */
function AiDoctorSessionLink({
  row,
}: {
  row: Pick<ActionRow, "source" | "reason">;
}) {
  if (!isAiDoctorDerived(row)) return null;
  const sessionId = extractSourceAiDoctorSessionId(row.reason);
  if (!sessionId) return null;
  return (
    <span
      className="inline-flex items-center gap-2 text-xs text-muted-foreground"
      data-testid="action-queue-row-ai-doctor-session-link"
    >
      <span>Linked from AI Doctor</span>
      <Link
        to={aiDoctorSessionDetailPath(sessionId)}
        className="text-primary hover:underline"
        data-testid="action-queue-row-ai-doctor-session-link-anchor"
      >
        View AI Doctor session
      </Link>
    </span>
  );
}


export default function ActionQueue() {
  const { user } = useAuth();
  const { grows, activeGrowId, activeGrow } = useGrows();
  // Shared URL `?growId=` resolution against RLS-loaded grows. urlGrowId precedence
  // over activeGrowId is preserved exactly as before.
  const { urlGrowId, scopedGrowName, backHref } = useScopedGrow();
  const effectiveGrowId = urlGrowId ?? activeGrowId;
  const [rows, setRows] = useState<ActionRow[]>([]);
  const [events, setEvents] = useState<Record<string, EventRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [noteDialog, setNoteDialog] = useState<
    { row: ActionRow; kind: "approve" | "reject" | "simulate" | "complete" | "cancel" } | null
  >(null);
  const [noteDraft, setNoteDraft] = useState("");

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");

  // Deep-link focus: /actions?focus=<action_id>. Presenter-only; never mutates rows.
  const [searchParams, setSearchParams] = useSearchParams();
  const focusedActionId = searchParams.get("focus");

  const clearFocus = useCallback(() => {
    // Remove ONLY the `focus` query param. Preserve every other param
    // (filters, search, status tabs, pagination, growId, etc.).
    const next = new URLSearchParams(searchParams);
    next.delete("focus");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);






  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const q = supabase
      .from("action_queue")
      .select(
        "id,grow_id,tent_id,plant_id,source,action_type,target_metric,target_device,suggested_change,reason,risk_level,status,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    const { data, error } = effectiveGrowId ? await q.eq("grow_id", effectiveGrowId) : await q;
    if (error) toast.error(error.message);
    const list = (data ?? []) as ActionRow[];
    setRows(list);

    if (list.length) {
      const ids = list.map((r) => r.id);
      const { data: evs } = await supabase
        .from("action_queue_events")
        .select("id,action_queue_id,event_type,previous_status,new_status,note,created_at")
        .in("action_queue_id", ids)
        .order("created_at", { ascending: false });
      const grouped: Record<string, EventRow[]> = {};
      for (const e of (evs ?? []) as EventRow[]) {
        (grouped[e.action_queue_id] ||= []).push(e);
      }
      setEvents(grouped);
    } else {
      setEvents({});
    }
    setLoading(false);
  }, [user, effectiveGrowId]);

  useEffect(() => {
    load();
  }, [load]);

  // Deep-link focus: after rows render, scroll the matching row into view.
  // Best-effort; if the id is unknown or scrollIntoView is unavailable, we
  // render normally without errors. Read-only — never changes status.
  useEffect(() => {
    if (!focusedActionId || loading) return;
    if (typeof document === "undefined") return;
    const escape =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape
        : (s: string) => s.replace(/"/g, '\\"');
    const el = document.querySelector(
      `[data-action-id="${escape(focusedActionId)}"]`,
    ) as HTMLElement | null;
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [focusedActionId, loading, rows.length]);



  // SECURITY: never sends device commands. Inserts an audit row ONLY.
  // user_id is left to DB default auth.uid(). No privileged backend role.
  async function logEvent(
    row: ActionRow,
    event_type: EventType,
    new_status: Status,
    note?: string,
  ): Promise<boolean> {
    const { error } = await supabase.from("action_queue_events").insert({
      action_queue_id: row.id,
      grow_id: row.grow_id,
      event_type,
      previous_status: row.status,
      new_status,
      note: note ?? null,
    });
    if (error) {
      toast.warning("Status updated, but audit log failed", {
        description: error.message,
      });
      return false;
    }
    return true;
  }

  async function transition(
    row: ActionRow,
    next: Partial<ActionRow>,
    event_type: EventType,
    new_status: Status,
    note?: string,
  ) {
    setBusyId(row.id);
    const { error } = await supabase
      .from("action_queue")
      .update(next)
      .eq("id", row.id);
    if (error) {
      setBusyId(null);
      toast.error(error.message);
      return;
    }
    await logEvent(row, event_type, new_status, note);
    setBusyId(null);
    await load();
  }

  function openNoteDialog(row: ActionRow, kind: TransitionKind) {
    // SECURITY: terminal states cannot be transitioned again.
    if (isTerminalStatus(row.status)) return;
    setNoteDraft("");
    setNoteDialog({ row, kind });
  }

  // SECURITY: each branch only flips status + writes audit. No device commands.
  async function confirmNoteDialog() {
    if (!noteDialog) return;
    const { row, kind } = noteDialog;
    const note = normalizeNote(noteDraft);
    setNoteDialog(null);
    setNoteDraft("");

    if (kind === "simulate") {
      // Simulation NEVER sends device commands. Status + audit only.
      toast.message("Simulated (no device command sent)", {
        description: `${row.action_type} → ${row.target_metric ?? row.target_device}`,
      });
    }
    const patch = buildTransitionPatch(kind);
    await transition(row, patch, eventTypeFor(kind), nextStatusFor(kind), note);
  }

  function cancelNoteDialog() {
    // No status change, no audit event written.
    setNoteDialog(null);
    setNoteDraft("");
  }

  function approve(row: ActionRow) { return openNoteDialog(row, "approve"); }
  function reject(row: ActionRow) { return openNoteDialog(row, "reject"); }
  function simulate(row: ActionRow) { return openNoteDialog(row, "simulate"); }
  function complete(row: ActionRow) { return openNoteDialog(row, "complete"); }
  function cancelAction(row: ActionRow) { return openNoteDialog(row, "cancel"); }


  const DIALOG_META = {
    approve: {
      title: "Approve Action",
      description:
        "Approved actions are recorded for future manual or controlled execution. No equipment command is sent.",
      label: "Approval note",
      placeholder: "Optional — why are you approving?",
      confirmLabel: "Approve",
    },
    reject: {
      title: "Reject Action",
      description: "Reject this suggestion. No equipment command is sent.",
      label: "Rejection reason",
      placeholder: "Optional — why are you rejecting?",
      confirmLabel: "Reject",
    },
    simulate: {
      title: "Simulate Action",
      description: "Marks the action as simulated. No equipment command is sent.",
      label: "Simulation note",
      placeholder: "Optional — what did you simulate?",
      confirmLabel: "Simulate",
    },
    complete: {
      title: "Mark Action Complete",
      description:
        "Marks this action as manually completed outside Verdant. No equipment command is sent.",
      label: "Completion note",
      placeholder: "Optional — what did you do?",
      confirmLabel: "Mark Complete",
    },
    cancel: {
      title: "Cancel Action",
      description:
        "Cancels this action. The grower decided not to proceed. No equipment command is sent.",
      label: "Cancellation reason",
      placeholder: "Optional — why are you cancelling?",
      confirmLabel: "Cancel Action",
    },
  } as const;
  const meta = noteDialog ? DIALOG_META[noteDialog.kind] : null;



  const filtered = useMemo(() => {
    const matchesStatus = (s: Status) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "pending") return s === "pending_approval";
      return s === statusFilter;
    };
    const list = rows
      .filter((r) => matchesStatus(r.status))
      .filter((r) => riskFilter === "all" || r.risk_level === riskFilter)
      .filter((r) => sourceFilter === "all" || (r.source ?? "") === sourceFilter);
    const sorted = [...list].sort((a, b) => {
      if (sortOrder === "risk") return RISK_RANK[b.risk_level] - RISK_RANK[a.risk_level];
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return sortOrder === "oldest" ? ta - tb : tb - ta;
    });
    return sorted;
  }, [rows, statusFilter, riskFilter, sourceFilter, sortOrder]);

  const pending = useMemo(
    () => filtered.filter((r) => r.status === "pending_approval"),
    [filtered],
  );
  const reviewed = useMemo(
    () => filtered.filter((r) => r.status !== "pending_approval"),
    [filtered],
  );

  const filtersActive =
    statusFilter !== "all" ||
    riskFilter !== "all" ||
    sourceFilter !== "all" ||
    sortOrder !== "newest";


  // AUD-008: deterministic grow-context hint built from URL scope, active
  // grow, and the RLS-visible grows list. Never changes which actions are
  // loaded — only describes the current scope.
  const growContextHint = buildActionQueueGrowContextHint({
    urlGrowId,
    activeGrowId,
    activeGrowName: activeGrow?.name ?? null,
    scopedGrowName,
    grows,
  });

  return (
    <div>
      <GrowBreadcrumbs growId={urlGrowId} growName={scopedGrowName} current="Action Queue" section="actions" />
      <div className="mb-5">
        <h1 className="text-2xl font-display font-bold flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary" />
          Action Queue
        </h1>
        <p className="text-sm text-muted-foreground">
          Suggestions are <span className="text-foreground">approval-gated</span>.
          Verdant never sends commands to equipment.
        </p>
        <div
          className="mt-2 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2"
          data-testid="action-queue-grow-context-hint"
          data-context-kind={growContextHint.kind}
          data-is-scoped={growContextHint.isScoped ? "1" : "0"}
        >
          <p className="text-xs text-foreground" data-testid="action-queue-grow-context-message">
            {growContextHint.message}
          </p>
          {growContextHint.helper && (
            <p
              className="text-[11px] text-muted-foreground mt-1"
              data-testid="action-queue-grow-context-helper"
            >
              {growContextHint.helper}
            </p>
          )}
        </div>
      </div>

      {urlGrowId && (
        <ScopedGrowBanner
          growId={urlGrowId}
          growName={scopedGrowName}
          label="actions"
          clearHref={actionsPath()}
          backHref={backHref}
        />
      )}

      {focusedActionId && (
        <div
          className="glass rounded-2xl p-3 mb-4 flex flex-wrap items-center gap-3"
          data-testid="action-queue-focus-chip"
          role="status"
          aria-live="polite"
        >
          <Badge
            variant="outline"
            className="text-[10px] uppercase border-primary text-primary"
          >
            Focused action
          </Badge>
          <span className="text-xs text-muted-foreground">
            Showing linked Action Queue item.
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={clearFocus}
            className="ml-auto"
            data-testid="action-queue-clear-focus"
          >
            Clear focus
          </Button>
        </div>
      )}



      <div
        className="glass rounded-2xl p-3 mb-4 flex flex-wrap gap-2"
        aria-label="Action queue filters"
      >
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="h-9 w-[150px]" aria-label="Status filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="simulated">Simulated</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        <Select value={riskFilter} onValueChange={(v) => setRiskFilter(v as RiskFilter)}>
          <SelectTrigger className="h-9 w-[140px]" aria-label="Risk filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All risks</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as SourceFilter)}>
          <SelectTrigger className="h-9 w-[170px]" aria-label="Source filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value={ACTION_QUEUE_SOURCE_VALUES.ENVIRONMENT_ALERT}>Environment Alerts</SelectItem>
            <SelectItem value={ACTION_QUEUE_SOURCE_VALUES.AI_COACH}>AI Coach</SelectItem>
            <SelectItem value={ACTION_QUEUE_SOURCE_VALUES.AI_DOCTOR}>AI Doctor</SelectItem>
            <SelectItem value={ACTION_QUEUE_SOURCE_VALUES.MANUAL}>Manual</SelectItem>

          </SelectContent>
        </Select>




        <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as SortOrder)}>
          <SelectTrigger className="h-9 w-[170px]" aria-label="Sort order">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="risk">Highest risk first</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <section className="glass rounded-2xl p-4 mb-4" aria-label="Needs Review">
        <h2 className="text-sm font-semibold mb-3 uppercase tracking-wider text-muted-foreground">
          Needs Review ({pending.length})
        </h2>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : pending.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            {filtersActive ? "No actions match these filters." : "No pending actions."}
          </p>
        ) : (
          <ul className="space-y-3">
            {pending.map((row) => (
              <li
                key={row.id}
                data-testid="action-queue-row"
                data-action-id={row.id}
                data-focused={focusedActionId === row.id ? "true" : undefined}
                aria-label={focusedActionId === row.id ? "Focused action" : undefined}
                className={`rounded-xl border border-border/60 bg-secondary/30 p-3 ${
                  focusedActionId === row.id
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                    : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{row.action_type}</span>
                      <Badge variant="outline" className={RISK_VARIANT[row.risk_level]}>
                        {row.risk_level}
                      </Badge>
                      {isAlertDerived(row) && (
                        <Badge
                          variant="outline"
                          className="text-[10px] uppercase border-primary text-primary"
                        >
                          {getActionQueueSourceLabel(row)}
                        </Badge>
                      )}
                      {isAiDoctorDerived(row) && (
                        <>
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase border-primary text-primary"
                            data-testid="action-queue-row-ai-doctor-badge"
                          >
                            AI Doctor
                          </Badge>
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase"
                            data-testid="action-queue-row-review-required-badge"
                          >
                            Review required
                          </Badge>
                        </>
                      )}


                      <span className="text-xs text-muted-foreground">
                        {row.target_metric ?? row.target_device}
                      </span>
                    </div>
                    <p className="text-sm mt-1">{row.suggested_change}</p>
                    <p className="text-xs text-muted-foreground mt-1">{stripBackPointerTokens(row.reason)}</p>
                    <div className="mt-1">
                      <AiDoctorSessionLink row={row} />
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button size="sm" disabled={busyId === row.id} onClick={() => approve(row)} className="gradient-leaf text-primary-foreground">
                    <Check className="h-4 w-4" /> Approve
                  </Button>
                  <Button size="sm" variant="secondary" disabled={busyId === row.id} onClick={() => simulate(row)}>
                    <FlaskConical className="h-4 w-4" /> Simulate
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busyId === row.id} onClick={() => reject(row)}>
                    <X className="h-4 w-4" /> Reject
                  </Button>
                  {canCancel(row.status) && (
                    <Button size="sm" variant="ghost" disabled={busyId === row.id} onClick={() => cancelAction(row)}>
                      <Ban className="h-4 w-4" /> Cancel
                    </Button>
                  )}
                  <Link
                    to={actionDetailPath(row.id)}
                    className="ml-auto text-xs text-primary hover:underline self-center"
                  >
                    View Details
                  </Link>
                </div>
                <EventHistory items={events[row.id]} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="glass rounded-2xl p-4" aria-label="Already Reviewed">
        <h2 className="text-sm font-semibold mb-3 uppercase tracking-wider text-muted-foreground">
          Already Reviewed ({reviewed.length})
        </h2>
        {loading ? null : reviewed.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            {filtersActive ? "No actions match these filters." : "No reviewed actions."}
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {reviewed.slice(0, 50).map((row) => (
              <li
                key={row.id}
                data-testid="action-queue-row"
                data-action-id={row.id}
                data-focused={focusedActionId === row.id ? "true" : undefined}
                aria-label={focusedActionId === row.id ? "Focused action" : undefined}
                className={`rounded-lg border border-border/40 bg-secondary/20 p-2 ${
                  focusedActionId === row.id
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                    : ""
                }`}
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge variant="outline" className="text-[10px] uppercase">{row.status}</Badge>
                  <Badge variant="outline" className={`text-[10px] uppercase ${RISK_VARIANT[row.risk_level]}`}>
                    {row.risk_level}
                  </Badge>
                  {isAlertDerived(row) && (
                    <Badge
                      variant="outline"
                      className="text-[10px] uppercase border-primary text-primary"
                    >
                      {getActionQueueSourceLabel(row)}
                    </Badge>
                  )}
                  {isAiDoctorDerived(row) && (
                    <Badge
                      variant="outline"
                      className="text-[10px] uppercase border-primary text-primary"
                      data-testid="action-queue-row-ai-doctor-badge"
                    >
                      AI Doctor
                    </Badge>
                  )}


                  <span className="truncate flex-1">{row.suggested_change}</span>
                  <span className="text-xs text-muted-foreground">{row.action_type}</span>
                  {canComplete(row.status) && (
                    <Button size="sm" variant="secondary" disabled={busyId === row.id} onClick={() => complete(row)}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Mark Complete
                    </Button>
                  )}
                  {canCancel(row.status) && (
                    <Button size="sm" variant="ghost" disabled={busyId === row.id} onClick={() => cancelAction(row)}>
                      <Ban className="h-3.5 w-3.5" /> Cancel
                    </Button>
                  )}
                  <Link
                    to={actionDetailPath(row.id)}
                    className="text-xs text-primary hover:underline"
                  >
                    View Details
                  </Link>
                </div>
                <div className="mt-1">
                  <AiDoctorSessionLink row={row} />
                </div>
                <EventHistory items={events[row.id]} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog
        open={noteDialog !== null}
        onOpenChange={(open) => {
          if (!open) cancelNoteDialog();
        }}
      >
        <DialogContent>
          {meta && (
            <>
              <DialogHeader>
                <DialogTitle>{meta.title}</DialogTitle>
                <DialogDescription>{meta.description}</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="action-note">{meta.label}</Label>
                <Textarea
                  id="action-note"
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder={meta.placeholder}
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank to confirm without a note. Notes are stored in the audit history and cannot be edited.
                </p>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={cancelNoteDialog}>
                  Cancel
                </Button>
                <Button onClick={confirmNoteDialog}>{meta.confirmLabel}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EventHistory({ items }: { items?: EventRow[] }) {
  if (!items?.length) return null;
  return (
    <div className="mt-2 pt-2 border-t border-border/40">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
        <History className="h-3 w-3" /> History
      </p>
      <ul className="space-y-0.5 text-xs text-muted-foreground">
        {items.map((e) => (
          <li key={e.id} className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] uppercase">{e.event_type}</Badge>
            <span>
              {e.previous_status ?? "—"} → {e.new_status ?? "—"}
            </span>
            <span className="ml-auto">{new Date(e.created_at).toLocaleString()}</span>
            {e.note && <span className="italic">· {e.note}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
