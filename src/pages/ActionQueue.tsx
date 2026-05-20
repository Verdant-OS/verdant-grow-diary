import { useEffect, useMemo, useState, useCallback } from "react";
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

type StatusFilter = "all" | "pending" | "simulated" | "approved" | "rejected";
type RiskFilter = "all" | "low" | "medium" | "high" | "critical";
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

export default function ActionQueue() {
  const { user } = useAuth();
  const { activeGrowId, activeGrow } = useGrows();
  const [rows, setRows] = useState<ActionRow[]>([]);
  const [events, setEvents] = useState<Record<string, EventRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");

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

  function promptNote(label: string): string | undefined {
    if (typeof window === "undefined" || typeof window.prompt !== "function") {
      return undefined;
    }
    const raw = window.prompt(label) ?? "";
    const trimmed = raw.trim();
    return trimmed.length ? trimmed : undefined;
  }

  function approve(row: ActionRow) {
    // SECURITY: "approved" means approved for future manual/controlled execution.
    // NO equipment command is sent from this app.
    const note = promptNote("Optional approval note (why are you approving?)");
    return transition(
      row,
      { status: "approved", approved_at: new Date().toISOString() },
      "approved",
      "approved",
      note,
    );
  }
  function reject(row: ActionRow) {
    const note = promptNote("Optional rejection reason (why are you rejecting?)");
    return transition(
      row,
      { status: "rejected", rejected_at: new Date().toISOString() },
      "rejected",
      "rejected",
      note,
    );
  }
  function simulate(row: ActionRow) {
    // Simulation NEVER sends device commands. Status + audit only.
    const note = promptNote("Optional simulation note");
    toast.message("Simulated (no device command sent)", {
      description: `${row.action_type} → ${row.target_metric ?? row.target_device}`,
    });
    return transition(row, { status: "simulated" }, "simulated", "simulated", note);
  }

  const filtered = useMemo(() => {
    const matchesStatus = (s: Status) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "pending") return s === "pending_approval";
      return s === statusFilter;
    };
    const list = rows
      .filter((r) => matchesStatus(r.status))
      .filter((r) => riskFilter === "all" || r.risk_level === riskFilter);
    const sorted = [...list].sort((a, b) => {
      if (sortOrder === "risk") return RISK_RANK[b.risk_level] - RISK_RANK[a.risk_level];
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return sortOrder === "oldest" ? ta - tb : tb - ta;
    });
    return sorted;
  }, [rows, statusFilter, riskFilter, sortOrder]);

  const pending = useMemo(
    () => filtered.filter((r) => r.status === "pending_approval"),
    [filtered],
  );
  const reviewed = useMemo(
    () => filtered.filter((r) => r.status !== "pending_approval"),
    [filtered],
  );

  const filtersActive =
    statusFilter !== "all" || riskFilter !== "all" || sortOrder !== "newest";

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
              <li key={row.id} className="rounded-lg border border-border/40 bg-secondary/20 p-2">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-[10px] uppercase">{row.status}</Badge>
                  <Badge variant="outline" className={`text-[10px] uppercase ${RISK_VARIANT[row.risk_level]}`}>
                    {row.risk_level}
                  </Badge>
                  <span className="truncate flex-1">{row.suggested_change}</span>
                  <span className="text-xs text-muted-foreground">{row.action_type}</span>
                </div>
                <EventHistory items={events[row.id]} />
              </li>
            ))}
          </ul>
        )}
      </section>
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
