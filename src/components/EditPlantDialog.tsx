import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { useTents } from "@/hooks/use-tents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Pencil } from "lucide-react";
import { toast } from "sonner";

/**
 * Edits an existing plant's user-facing fields (name, strain, stage,
 * health, last note, started_at, tent assignment).
 *
 * RLS enforces ownership; user_id and grow_id are never touched here.
 *
 * Out of scope: alerts, Action Queue, sensor ingestion, automation,
 * device control — no writes to those tables.
 */
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

interface Plant {
  id: string;
  name: string;
  strain?: string | null;
  stage: string;
  health: string;
  startedAt?: string | null;
  tentId?: string | null;
  growId?: string | null;
  lastNote?: string | null;
}

interface Props {
  plant: Plant;
  trigger?: React.ReactNode;
}

export default function EditPlantDialog({ plant, trigger }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: allTents = [] } = useTents();
  const tents = plant.growId
    ? (allTents as Array<{ id: string; name: string; grow_id: string | null }>).filter(
        (t) => t.grow_id === plant.growId,
      )
    : allTents;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: plant.name ?? "",
    strain: plant.strain ?? "",
    stage: plant.stage ?? "seedling",
    health: plant.health ?? "healthy",
    tent_id: plant.tentId ?? "none",
    started_at: plant.startedAt ? plant.startedAt.slice(0, 10) : "",
    last_note: plant.lastNote ?? "",
  });

  useEffect(() => {
    if (open) {
      setForm({
        name: plant.name ?? "",
        strain: plant.strain ?? "",
        stage: plant.stage ?? "seedling",
        health: plant.health ?? "healthy",
        tent_id: plant.tentId ?? "none",
        started_at: plant.startedAt ? plant.startedAt.slice(0, 10) : "",
        last_note: plant.lastNote ?? "",
      });
    }
  }, [open, plant]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      toast.error("Not signed in");
      return;
    }
    setBusy(true);
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      strain: form.strain.trim(),
      stage: form.stage,
      health: form.health,
      tent_id: form.tent_id === "none" ? null : form.tent_id,
      last_note: form.last_note.trim() || null,
    };
    if (form.started_at) {
      payload.started_at = new Date(form.started_at).toISOString();
    }

    const { error } = await supabase
      .from("plants")
      .update(payload as never)
      .eq("id", plant.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Plant updated");
    qc.invalidateQueries({ queryKey: ["plants"] });
    qc.invalidateQueries({ queryKey: ["grow", "plants"] });
    qc.invalidateQueries({ queryKey: ["grow", "plant", plant.id] });
    qc.invalidateQueries({ queryKey: ["tent-detail"] });
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
            data-testid="edit-plant-trigger"
          >
            <Pencil className="h-4 w-4" /> Edit Plant
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        className="glass max-w-md"
        data-testid="edit-plant-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-display">Edit plant</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div>
            <Label>Name</Label>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              data-testid="edit-plant-name"
            />
          </div>
          <div>
            <Label>Strain</Label>
            <Input
              value={form.strain}
              onChange={(e) => setForm({ ...form, strain: e.target.value })}
              data-testid="edit-plant-strain"
            />
          </div>
          <div>
            <Label>Tent</Label>
            <Select
              value={form.tent_id}
              onValueChange={(v) => setForm({ ...form, tent_id: v })}
            >
              <SelectTrigger data-testid="edit-plant-tent">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No tent</SelectItem>
                {tents.map((t: { id: string; name: string }) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Stage</Label>
              <Select
                value={form.stage}
                onValueChange={(v) => setForm({ ...form, stage: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Health</Label>
              <Select
                value={form.health}
                onValueChange={(v) => setForm({ ...form, health: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HEALTH.map((h) => (
                    <SelectItem key={h.value} value={h.value}>
                      {h.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Started at</Label>
            <Input
              type="date"
              value={form.started_at}
              onChange={(e) =>
                setForm({ ...form, started_at: e.target.value })
              }
            />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              value={form.last_note}
              onChange={(e) => setForm({ ...form, last_note: e.target.value })}
              rows={3}
              data-testid="edit-plant-notes"
            />
          </div>
          <Button
            disabled={busy}
            className="gradient-leaf text-primary-foreground"
            data-testid="edit-plant-submit"
          >
            Save changes
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
