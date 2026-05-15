import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { useNugs } from "@/store/nugs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { GROW_TYPES } from "@/lib/grow";
import { toast } from "sonner";
import { Scissors } from "lucide-react";

const MEDIUMS = [
  { value: "soil", label: "Soil" },
  { value: "coco", label: "Coco" },
  { value: "hydro", label: "Hydroponic" },
  { value: "aero", label: "Aeroponic" },
  { value: "living_soil", label: "Living soil" },
  { value: "other", label: "Other" },
] as const;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  growId: string;
  defaultGrowType?: string;
  onLogged?: () => void;
}

export default function HarvestDialog({ open, onOpenChange, growId, defaultGrowType, onLogged }: Props) {
  const { user } = useAuth();
  const { award } = useNugs();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    grow_type: defaultGrowType ?? "tent",
    medium: "soil",
    yield_grams: "",
    notes: "",
    harvested_at: new Date().toISOString().slice(0, 10),
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const yieldNum = form.yield_grams ? Number(form.yield_grams) : null;
    const { error } = await (supabase as any).from("harvests").insert({
      user_id: user.id,
      grow_id: growId,
      grow_type: form.grow_type,
      medium: form.medium,
      yield_grams: yieldNum,
      notes: form.notes.trim() || null,
      harvested_at: new Date(form.harvested_at).toISOString(),
    });
    if (error) { toast.error(error.message); setBusy(false); return; }

    // Mark grow as harvest stage
    await (supabase as any).from("grows").update({ stage: "harvest" }).eq("id", growId);

    // Base 500 + up to 1000 yield bonus (1 NUG per gram)
    const yieldBonus = yieldNum ? Math.min(1000, Math.round(yieldNum)) : 0;
    await award("harvest_logged", 500 + yieldBonus, {
      meta: { grow_id: growId, grow_type: form.grow_type, medium: form.medium, yield_grams: yieldNum },
    });

    setBusy(false);
    onOpenChange(false);
    onLogged?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Scissors className="h-4 w-4 text-primary" />Log harvest
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div>
            <Label>Harvest date</Label>
            <Input type="date" value={form.harvested_at} onChange={(e) => setForm({ ...form, harvested_at: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Grow type</Label>
              <Select value={form.grow_type} onValueChange={(v) => setForm({ ...form, grow_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{GROW_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Medium</Label>
              <Select value={form.medium} onValueChange={(v) => setForm({ ...form, medium: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MEDIUMS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Dry yield (grams, optional)</Label>
            <Input type="number" min="0" step="0.1" value={form.yield_grams} onChange={(e) => setForm({ ...form, yield_grams: e.target.value })} placeholder="e.g. 142" />
            <p className="text-[11px] text-muted-foreground mt-1">+1 NUG per gram (max +1,000).</p>
          </div>
          <div>
            <Label>Cure / harvest notes (optional)</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Trim style, cure plan, dry weight..." />
          </div>
          <Button disabled={busy} className="gradient-leaf text-primary-foreground">
            {busy ? "Logging…" : "Log harvest · +500 NUGs"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
