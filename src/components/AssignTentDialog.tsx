import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { useTents } from "@/hooks/use-tents";
import { getEligibleTentsForPlantMove } from "@/lib/plantTentRelationshipRules";
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

interface Props {
  plantId: string;
  growId?: string | null;
  currentTentId?: string | null;
  trigger?: React.ReactNode;
}

/**
 * Assigns or moves a plant to a tent by updating ONLY `plants.tent_id`.
 * RLS enforces ownership. The client never sets user_id / grow_id /
 * strain / stage / notes.
 *
 * Tents are scoped to the plant's grow when the plant has one (mirrors
 * getEligibleTentsForPlantMove / EditPlantDialog). Plants missing grow
 * context (grow_id null) fall back to every tent the user owns instead
 * of dead-ending — same fallback EditPlantDialog's Tent dropdown uses.
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

  const isMove = Boolean(currentTentId);

  const { data: allTents = [], isLoading } = useTents();

  const { others, current } = useMemo(
    () =>
      getEligibleTentsForPlantMove(
        allTents as Array<{
          id: string;
          name: string;
          grow_id?: string | null;
          is_archived?: boolean | null;
        }>,
        currentTentId ?? null,
        growId ?? null,
      ),
    [allTents, currentTentId, growId],
  );

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
            {isMove ? "Move Plant" : "Assign to tent"}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : others.length === 0 && current.length === 0 ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="assign-tent-empty"
          >
            No tents available{growId ? " in this grow" : ""}.
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
                      <SelectLabel>{growId ? "Tents in this grow" : "Tents"}</SelectLabel>
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
                      <SelectLabel>Current Tent</SelectLabel>
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
              {isMove && current[0]?.name && (
                <p
                  className="text-xs text-muted-foreground mt-1"
                  data-testid="assign-tent-previous-tent"
                >
                  Previous Tent: {current[0].name}
                </p>
              )}
            </div>
            <Button
              type="submit"
              disabled={busy || !selected}
              className="gradient-leaf text-primary-foreground"
              data-testid="assign-tent-submit"
            >
              {isMove ? "Move Plant" : "Assign plant"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
