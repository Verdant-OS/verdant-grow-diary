import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { useGrows } from "@/store/grows";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, X, FlaskConical, ListChecks } from "lucide-react";
import { toast } from "sonner";

type Status =
  | "pending_approval"
  | "approved"
  | "rejected"
  | "simulated"
  | "completed"
  | "cancelled";

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
    setRows((data ?? []) as ActionRow[]);
    setLoading(false);
  }, [user, activeGrowId]);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(id: string, next: Partial<ActionRow>) {
    setBusyId(id);
    const { error } = await supabase
      .from("action_queue")
      .update(next)
      .eq("id", id);
    setBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    await load();
  }

  function approve(row: ActionRow) {
    return patch(row.id, { status: "approved", approved_at: new Date().toISOString() });
  }
  function reject(row: ActionRow) {
    return patch(row.id, { status: "rejected", rejected_at: new Date().toISOString() });
  }
  function simulate(row: ActionRow) {
    // Simulation NEVER sends device commands. It only records a status change
    // so the user can see the suggestion was reviewed in a dry-run.
    toast.message("Simulated (no device command sent)", {
      description: `${row.action_type} → ${row.target_metric ?? row.target_device}`,
    });
    return patch(row.id, { status: "simulated" });
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
              <li key={row.id} className="flex items-center gap-3 py-1">
                <Badge variant="outline" className="text-[10px] uppercase">{row.status}</Badge>
                <span className="truncate flex-1">{row.suggested_change}</span>
                <span className="text-xs text-muted-foreground">{row.action_type}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
