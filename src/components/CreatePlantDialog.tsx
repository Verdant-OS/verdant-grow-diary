import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { useGrows } from "@/store/grows";
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
  const { grows = [] } = useGrows();
  const qc = useQueryClient();
  const { data: allTents = [] } = useTents();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    strain: "",
    grow_id: "",
    tent_id: defaultTentId ?? "none",
    stage: "seedling",
    health: "healthy",
    started_at: "",
  });

  // Resolve which grow the new plant will belong to: an explicit page context
  // wins, otherwise the grower's in-dialog selection. When neither resolves
  // and grows exist, submit is blocked — never silently bind to a stale grow.
  const targetGrowId = defaultGrowId ?? (form.grow_id || undefined);
  const targetGrowName = targetGrowId
    ? grows.find((g) => g.id === targetGrowId)?.name ?? "Selected grow"
    : null;
  const needsGrowSelection = !defaultGrowId && grows.length > 0;

  // Scope tent options to the resolved target grow when present.
  const tents = targetGrowId
    ? (allTents as Array<{ id: string; name: string; grow_id: string | null }>).filter(
        (t) => t.grow_id === targetGrowId,
      )
    : allTents;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      toast.error("Not signed in");
      return;
    }
    if (needsGrowSelection && !form.grow_id) {
      toast.error("Pick which grow this plant belongs to first");
      return;
    }
    setBusy(true);
    const trimmedStrain = form.strain.trim();
    const payload: Record<string, unknown> = {
      user_id: user.id,
      name: form.name.trim(),
      strain: trimmedStrain || null,
      stage: form.stage,
      health: form.health,
    };
    if (form.tent_id && form.tent_id !== "none") payload.tent_id = form.tent_id;
    // Preselect grow context when provided. RLS enforces ownership server-side.
    // Fall back to the grower's explicit in-dialog selection, then derive
    // grow_id from the selected tent so newly-created plants never end up
    // with a tent assignment but null grow.
    if (defaultGrowId) {
      payload.grow_id = defaultGrowId;
    } else if (form.grow_id) {
      payload.grow_id = form.grow_id;
    } else if (form.tent_id && form.tent_id !== "none") {
      const selectedTent = (allTents as Array<{ id: string; grow_id: string | null }>).find(
        (t) => t.id === form.tent_id,
      );
      if (selectedTent?.grow_id) payload.grow_id = selectedTent.grow_id;
    }
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
    setForm({ name: "", strain: "", grow_id: "", tent_id: defaultTentId ?? "none", stage: "seedling", health: "healthy", started_at: "" });
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
        {targetGrowName ? (
          <div data-testid="create-plant-target-grow" className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs -mt-1">
            Creating in grow: <span className="font-medium text-foreground">{targetGrowName}</span>
          </div>
        ) : grows.length > 0 ? (
          <div data-testid="create-plant-grow-required" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs -mt-1">
            No grow selected — pick which grow this plant belongs to below.
          </div>
        ) : (
          <div data-testid="create-plant-no-grow-note" className="rounded-md border border-border/60 bg-secondary/30 px-3 py-2 text-xs -mt-1">
            No grows yet — this plant will be created without a grow. You can link it later in Lineage Repair.
          </div>
        )}
        <p className="text-xs text-muted-foreground -mt-1">
          Start simple. You can add genetics, medium, dates, and notes later. Verdant works best once your first plant memory exists.
        </p>
        <form onSubmit={submit} className="grid gap-3">
          {needsGrowSelection && (
            <div>
              <Label>Grow</Label>
              <Select
                value={form.grow_id}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    grow_id: v,
                    // Clear a selected tent that does not belong to the newly
                    // selected grow — a stale pairing is the mis-binding bug.
                    tent_id:
                      f.tent_id !== "none" &&
                      (allTents as Array<{ id: string; grow_id: string | null }>).some(
                        (t) => t.id === f.tent_id && t.grow_id === v,
                      )
                        ? f.tent_id
                        : "none",
                  }))
                }
              >
                <SelectTrigger data-testid="create-plant-grow-select"><SelectValue placeholder="Select a grow" /></SelectTrigger>
                <SelectContent>
                  {grows.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">Required so the plant lands in the right grow.</p>
            </div>
          )}
          <div>
            <Label>Name</Label>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Plant A" />
            <p className="text-[11px] text-muted-foreground mt-1">Only a name and stage are required to get started.</p>
          </div>
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
            <div className="flex items-center justify-between mb-1">
              <Label>Tent (optional)</Label>
              <CreateTentDialog
                defaultGrowId={targetGrowId}
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
          <details className="rounded-md border border-border/40 px-3 py-2">
            <summary className="cursor-pointer text-xs text-muted-foreground select-none">Optional details (enrich later)</summary>
            <div className="grid gap-3 pt-3">
              <div>
                <Label>Strain (optional)</Label>
                <Input value={form.strain} onChange={(e) => setForm({ ...form, strain: e.target.value })} placeholder="Blue Dream" />
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
              <div>
                <Label>Started at (optional)</Label>
                <Input type="date" value={form.started_at} onChange={(e) => setForm({ ...form, started_at: e.target.value })} />
              </div>
            </div>
          </details>
          <Button disabled={busy} className="gradient-leaf text-primary-foreground">Create plant</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
