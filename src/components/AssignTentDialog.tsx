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
import { Move, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  buildPlantTentMovementDetails,
  formatPlantTentMovementNote,
} from "@/lib/plantTentMovementRules";
import { getEligibleTentsForPlantMove } from "@/lib/plantTentRelationshipRules";
import { buildPlantEditGrowIdFromTent } from "@/lib/plantEditSaveRules";
import CreateTentDialog, { type CreatedTent } from "@/components/CreateTentDialog";

interface TentRow {
  id: string;
  name: string;
  grow_id?: string | null;
}

interface Props {
  plantId: string;
  growId?: string | null;
  currentTentId?: string | null;
  trigger?: React.ReactNode;
  /**
   * Optional controlled open for callers that lift this dialog out of a
   * DropdownMenu (Plants list Move) so the menu can close without unmounting.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Assigns or moves a plant to a tent. Updates `plants.tent_id`, and on
 * empty-grow / no-grow re-home also copies `grow_id` from the selected tent.
 * RLS enforces ownership. The client never sets user_id / strain / stage / notes.
 *
 * After a successful assignment, one diary entry records the movement. That
 * secondary evidence write never rolls back or obscures the assignment.
 * Sensor readings, alerts, Action Queue, automation, and device control remain
 * out of scope.
 */
export default function AssignTentDialog({
  plantId,
  growId,
  currentTentId,
  trigger,
  open: openProp,
  onOpenChange,
}: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isControlled = openProp !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = isControlled ? openProp : uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const [selected, setSelected] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [createTentOpen, setCreateTentOpen] = useState(false);

  const isMove = Boolean(currentTentId);

  const { data: rows = [], isPending: tentsPending } = useQuery({
    queryKey: ["plant-detail", "eligible-tents", plantId, growId ?? null],
    enabled: open,
    queryFn: async (): Promise<TentRow[]> => {
      // Non-archived tents. When the plant HAS a grow with tents, cross-grow
      // tents are excluded by the grow_id filter. When it does NOT have a grow
      // (legacy / ON DELETE SET NULL), or when it HAS a grow but that grow has
      // zero selectable tents (Vegetation cleanup orphan — measured empty
      // "No tents available in this grow"), fall back to the owner's tents so
      // the plant can be re-homed. Ownership stays fenced by RLS either way;
      // EditPlantDialog uses the same empty-grow fallback.
      const mapRows = (
        data: Array<{ id: string; name: string | null; grow_id: string | null }> | null,
      ): TentRow[] =>
        (data ?? []).map((t) => ({
          id: t.id as string,
          name: (t.name as string) ?? "Unnamed tent",
          grow_id: (t.grow_id as string | null) ?? null,
        }));

      let q = supabase
        .from("tents")
        .select("id, name, grow_id, is_archived")
        .eq("is_archived", false);
      if (growId) q = q.eq("grow_id", growId as string);
      const { data, error } = await q.order("created_at", { ascending: true });
      if (error) throw error;
      const scoped = mapRows(data);
      if (growId && scoped.length === 0) {
        const { data: allData, error: allErr } = await supabase
          .from("tents")
          .select("id, name, grow_id, is_archived")
          .eq("is_archived", false)
          .order("created_at", { ascending: true });
        if (allErr) throw allErr;
        return mapRows(allData);
      }
      return scoped;
    },
  });

  // When the plant's grow had zero tents we fell back to the full list above.
  // Treat that as no grow filter for eligibility partitioning so Male Tent
  // (and other owner tents) remain selectable.
  const usedGrowFallback =
    Boolean(growId) && rows.length > 0 && !rows.some((t) => t.grow_id === growId);
  const effectiveGrowId = usedGrowFallback ? null : (growId ?? null);

  // Partitioning lives in the pure, unit-tested helper rather than inline:
  // its cross-grow rule ("skip the grow filter entirely when the plant has
  // no grow") is the exact semantics this dialog needs for a null-grow
  // plant, and it stays covered by plant-tent-crud-management.test.ts.
  const { others, current } = useMemo(
    () => getEligibleTentsForPlantMove(rows, currentTentId ?? null, effectiveGrowId),
    [rows, currentTentId, effectiveGrowId],
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
    // Update tent_id. On empty-grow / no-grow re-home, also copy grow_id from
    // the selected tent so Quick Log / timeline regain grow context. Never
    // touch user_id / strain / stage / notes.
    const nextTent = others.find((t) => t.id === selected) ?? rows.find((t) => t.id === selected);
    const growPatch =
      !growId || usedGrowFallback
        ? buildPlantEditGrowIdFromTent({
            selectedTentId: selected,
            selectedTentGrowId: nextTent?.grow_id ?? null,
            plantGrowId: growId ?? null,
            usedGrowFallback: usedGrowFallback || !growId,
          })
        : null;
    const { error } = await supabase
      .from("plants")
      .update({ tent_id: selected, ...(growPatch ?? {}) })
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
    let timelineRecordFailed = false;
    // diary_entries.grow_id is NOT NULL. Prefer the grow we just attached
    // (re-home), else the plant's existing grow. Skip when neither exists.
    const timelineGrowId =
      growPatch && "grow_id" in growPatch && growPatch.grow_id
        ? growPatch.grow_id
        : (growId ?? null);
    const timelineSkippedWithoutGrow = !timelineGrowId;
    if (timelineGrowId) {
      const { error: diaryErr } = await supabase.from("diary_entries").insert({
        user_id: user.id,
        grow_id: timelineGrowId,
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
        timelineRecordFailed = true;
        console.error("[AssignTentDialog] movement diary insert failed", diaryErr);
        // Non-fatal: the plant has been moved successfully. Do not offer an
        // automatic retry here: this direct insert has no idempotency fence, so
        // an ambiguous transport failure could produce a duplicate timeline row.
      }
    }

    setBusy(false);
    if (timelineRecordFailed) {
      toast.warning(
        isMove
          ? "Plant moved, but its timeline entry was not recorded"
          : "Plant assigned, but its timeline entry was not recorded",
        {
          description:
            "The tent assignment is saved. Use Quick Log to add a manual note if you need this change in the plant timeline.",
        },
      );
    } else if (timelineSkippedWithoutGrow) {
      toast.warning(
        isMove
          ? "Plant moved, but its timeline entry was not recorded"
          : "Plant assigned, but its timeline entry was not recorded",
        {
          description:
            "The tent assignment is saved. This plant is not linked to a grow yet, so this change could not be added to its timeline. Link the plant to its tent setup on the plant page to record future changes.",
        },
      );
    } else {
      toast.success(isMove ? "Plant moved to new current tent" : "Plant assigned to tent");
    }
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
  // Controlled Plants-list Move owns a menu item and omits DialogTrigger so the
  // dialog can live outside DropdownMenuContent (menu closes on select).
  const showTrigger = trigger !== undefined || !isControlled;

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        {showTrigger ? (
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
        ) : null}
        <DialogContent className="glass max-w-md" data-testid="assign-tent-dialog">
          <DialogHeader>
            <DialogTitle className="font-display">
              {isMove ? "Move Plant" : "Assign to tent"}
            </DialogTitle>
          </DialogHeader>

          {tentsPending ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : others.length === 0 && current.length === 0 ? (
            <div className="grid gap-3" data-testid="assign-tent-empty">
              <p className="text-sm text-muted-foreground">
                {growId && !usedGrowFallback
                  ? "No tents available in this grow."
                  : "No tents available."}
              </p>
              {growId ? (
                <div data-testid="assign-tent-create-tent-cta" data-grow-id={growId}>
                  {/*
                    Plain Button — do not nest CreateTentDialog's DialogTrigger
                    inside this Dialog. Live MEASURED miss: grow-scoped empty
                    copy rendered while the nested Create tent trigger did not
                    appear (Assign open under Plants → Move dropdown).
                  */}
                  <Button
                    type="button"
                    className="gradient-leaf text-primary-foreground gap-1"
                    data-testid="assign-tent-create-tent-button"
                    onClick={() => setCreateTentOpen(true)}
                  >
                    <Plus className="h-4 w-4" /> Create tent
                  </Button>
                </div>
              ) : null}
            </div>
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
      {growId && createTentOpen ? (
        <CreateTentDialog
          defaultGrowId={growId}
          open={createTentOpen}
          onOpenChange={setCreateTentOpen}
          onCreated={async (tent: CreatedTent) => {
            await qc.invalidateQueries({
              queryKey: ["plant-detail", "eligible-tents", plantId, growId],
            });
            setSelected(tent.id);
            setCreateTentOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
