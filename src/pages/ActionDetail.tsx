import { useEffect, useState, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  ArrowLeft,
  Loader2,
  Check,
  X,
  FlaskConical,
  CheckCircle2,
  Ban,
  History,
} from "lucide-react";
import { toast } from "sonner";

import {
  type ActionStatus,
  type ActionEventType,
  type TransitionKind,
  isTerminalStatus,
  canApprove,
  canSimulate,
  canReject,
  canComplete,
  canCancel,
  buildTransitionPatch,
  
  eventTypeFor,
  nextStatusFor,
  normalizeNote,
} from "@/lib/actionQueueTransitions";
import { actionsPath, growDetailPath } from "@/lib/routes";
import GrowBreadcrumbs from "@/components/GrowBreadcrumbs";
import { useGrows } from "@/store/grows";

type Status = ActionStatus;
type EventType = ActionEventType;
type Kind = TransitionKind;
const isTerminal = isTerminalStatus;

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
  updated_at: string;
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

const DIALOG_META: Record<Kind, { title: string; description: string; label: string; placeholder: string; confirmLabel: string }> = {
  approve: {
    title: "Approve Action",
    description: "Approved actions are recorded for future manual or controlled execution. No equipment command is sent.",
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
    description: "Marks this action as manually completed outside Verdant. No equipment command is sent.",
    label: "Completion note",
    placeholder: "Optional — what did you do?",
    confirmLabel: "Mark Complete",
  },
  cancel: {
    title: "Cancel Action",
    description: "Cancels this action. The grower decided not to proceed. No equipment command is sent.",
    label: "Cancellation reason",
    placeholder: "Optional — why are you cancelling?",
    confirmLabel: "Cancel Action",
  },
};


