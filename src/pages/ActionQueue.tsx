import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { useGrows } from "@/store/grows";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, X, FlaskConical, ListChecks, History } from "lucide-react";
import { toast } from "sonner";

type Status =
  | "pending_approval"
  | "approved"
  | "rejected"
  | "simulated"
  | "completed"
  | "cancelled";

type EventType =
  | "created"
  | "simulated"
  | "approved"
  | "rejected"
  | "completed"
  | "cancelled"
  | "note";

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

export default function ActionQueue() {
  const { user } = useAuth();
  const { activeGrowId, activeGrow } = useGrows();
  const [rows, setRows] = useState<ActionRow[]>([]);
  const [events, setEvents] = useState<Record<string, EventRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

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
    const { data, error } = activeGrowId ? await q.eq("grow_id", activeGrowId) : await q;
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
  }, [user, activeGrowId]);

  useEffect(() => {
    load();
  }, [load]);

  // SECURITY: never sends device commands. Inserts an audit row ONLY.
  // user_id is left to DB default auth.uid(). No service_role.
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
    await logEvent(row, event_type, new_status);
    setBusyId(null);
    await load();
  }

  function approve(row: ActionRow) {
    // SECURITY: "approved" means approved for future manual/controlled execution.
    // NO device command is sent. No MQTT / Home Assistant / Pi bridge / webhook.
    return transition(
      row,
      { status: "approved", approved_at: new Date().toISOString() },
      "approved",
      "approved",
    );
  }
  function reject(row: ActionRow) {
    return transition(
      row,
      { status: "rejected", rejected_at: new Date().toISOString() },
      "rejected",
      "rejected",
    );
  }
  function simulate(row: ActionRow) {
    // Simulation NEVER sends device commands. Status + audit only.
    toast.message("Simulated (no device command sent)", {
      description: `${row.action_type} → ${row.target_metric ?? row.target_device}`,
    });
    return transition(row, { status: "simulated" }, "simulated", "simulated");
  }

  const pending = useMemo(() => rows.filter((r) => r.status === "pending_approval"), [rows]);
  const reviewed = useMemo(() => rows.filter((r) => r.status !== "pending_approval"), [rows]);

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-display font-bold flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary" />
          Action Queue
        </h1>
        <p className="text-sm text-muted-foreground">
          Suggestions are <span className="text-foreground">approval-gated</span>.
          Verdant never sends commands to equipment.{" "}
          {activeGrow ? <>Showing actions for <span className="text-foreground">{activeGrow.name}</span>.</> : "Showing all grows."}
        </p>
      </div>

      <section className="glass rounded-2xl p-4 mb-4">
        <h2 className="text-sm font-semibold mb-3 uppercase tracking-wider text-muted-foreground">
          Pending approval ({pending.length})
        </h2>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : pending.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No pending suggestions.</p>
        ) : (
          <ul className="space-y-3">
            {pending.map((row) => (
              <li key={row.id} className="rounded-xl border border-border/60 bg-secondary/30 p-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{row.action_type}</span>
                      <Badge variant="outline" className={RISK_VARIANT[row.risk_level]}>
                        {row.risk_level}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {row.target_metric ?? row.target_device}
                      </span>
                    </div>
                    <p className="text-sm mt-1">{row.suggested_change}</p>
                    <p className="text-xs text-muted-foreground mt-1">{row.reason}</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" disabled={busyId === row.id} onClick={() => approve(row)} className="gradient-leaf text-primary-foreground">
                    <Check className="h-4 w-4" /> Approve
                  </Button>
                  <Button size="sm" variant="secondary" disabled={busyId === row.id} onClick={() => simulate(row)}>
                    <FlaskConical className="h-4 w-4" /> Simulate
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busyId === row.id} onClick={() => reject(row)}>
                    <X className="h-4 w-4" /> Reject
                  </Button>
                </div>
                <EventHistory items={events[row.id]} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {reviewed.length > 0 && (
        <section className="glass rounded-2xl p-4">
          <h2 className="text-sm font-semibold mb-3 uppercase tracking-wider text-muted-foreground">
            Recent ({reviewed.length})
          </h2>
          <ul className="space-y-2 text-sm">
            {reviewed.slice(0, 20).map((row) => (
              <li key={row.id} className="rounded-lg border border-border/40 bg-secondary/20 p-2">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-[10px] uppercase">{row.status}</Badge>
                  <span className="truncate flex-1">{row.suggested_change}</span>
                  <span className="text-xs text-muted-foreground">{row.action_type}</span>
                </div>
                <EventHistory items={events[row.id]} />
              </li>
            ))}
          </ul>
        </section>
      )}
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
