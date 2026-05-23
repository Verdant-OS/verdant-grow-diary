import { useMemo, useState } from "react";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import CreatePlantDialog from "@/components/CreatePlantDialog";

interface PlantRow {
  id: string;
  name: string;
  strain: string | null;
  tent_id: string | null;
}

interface Props {
  tentId: string;
  growId?: string | null;
  trigger?: React.ReactNode;
}

/**
 * Assigns or moves an existing plant (same grow, non-archived) into the
 * current tent by updating only that plant's `tent_id`. RLS enforces
 * ownership; the client never sets user_id / grow_id / strain / stage.
 *
 * Categorization is performed client-side from a single same-grow query
 * so plants already living in another tent in the same grow are eligible
 * as "move" candidates. Plants already in the current tent are shown
 * disabled. Cross-grow plants are never queried or shown.
 *
 * Out of scope: alerts, Action Queue, sensor ingestion, automation,
 * device control — no writes to those tables.
 */
export default function AddExistingPlantDialog({ tentId, growId, trigger }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const hasGrowContext = Boolean(growId);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["tent-detail", "eligible-plants", tentId, growId ?? null],
    enabled: open && hasGrowContext,
    queryFn: async (): Promise<PlantRow[]> => {
      // Same-grow, non-archived plants. We intentionally do NOT filter
      // by `tent_id IS NULL` here so plants in another tent in the same
      // grow are eligible as move candidates. Cross-grow plants are
      // excluded by the explicit grow_id filter.
      const { data, error } = await supabase
        .from("plants")
        .select("id, name, strain, tent_id, grow_id, is_archived")
        .eq("grow_id", growId as string)
        .eq("is_archived", false)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((p) => ({
        id: p.id as string,
        name: (p.name as string) ?? "Unnamed",
        strain: (p.strain as string | null) ?? null,
        tent_id: (p.tent_id as string | null) ?? null,
      }));
    },
  });

  const { unassigned, otherTent, currentTent } = useMemo(() => {
    const u: PlantRow[] = [];
    const o: PlantRow[] = [];
    const c: PlantRow[] = [];
    for (const p of rows) {
      if (p.tent_id == null) u.push(p);
      else if (p.tent_id === tentId) c.push(p);
      else o.push(p);
    }
    return { unassigned: u, otherTent: o, currentTent: c };
  }, [rows, tentId]);

  const eligibleCount = unassigned.length + otherTent.length;

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
    // Refuse to "assign" a plant already in this tent.
    if (currentTent.some((p) => p.id === selected)) {
      toast.error("Plant is already in this tent");
      return;
    }
    setBusy(true);
    // ONLY update tent_id. RLS scopes the row to the owning user; we
    // never touch user_id / grow_id / strain / stage / notes here.
    const { error } = await supabase
      .from("plants")
      .update({ tent_id: tentId })
      .eq("id", selected);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const wasMove = otherTent.some((p) => p.id === selected);
    toast.success(wasMove ? "Plant moved to this tent" : "Plant assigned to tent");
    qc.invalidateQueries({ queryKey: ["plants"] });
    qc.invalidateQueries({ queryKey: ["grow", "plants"] });
    qc.invalidateQueries({ queryKey: ["tent-detail"] });
    setSelected("");
    setOpen(false);
  }

  function renderLabel(p: PlantRow) {
    return `${p.name}${p.strain ? ` · ${p.strain}` : ""}`;
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

        {!hasGrowContext ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="add-existing-plant-no-grow"
          >
            Unable to load plants because this tent is missing grow context.
          </p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : eligibleCount === 0 ? (
          <div
            className="space-y-3"
            data-testid="add-existing-plant-empty"
          >
            <p className="text-sm text-muted-foreground">
              No available plants for this grow.
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
                  {unassigned.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Unassigned plants</SelectLabel>
                      {unassigned.map((p) => (
                        <SelectItem
                          key={p.id}
                          value={p.id}
                          data-testid={`add-existing-plant-option-unassigned-${p.id}`}
                        >
                          {renderLabel(p)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {otherTent.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Plants in another tent</SelectLabel>
                      {otherTent.map((p) => (
                        <SelectItem
                          key={p.id}
                          value={p.id}
                          data-testid={`add-existing-plant-option-other-${p.id}`}
                        >
                          {renderLabel(p)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {currentTent.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Already in this tent</SelectLabel>
                      {currentTent.map((p) => (
                        <SelectItem
                          key={p.id}
                          value={p.id}
                          disabled
                          data-testid={`add-existing-plant-option-current-${p.id}`}
                        >
                          {renderLabel(p)} — already in this tent
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
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
