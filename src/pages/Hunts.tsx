import { useState, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/store/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Check, Loader2, Target } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface HuntRow {
  id: string;
  name: string;
  strain: string;
  status: string;
  started_at: string;
}

export default function Hunts() {
  const { user } = useAuth();
  const [hunts, setHunts] = useState<HuntRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", strain: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("hunts")
      .select("id, name, strain, status, started_at")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false });
    
    if (error) toast.error(error.message);
    setHunts((data ?? []) as HuntRow[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("hunts").insert({
      user_id: user.id,
      name: form.name.trim(),
      strain: form.strain.trim(),
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Pheno hunt created");
    await load();
    setOpen(false);
    setForm({ name: "", strain: "" });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Target className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-display font-bold">Pheno Hunts</h1>
        </div>
        <Button onClick={() => setOpen(true)} size="sm" className="gradient-leaf text-primary-foreground gap-1">
          <Plus className="h-4 w-4" />New Hunt
        </Button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mx-auto" />
        </div>
      ) : hunts.length === 0 ? (
        <div className="py-16 text-center">
          <div className="mx-auto h-16 w-16 rounded-2xl glass flex items-center justify-center mb-4">
            <Target className="h-7 w-7 text-primary" />
          </div>
          <h2 className="font-display text-lg font-semibold">No pheno hunts yet.</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Start your first pheno hunt to track candidates and find your keepers.</p>
          <Button onClick={() => setOpen(true)} className="gradient-leaf text-primary-foreground">Create hunt</Button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {hunts.map((h) => (
            <li key={h.id} className="glass rounded-2xl p-0 overflow-hidden">
              <Link to={`/hunts/${h.id}`} className="block p-4 hover:bg-secondary/20 transition-colors">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-semibold">{h.name}</span>
                  <Badge variant="outline" className="uppercase text-[10px]">{h.status}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mb-2">
                  Strain: <span className="font-medium text-foreground">{h.strain}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Started {format(new Date(h.started_at), "MMM d, yyyy")}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass max-w-md">
          <DialogHeader><DialogTitle className="font-display">New Pheno Hunt</DialogTitle></DialogHeader>
          <form onSubmit={create} className="grid gap-3">
            <div>
              <Label>Hunt Name</Label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Project Alpha, 2026 Selection…" />
            </div>
            <div>
              <Label>Target Strain</Label>
              <Input required value={form.strain} onChange={(e) => setForm({ ...form, strain: e.target.value })} placeholder="Blue Dream, Sour Diesel…" />
            </div>
            <Button disabled={busy} className="gradient-leaf text-primary-foreground mt-2">Start Hunt</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
