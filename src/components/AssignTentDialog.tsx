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
import { Move } from "lucide-react";
import { toast } from "sonner";
import {
  buildPlantTentMovementDetails,
  formatPlantTentMovementNote,
} from "@/lib/plantTentMovementRules";

interface TentRow {
  id: string;
  name: string;
}

interface Props {
  plantId: string;
  growId?: string | null;
  currentTentId?: string | null;
  trigger?: React.ReactNode;
}

/**
 * Assigns or moves a plant to a tent within the same grow by updating
 * ONLY `plants.tent_id`. RLS enforces ownership. The client never sets
 * user_id / grow_id / strain / stage / notes.
 *
 * Out of scope: diary entries, sensor readings, alerts, Action Queue,
 * automation, device control — no writes to those tables.
 */
export default function AssignTentDialog({
  plantId,
  growId,
  currentTentId,
  trigger,
}: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const hasGrowContext = Boolean(growId);
  const isMove = Boolean(currentTentId);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["plant-detail", "eligible-tents", plantId, growId ?? null],
    enabled: open && hasGrowContext,
    queryFn: async (): Promise<TentRow[]> => {
      // Same-grow, non-archived tents. Cross-grow tents are excluded
      // by the explicit grow_id filter.
      const { data, error } = await supabase
        .from("tents")
        .select("id, name, grow_id, is_archived")
        .eq("grow_id", growId as string)
        .eq("is_archived", false)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((t) => ({
        id: t.id as string,
        name: (t.name as string) ?? "Unnamed tent",
      }));
    },
  });

  const { others, current } = useMemo(() => {
    const o: TentRow[] = [];
    const c: TentRow[] = [];
    for (const t of rows) {
      if (currentTentId && t.id === currentTentId) c.push(t);
      else o.push(t);
    }
    return { others: o, current: c };
  }, [rows, currentTentId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      toast.error("Not signed in");
      return;
    }
    if (!selected) {
      toast.error("Pick a tent");
      return;
    }
    if (currentTentId && selected === currentTentId) {
      toast.error("Plant is already in this tent");
      return;
    }
    setBusy(true);
    // ONLY update tent_id. RLS scopes the row to the owning user; we
    // never touch user_id / grow_id / strain / stage / notes here.
    const { error } = await supabase
      .from("plants")
      .update({ tent_id: selected })
      .eq("id", plantId);
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }

    // Append a single timeline event so the move is visible in
    // Plant Recent Activity / Timeline. Past entries are not rewritten.
    // No sensor_readings, alerts, or action_queue writes happen here.
    const prevName = current[0]?.name ?? null;
    const nextName = others.find((t) => t.id === selected)?.name ?? null;
    if (growId) {
      const { error: diaryErr } = await supabase
        .from("diary_entries")
        .insert({
          user_id: user.id,
          grow_id: growId,
          plant_id: plantId,
          tent_id: selected,
          note: formatPlantTentMovementNote({
            previousTentName: prevName,
            nextTentName: nextName,
          }),
          details: buildPlantTentMovementDetails({
            previousTentId: currentTentId ?? null,
            nextTentId: selected,
            previousTentName: prevName,
            nextTentName: nextName,
          }) as unknown as Record<string, never>,
        });
      if (diaryErr) {
        console.error("[AssignTentDialog] movement diary insert failed", diaryErr);
        // Non-fatal: the plant has been moved successfully.
      }
    }

    setBusy(false);
    toast.success(isMove ? "Plant moved to new current tent" : "Plant assigned to tent");
    qc.invalidateQueries({ queryKey: ["plants"] });
    qc.invalidateQueries({ queryKey: ["grow", "plants"] });
    qc.invalidateQueries({ queryKey: ["grow", "plant", plantId] });
    qc.invalidateQueries({ queryKey: ["tent-detail"] });
    qc.invalidateQueries({ queryKey: ["grow", "tent"] });
    qc.invalidateQueries({ queryKey: ["plant_recent_activity", plantId] });
    qc.invalidateQueries({ queryKey: ["diary_entries"] });
    setSelected("");
    setOpen(false);
  }

  const ctaLabel = isMove ? "Move Plant" : "Assign to tent";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            data-testid={isMove ? "plant-detail-move-tent" : "plant-detail-assign-tent"}
          >
            <Move className="h-4 w-4" /> {ctaLabel}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        className="glass max-w-md"
        data-testid="assign-tent-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-display">
            {isMove ? "Move to another tent" : "Assign to tent"}
          </DialogTitle>
        </DialogHeader>

        {!hasGrowContext ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="assign-tent-no-grow"
          >
            Unable to load tents because this plant is missing grow context.
          </p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : others.length === 0 && current.length === 0 ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="assign-tent-empty"
          >
            No tents available in this grow.
          </p>
        ) : (
          <form onSubmit={submit} className="grid gap-3">
            <div>
              <Label>Tent</Label>
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger data-testid="assign-tent-select">
                  <SelectValue placeholder="Pick a tent" />
                </SelectTrigger>
                <SelectContent>
                  {others.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Tents in this grow</SelectLabel>
                      {others.map((t) => (
                        <SelectItem
                          key={t.id}
                          value={t.id}
                          data-testid={`assign-tent-option-${t.id}`}
                        >
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {current.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Current tent</SelectLabel>
                      {current.map((t) => (
                        <SelectItem
                          key={t.id}
                          value={t.id}
                          disabled
                          data-testid={`assign-tent-option-current-${t.id}`}
                        >
                          {t.name} — current tent
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
              data-testid="assign-tent-submit"
            >
              {isMove ? "Move plant" : "Assign plant"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