export default function ActionDetail() {
  const { actionId } = useParams<{ actionId: string }>();
  const { user } = useAuth();
  const { grows } = useGrows();
  const [row, setRow] = useState<ActionRow | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<Kind | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  const load = useCallback(async () => {
    if (!user || !actionId) return;
    setLoading(true);
    setNotFound(false);
    const { data, error } = await supabase
      .from("action_queue")
      .select(
        "id,grow_id,tent_id,plant_id,source,action_type,target_metric,target_device,suggested_change,reason,risk_level,status,approved_at,rejected_at,completed_at,created_at,updated_at",
      )
      .eq("id", actionId)
      .maybeSingle();
    if (error || !data) {
      setRow(null);
      setEvents([]);
      setNotFound(true);
      setLoading(false);
      return;
    }
    setRow(data as ActionRow);
    const { data: evs } = await supabase
      .from("action_queue_events")
      .select("id,action_queue_id,event_type,previous_status,new_status,note,created_at")
      .eq("action_queue_id", actionId)
      .order("created_at", { ascending: false });
    setEvents((evs ?? []) as EventRow[]);
    setLoading(false);
  }, [user, actionId]);

  useEffect(() => {
    load();
  }, [load]);

  // SECURITY: audit-only insert. No device commands. user_id omitted (DB default auth.uid()).
  async function logEvent(
    current: ActionRow,
    event_type: EventType,
    new_status: Status,
    note?: string,
  ): Promise<boolean> {
    const { error } = await supabase.from("action_queue_events").insert({
      action_queue_id: current.id,
      grow_id: current.grow_id,
      event_type,
      previous_status: current.status,
      new_status,
      note: note ?? null,
    });
    if (error) {
      toast.warning("Status updated, but audit log failed", { description: error.message });
      return false;
    }
    return true;
  }

  async function transition(
    current: ActionRow,
    next: Partial<ActionRow>,
    event_type: EventType,
    new_status: Status,
    note?: string,
  ) {
    setBusy(true);
    const { error } = await supabase
      .from("action_queue")
      .update(next)
      .eq("id", current.id);
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }
    await logEvent(current, event_type, new_status, note);
    setBusy(false);
    await load();
  }

  function openDialog(kind: Kind) {
    if (!row || isTerminal(row.status)) return;
    setNoteDraft("");
    setDialog(kind);
  }

  async function confirmDialog() {
    if (!row || !dialog) return;
    const note = normalizeNote(noteDraft);
    const kind = dialog;
    setDialog(null);
    setNoteDraft("");

    if (kind === "simulate") {
      toast.message("Simulated (no device command sent)");
    }
    const patch = buildTransitionPatch(kind);
    await transition(row, patch, eventTypeFor(kind), nextStatusFor(kind), note);
  }


  function cancelDialog() {
    setDialog(null);
    setNoteDraft("");
  }

  const meta = dialog ? DIALOG_META[dialog] : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (notFound || !row) {
    return (
      <div className="max-w-xl mx-auto">
        <BackLink />
        <div className="glass rounded-2xl p-6 text-center">
          <h1 className="text-lg font-semibold mb-2">Action not found</h1>
          <p className="text-sm text-muted-foreground">
            This action may have been removed, or you do not have access to it.
          </p>
        </div>
      </div>
    );
  }

  const growName = grows.find((g) => g.id === row.grow_id)?.name ?? null;
  return (
    <div className="max-w-3xl mx-auto">
      <GrowBreadcrumbs
        growId={row.grow_id}
        growName={growName}
        current="Action Detail"
        actionId={row.id}
      />
      <BackLink />


      <header className="glass rounded-2xl p-4 mb-4">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <Badge variant="outline" className="uppercase text-[10px]">{row.status}</Badge>
          <Badge variant="outline" className={RISK_VARIANT[row.risk_level]}>{row.risk_level}</Badge>
          <span className="text-xs text-muted-foreground">{row.action_type}</span>
          <span className="text-xs text-muted-foreground">· {row.source}</span>
        </div>
        <h1 className="text-xl font-display font-bold">{row.suggested_change}</h1>
        <p className="text-sm text-muted-foreground mt-1">{row.reason}</p>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <IdField label="Grow" id={row.grow_id} to={growDetailPath(row.grow_id)} />
          {row.tent_id && <IdField label="Tent" id={row.tent_id} to={`/tents/${row.tent_id}`} />}
          {row.plant_id && <IdField label="Plant" id={row.plant_id} to={`/plants/${row.plant_id}`} />}
          <Field label="Created" value={new Date(row.created_at).toLocaleString()} />
          <Field label="Updated" value={new Date(row.updated_at).toLocaleString()} />
          {row.completed_at && (
            <Field label="Completed" value={new Date(row.completed_at).toLocaleString()} />
          )}
        </dl>


        {!isTerminal(row.status) && (
          <div className="flex flex-wrap gap-2 mt-4">
            {canApprove(row.status) && (
              <Button size="sm" disabled={busy} onClick={() => openDialog("approve")} className="gradient-leaf text-primary-foreground">
                <Check className="h-4 w-4" /> Approve
              </Button>
            )}
            {canSimulate(row.status) && (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => openDialog("simulate")}>
                <FlaskConical className="h-4 w-4" /> Simulate
              </Button>
            )}
            {canComplete(row.status) && (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => openDialog("complete")}>
                <CheckCircle2 className="h-4 w-4" /> Mark Complete
              </Button>
            )}
            {canReject(row.status) && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => openDialog("reject")}>
                <X className="h-4 w-4" /> Reject
              </Button>
            )}
            {canCancel(row.status) && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => openDialog("cancel")}>
                <Ban className="h-4 w-4" /> Cancel
              </Button>
            )}
          </div>
        )}
      </header>

      <section className="glass rounded-2xl p-4" aria-label="Audit history">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1">
          <History className="h-4 w-4" /> Audit History ({events.length})
        </h2>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No audit events yet.</p>
        ) : (
          <ul className="space-y-2">
            {events.map((e) => (
              <li key={e.id} className="rounded-lg border border-border/40 bg-secondary/20 p-2 text-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px] uppercase">{e.event_type}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {e.previous_status ?? "—"} → {e.new_status ?? "—"}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(e.created_at).toLocaleString()}
                  </span>
                </div>
                {e.note && <p className="text-xs mt-1 italic text-muted-foreground">{e.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open) cancelDialog(); }}>
        <DialogContent>
          {meta && (
            <>
              <DialogHeader>
                <DialogTitle>{meta.title}</DialogTitle>
                <DialogDescription>{meta.description}</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="detail-action-note">{meta.label}</Label>
                <Textarea
                  id="detail-action-note"
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
                <Button variant="ghost" onClick={cancelDialog}>Cancel</Button>
                <Button onClick={confirmDialog}>{meta.confirmLabel}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to={actionsPath()}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
    >
      <ArrowLeft className="h-4 w-4" /> Back to Action Queue
    </Link>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-muted-foreground uppercase tracking-wider text-[10px]">{label}</dt>
      <dd className={mono ? "font-mono text-[11px] break-all" : ""}>{value}</dd>
    </div>
  );
}

function IdField({ label, id, to }: { label: string; id: string; to: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground uppercase tracking-wider text-[10px]">{label}</dt>
      <dd className="font-mono text-[11px] break-all">
        {to ? (
          <Link to={to} className="text-primary hover:underline">{id}</Link>
        ) : (
          <span>{id}</span>
        )}
      </dd>
    </div>
  );
}

