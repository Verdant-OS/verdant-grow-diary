import { useState } from "react";
import { Link } from "react-router-dom";
import { useGrows } from "@/store/grows";
import { useAuth } from "@/store/auth";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Sprout, Check, Trash2, Loader2, AlertCircle } from "lucide-react";
import { GROW_TYPES, STAGES, growTypeLabel, stageLabel } from "@/lib/grow";
import { format } from "date-fns";
import { toast } from "sonner";

export default function Grows() {
  const { user } = useAuth();
  const { grows, activeGrowId, setActiveGrowId, refresh, loading, error } = useGrows();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", grow_type: "tent", stage: "seedling", notes: "" });
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const { data, error } = await supabase.from("grows").insert({
      user_id: user.id, name: form.name.trim(), grow_type: form.grow_type, stage: form.stage,
      notes: form.notes.trim() || null,
    }).select().single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Grow created");
    await refresh();
    if (data) setActiveGrowId(data.id);
    setOpen(false);
    setForm({ name: "", grow_type: "tent", stage: "seedling", notes: "" });
  }

  async function archive(id: string) {
    if (!confirm("Archive this grow? Entries stay saved.")) return;
    await supabase.from("grows").update({ is_archived: true }).eq("id", id);
    await refresh();
    toast.success("Archived");
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-display font-bold">My Grows</h1>
        <Button onClick={() => setOpen(true)} size="sm" className="gradient-leaf text-primary-foreground gap-1">
          <Plus className="h-4 w-4" />New
        </Button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-muted-foreground" data-testid="grows-loading">
          <Loader2 className="h-5 w-5 animate-spin mx-auto" />
        </div>
      ) : error ? (
        <div
          className="glass rounded-2xl p-6 text-center"
          role="alert"
          data-testid="grows-error"
        >
          <AlertCircle className="h-5 w-5 text-destructive mx-auto mb-2" />
          <p className="font-semibold">Unable to load grows.</p>
          <p className="text-xs text-muted-foreground mt-1">Please try again later.</p>
        </div>
      ) : grows.length === 0 ? (
        <div className="py-16 text-center" data-testid="grows-empty">
          <div className="mx-auto h-16 w-16 rounded-2xl glass flex items-center justify-center mb-4">
            <Sprout className="h-7 w-7 text-primary" />
          </div>
          <h2 className="font-display text-lg font-semibold">No grows yet.</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Create your first grow to start logging.</p>
          <Button onClick={() => setOpen(true)} className="gradient-leaf text-primary-foreground">Create grow</Button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="grows-list">
          {grows.map((g) => (
            <li
              key={g.id}
              className={`glass rounded-2xl p-0 overflow-hidden ${g.id === activeGrowId ? "border-primary/60" : ""}`}
            >
              <Link
                to={`/grows/${g.id}`}
                className="block p-4 hover:bg-secondary/20 transition-colors"
                data-testid="grow-card-link"
              >
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-semibold">{g.name}</span>
                  {g.id === activeGrowId && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary">active</span>
                  )}
                  {g.is_archived && (
                    <Badge variant="outline" className="text-[10px]">archived</Badge>
                  )}
                  <Badge variant="outline" className="uppercase text-[10px]">{stageLabel(g.stage)}</Badge>
                  <Badge variant="outline" className="text-[10px]">{growTypeLabel(g.grow_type)}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  Started {format(new Date(g.started_at), "MMM d, yyyy")}
                  {g.updated_at && (
                    <> · Updated {format(new Date(g.updated_at), "MMM d, yyyy")}</>
                  )}
                </div>
                {g.notes && (
                  <p className="text-xs mt-2 text-muted-foreground line-clamp-2">{g.notes}</p>
                )}
              </Link>
              <div className="flex items-center justify-between px-4 pb-3 -mt-1">
                {g.id === activeGrowId ? (
                  <span className="inline-flex items-center text-[11px] text-primary gap-1">
                    <Check className="h-3 w-3" /> active grow
                  </span>
                ) : (
                  <button
                    onClick={() => setActiveGrowId(g.id)}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Set active
                  </button>
                )}
                {g.id !== activeGrowId && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => archive(g.id)}
                    aria-label="Archive grow"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}


      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass max-w-md">
          <DialogHeader><DialogTitle className="font-display">New grow</DialogTitle></DialogHeader>
          <form onSubmit={create} className="grid gap-3">
            <div><Label>Name</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Tent #1, Backyard, Mothers…" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Type</Label>
                <Select value={form.grow_type} onValueChange={(v) => setForm({ ...form, grow_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{GROW_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Stage</Label>
                <Select value={form.stage} onValueChange={(v) => setForm({ ...form, stage: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Notes (optional)</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Strain, lighting, medium…" rows={2} /></div>
            <Button disabled={busy} className="gradient-leaf text-primary-foreground">Create grow</Button>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
}
