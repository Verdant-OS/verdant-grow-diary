import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { Button } from "@/components/ui/button";
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
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import CreatePlantDialog from "@/components/CreatePlantDialog";

interface EligiblePlant {
  id: string;
  name: string;
  strain: string | null;
}

interface Props {
  tentId: string;
  growId?: string | null;
  trigger?: React.ReactNode;
}

/**
 * Assigns an existing plant (in the same grow, currently unassigned) to the
 * current tent by updating only that plant's tent_id. RLS enforces
 * ownership; the client never sets user_id.
 *
 * Out of scope: no alerts, no Action Queue, no sensor ingestion, no
 * automation, no device control writes.
 */
export default function AddExistingPlantDialog({ tentId, growId, trigger }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const { data: eligible = [], isLoading } = useQuery({
    queryKey: ["tent-detail", "eligible-plants", tentId, growId ?? null],
    enabled: open,
    queryFn: async (): Promise<EligiblePlant[]> => {
      let q = supabase
        .from("plants")
        .select("id, name, strain, grow_id, tent_id, is_archived")
        .is("tent_id", null)
        .eq("is_archived", false);
      if (growId) q = q.eq("grow_id", growId);
      const { data, error } = await q.order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((p) => ({
        id: p.id as string,
        name: (p.name as string) ?? "Unnamed",
        strain: (p.strain as string | null) ?? null,
      }));
    },
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      toast.error("Not signed in");
      return;
    }
    if (!selected) {
      toast.error("Pick a plant");
      return;
    }
    setBusy(true);
    // Only update tent_id. RLS scopes the row to the owning user.
    const { error } = await supabase
      .from("plants")
      .update({ tent_id: tentId })
      .eq("id", selected);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Plant assigned to tent");
    qc.invalidateQueries({ queryKey: ["plants"] });
    qc.invalidateQueries({ queryKey: ["grow", "plants"] });
    qc.invalidateQueries({ queryKey: ["tent-detail", "eligible-plants"] });
    setSelected("");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" className="gap-1">
            <Link2 className="h-4 w-4" /> Add Existing Plant
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        className="glass max-w-md"
        data-testid="add-existing-plant-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-display">Add existing plant</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : eligible.length === 0 ? (
          <div
            className="space-y-3"
            data-testid="add-existing-plant-empty"
          >
            <p className="text-sm text-muted-foreground">
              No unassigned plants available for this grow.
            </p>
            <CreatePlantDialog
              defaultTentId={tentId}
              defaultGrowId={growId ?? undefined}
              trigger={
                <Button
                  size="sm"
                  className="gradient-leaf text-primary-foreground"
                  data-testid="add-existing-plant-empty-create"
                >
                  Create new plant
                </Button>
              }
            />
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-3">
            <div>
              <Label>Plant</Label>
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger data-testid="add-existing-plant-select">
                  <SelectValue placeholder="Pick a plant" />
                </SelectTrigger>
                <SelectContent>
                  {eligible.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.strain ? ` · ${p.strain}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="submit"
              disabled={busy || !selected}
              className="gradient-leaf text-primary-foreground"
              data-testid="add-existing-plant-submit"
            >
              Assign to this tent
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
