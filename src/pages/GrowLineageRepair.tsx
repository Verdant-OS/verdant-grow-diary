import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle, Wrench, Check } from "lucide-react";
import { toast } from "sonner";

interface TentRow {
  id: string;
  name: string;
  created_at: string;
  grow_id: string | null;
}
interface GrowRow {
  id: string;
  name: string;
}

export default function GrowLineageRepair() {
  const { user } = useAuth();
  const [tents, setTents] = useState<TentRow[]>([]);
  const [grows, setGrows] = useState<GrowRow[]>([]);
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    // SECURITY: only fetch rows owned by auth.uid(). RLS also enforces this.
    const [tentsRes, growsRes] = await Promise.all([
      supabase
        .from("tents")
        .select("id,name,created_at,grow_id")
        .eq("user_id", user.id)
        .is("grow_id", null)
        .eq("is_archived", false)
        .order("created_at", { ascending: false }),
      supabase
        .from("grows")
        .select("id,name")
        .eq("user_id", user.id)
        .eq("is_archived", false)
        .order("created_at", { ascending: false }),
    ]);
    if (tentsRes.error) toast.error(tentsRes.error.message);
    if (growsRes.error) toast.error(growsRes.error.message);
    setTents((tentsRes.data ?? []) as TentRow[]);
    setGrows((growsRes.data ?? []) as GrowRow[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(tentId: string) {
    if (!user) return;
    const growId = selection[tentId];
    if (!growId) {
      toast.error("Pick a grow first");
      return;
    }
    // SECURITY: verify ownership of the chosen grow client-side. RLS WITH CHECK
    // also rejects assigning to a grow not owned by auth.uid().
    if (!grows.some((g) => g.id === growId)) {
      toast.error("You do not own that grow");
      return;
    }
    setBusyId(tentId);
    const { error } = await supabase
      .from("tents")
      .update({ grow_id: growId })
      .eq("id", tentId)
      .eq("user_id", user.id); // belt-and-suspenders; RLS already enforces this
    setBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Tent assigned to grow");
    await load();
  }

  return (
    <div className="container max-w-4xl py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Wrench className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-display font-semibold">
            Grow Lineage Repair
          </h1>
          <p className="text-sm text-muted-foreground">
            Assign unlinked tents to one of your grows so the Action Queue can
            target them safely.
          </p>
        </div>
      </div>

      <Alert variant="default" className="border-amber-500/40 bg-amber-500/10">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Assignments affect Action Queue targeting</AlertTitle>
        <AlertDescription>
          Once a tent is linked to a grow, suggested actions can reference it.
          Suggestions still require approval; nothing is sent to devices.
        </AlertDescription>
      </Alert>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : tents.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-6 text-center">
          <Check className="h-5 w-5 text-emerald-400 mx-auto mb-2" />
          <p className="font-medium">All tents are assigned to grows.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tents.map((t) => (
            <div
              key={t.id}
              className="rounded-lg border border-border bg-card p-4 flex flex-col md:flex-row md:items-center gap-3"
            >
              <div className="flex-1">
                <div className="font-medium">{t.name}</div>
                <div className="text-xs text-muted-foreground">
                  created {new Date(t.created_at).toLocaleString()} · grow_id:{" "}
                  <span className="text-amber-400">unassigned</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={selection[t.id] ?? ""}
                  onValueChange={(v) =>
                    setSelection((s) => ({ ...s, [t.id]: v }))
                  }
                  disabled={grows.length === 0}
                >
                  <SelectTrigger className="w-56">
                    <SelectValue
                      placeholder={
                        grows.length === 0 ? "No grows yet" : "Select a grow"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {grows.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  onClick={() => save(t.id)}
                  disabled={busyId === t.id || !selection[t.id]}
                >
                  {busyId === t.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Save"
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
