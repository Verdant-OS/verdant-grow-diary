import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { STAGES } from "@/lib/grow";
import {
  buildTentUpdatePayload,
  isTentUpdatePayloadValid,
} from "@/lib/tentManagementRules";

/**
 * Edits an existing tent's user-facing fields. Mirrors EditPlantDialog
 * shape so growers get a consistent editing experience.
 *
 * RLS enforces ownership. user_id and grow_id are never written here.
 * Out of scope: alerts, Action Queue, sensors, automation, device control.
 */
interface TentInput {
  id: string;
  name: string;
  brand?: string | null;
  size?: string | null;
  stage?: string | null;
  light?: { on?: boolean; schedule?: string | null; wattage?: number | null };
}

interface Props {
  tent: TentInput;
  trigger?: React.ReactNode;
}

export default function EditTentDialog({ tent, trigger }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: tent.name ?? "",
    brand: tent.brand ?? "",
    size: tent.size ?? "",
    stage: tent.stage ?? "seedling",
    light_on: tent.light?.on !== false,
    light_schedule: tent.light?.schedule ?? "",
    light_wattage: tent.light?.wattage ? String(tent.light.wattage) : "",
  });

  useEffect(() => {
    if (open) {
      setForm({
        name: tent.name ?? "",
        brand: tent.brand ?? "",
        size: tent.size ?? "",
        stage: tent.stage ?? "seedling",
        light_on: tent.light?.on !== false,
        light_schedule: tent.light?.schedule ?? "",
        light_wattage: tent.light?.wattage ? String(tent.light.wattage) : "",
      });
    }
  }, [open, tent]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      toast.error("Not signed in");
      return;
    }
    const payload = buildTentUpdatePayload({
      name: form.name,
      brand: form.brand,
      size: form.size,
      stage: form.stage,
      light_on: form.light_on,
      light_schedule: form.light_schedule,
      light_wattage: form.light_wattage ? Number(form.light_wattage) : null,
    });
    if (!isTentUpdatePayloadValid(payload)) {
      toast.error("Tent name is required");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("tents")
      .update(payload as never)
      .eq("id", tent.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Tent updated");
    qc.invalidateQueries({ queryKey: ["tents"] });
    qc.invalidateQueries({ queryKey: ["grow", "tents"] });
    qc.invalidateQueries({ queryKey: ["grow", "tent", tent.id] });
    qc.invalidateQueries({ queryKey: ["tent-detail"] });
    qc.invalidateQueries({ queryKey: ["grow", "plant"] });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            data-testid="edit-tent-trigger"
          >
            <Pencil className="h-4 w-4" /> Edit Tent
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="glass max-w-md" data-testid="edit-tent-dialog">
        <DialogHeader>
          <DialogTitle className="font-display">Edit tent</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div>
            <Label>Name</Label>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              data-testid="edit-tent-name"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Size</Label>
              <Input
                value={form.size}
                onChange={(e) => setForm({ ...form, size: e.target.value })}
                placeholder="4x4"
                data-testid="edit-tent-size"
              />
            </div>
            <div>
              <Label>Brand</Label>
              <Input
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                placeholder="Gorilla"
                data-testid="edit-tent-brand"
              />
            </div>
          </div>
          <div>
            <Label>Stage</Label>
            <Select
              value={form.stage}
              onValueChange={(v) => setForm({ ...form, stage: v })}
            >
              <SelectTrigger data-testid="edit-tent-stage">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGES.filter((s) =>
                  ["seedling", "veg", "flower", "flush", "harvest"].includes(s.value),
                ).map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2 items-end">
            <div>
              <Label>Light schedule</Label>
              <Input
                value={form.light_schedule}
                onChange={(e) => setForm({ ...form, light_schedule: e.target.value })}
                placeholder="18/6"
                data-testid="edit-tent-light-schedule"
              />
            </div>
            <div>
              <Label>Wattage</Label>
              <Input
                type="number"
                min="0"
                value={form.light_wattage}
                onChange={(e) => setForm({ ...form, light_wattage: e.target.value })}
                placeholder="240"
                data-testid="edit-tent-light-wattage"
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2">
            <Label htmlFor="edit-tent-light-on" className="cursor-pointer">
              Light currently on
            </Label>
            <Switch
              id="edit-tent-light-on"
              checked={form.light_on}
              onCheckedChange={(v) => setForm({ ...form, light_on: !!v })}
              data-testid="edit-tent-light-on"
            />
          </div>
          <Button
            disabled={busy}
            className="gradient-leaf text-primary-foreground"
            data-testid="edit-tent-submit"
          >
            Save changes
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
