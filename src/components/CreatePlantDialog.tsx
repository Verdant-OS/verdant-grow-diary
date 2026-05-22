import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { useTents } from "@/hooks/use-tents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import CreateTentDialog from "@/components/CreateTentDialog";

const STAGES = [
  { value: "seedling", label: "Seedling" },
  { value: "veg", label: "Vegetative" },
  { value: "flower", label: "Flowering" },
  { value: "flush", label: "Flushing" },
  { value: "harvest", label: "Harvest" },
  { value: "cure", label: "Cure" },
];

const HEALTH = [
  { value: "healthy", label: "Healthy" },
  { value: "watch", label: "Watch" },
  { value: "issue", label: "Issue" },
];

interface Props {
  trigger?: React.ReactNode;
  defaultTentId?: string;
  defaultGrowId?: string;
}

export default function CreatePlantDialog({ trigger, defaultTentId, defaultGrowId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: allTents = [] } = useTents();
  // Scope tent options to the preselected grow when present.
  const tents = defaultGrowId
    ? (allTents as Array<{ id: string; name: string; grow_id: string | null }>).filter(
        (t) => t.grow_id === defaultGrowId,
      )
    : allTents;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    strain: "",
    tent_id: defaultTentId ?? "none",
    stage: "seedling",
    health: "healthy",
    started_at: "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      toast.error("Not signed in");
      return;
    }
    setBusy(true);
    const payload: Record<string, unknown> = {
      user_id: user.id,
      name: form.name.trim(),
      strain: form.strain.trim(),
      stage: form.stage,
      health: form.health,
    };
    if (form.tent_id && form.tent_id !== "none") payload.tent_id = form.tent_id;
    // Preselect grow context when provided. RLS enforces ownership server-side.
    if (defaultGrowId) payload.grow_id = defaultGrowId;
    if (form.started_at) payload.started_at = new Date(form.started_at).toISOString();

    const { error } = await supabase.from("plants").insert(payload as never);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Plant created");
    qc.invalidateQueries({ queryKey: ["plants"] });
    qc.invalidateQueries({ queryKey: ["grow", "plants"] });
    setForm({ name: "", strain: "", tent_id: defaultTentId ?? "none", stage: "seedling", health: "healthy", started_at: "" });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" className="gradient-leaf text-primary-foreground gap-1">
            <Plus className="h-4 w-4" /> New plant
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="glass max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">New plant</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div>
            <Label>Name</Label>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Plant A" />
          </div>
          <div>
            <Label>Strain</Label>
            <Input required value={form.strain} onChange={(e) => setForm({ ...form, strain: e.target.value })} placeholder="Blue Dream" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>Tent (optional)</Label>
              <CreateTentDialog
                defaultGrowId={defaultGrowId}
                onCreated={(t) => setForm((f) => ({ ...f, tent_id: t.id }))}
                trigger={
                  <Button type="button" size="sm" variant="ghost" className="h-7 px-2 gap-1 text-xs">
                    <Plus className="h-3 w-3" /> Add new tent
                  </Button>
                }
              />
            </div>
            <Select value={form.tent_id} onValueChange={(v) => setForm({ ...form, tent_id: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No tent</SelectItem>
                {tents.map((t: { id: string; name: string }) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {tents.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">No tents yet. Create a tent first.</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Stage</Label>
              <Select value={form.stage} onValueChange={(v) => setForm({ ...form, stage: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Health</Label>
              <Select value={form.health} onValueChange={(v) => setForm({ ...form, health: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HEALTH.map((h) => <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Started at (optional)</Label>
            <Input type="date" value={form.started_at} onChange={(e) => setForm({ ...form, started_at: e.target.value })} />
          </div>
          <Button disabled={busy} className="gradient-leaf text-primary-foreground">Create plant</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
