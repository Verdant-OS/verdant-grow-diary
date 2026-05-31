import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STAGES } from "@/lib/grow";
import { Plus } from "lucide-react";
import { toast } from "sonner";

interface Props {
  trigger?: React.ReactNode;
  defaultGrowId?: string;
  onCreated?: (tent: { id: string; name: string }) => void;
}

export default function CreateTentDialog({ trigger, defaultGrowId, onCreated }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", size: "", brand: "", stage: "seedling" });

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
      size: form.size.trim() || null,
      brand: form.brand.trim() || null,
      stage: form.stage,
    };
    // Preselect grow context when provided. RLS enforces ownership server-side.
    if (defaultGrowId) payload.grow_id = defaultGrowId;
    const { data, error } = await supabase
      .from("tents")
      .insert(payload as never)
      .select("id, name")
      .single();
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Tent created");
    qc.invalidateQueries({ queryKey: ["tents"] });
    qc.invalidateQueries({ queryKey: ["grow", "tents"] });
    setForm({ name: "", size: "", brand: "", stage: "seedling" });
    setOpen(false);
    if (data && onCreated) onCreated(data as { id: string; name: string });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" className="gradient-leaf text-primary-foreground gap-1">
            <Plus className="h-4 w-4" /> New tent
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="glass max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">New tent</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          Start simple. You can add size, brand, and stage later. Verdant works best once your first plant memory exists.
        </p>
        <form onSubmit={submit} className="grid gap-3">
          <div>
            <Label>Name</Label>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Tent #1" />
            <p className="text-[11px] text-muted-foreground mt-1">Only a name is required to get started.</p>
          </div>
          <details className="rounded-md border border-border/40 px-3 py-2">
            <summary className="cursor-pointer text-xs text-muted-foreground select-none">Optional details (enrich later)</summary>
            <div className="grid gap-3 pt-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Size (optional)</Label>
                  <Input value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} placeholder="4x4" />
                </div>
                <div>
                  <Label>Brand (optional)</Label>
                  <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="Gorilla" />
                </div>
              </div>
              <div>
                <Label>Stage (optional)</Label>
                <Select value={form.stage} onValueChange={(v) => setForm({ ...form, stage: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STAGES.filter((s) => ["seedling", "veg", "flower", "flush", "harvest"].includes(s.value)).map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </details>
          <Button disabled={busy} className="gradient-leaf text-primary-foreground">Create tent</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
