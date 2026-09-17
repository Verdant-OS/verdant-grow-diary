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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import {
  PHENO_UNTAG_BEFORE_CROSS_GROW_MOVE_COPY,
  buildPlantPhenoUntagPayload,
  buildPlantTentMoveUpdate,
  isHuntLinkedPlant,
  partitionTentsForPlantMove,
} from "@/lib/plantTentRelationshipRules";
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
 * Hunt-linked plants (`pheno_hunt_id` set) never change grow_id until the
 * grower explicitly untags — untag and move are separate confirms.
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
  const [selected, setSelected] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [createTentOpen, setCreateTentOpen] = useState(false);
  const [untaggedThisSession, setUntaggedThisSession] = useState(false);
  const [confirmUntag, setConfirmUntag] = useState(false);
  const [untagBusy, setUntagBusy] = useState(false);

  const setOpen = (next: boolean) => {
    if (!next) {
      setSelected("");
      setUntaggedThisSession(false);
      setConfirmUntag(false);
    }
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  const isMove = Boolean(currentTentId);

  const {
    data: huntTag,
    isPending: huntTagPending,
    isError: huntTagError,
  } = useQuery({
    queryKey: ["plant-detail", "pheno-hunt-tag", plantId],
    enabled: open,
    queryFn: async (): Promise<{ phenoHuntId: string | null }> => {
      const { data, error } = await supabase
        .from("plants")
        .select("pheno_hunt_id")
        .eq("id", plantId)
        .maybeSingle();
      if (error) throw error;
      const raw = (data as { pheno_hunt_id?: string | null } | null)?.pheno_hunt_id;
      return {
        phenoHuntId: typeof raw === "string" && raw.trim().length > 0 ? raw : null,
      };
    },
  });

  const livePhenoHuntId = untaggedThisSession
    ? null
    : huntTagError
      ? "unread"
      : (huntTag?.phenoHuntId ?? null);
  const huntLinked = isHuntLinkedPlant(livePhenoHuntId) && livePhenoHuntId !== "unread";
  const skipGrowFallback = livePhenoHuntId != null;

  const mapRows = (
    data: Array<{ id: string; name: string | null; grow_id: string | null }> | null,
  ): TentRow[] =>
    (data ?? []).map((t) => ({
      id: t.id as string,
      name: (t.name as string) ?? "Unnamed tent",
      grow_id: (t.grow_id as string | null) ?? null,
    }));

  const { data: rows = [], isPending: tentsPending } = useQuery({
    queryKey: [
      "plant-detail",
      "eligible-tents",
      plantId,
      growId ?? null,
      huntLinked,
      skipGrowFallback,
      untaggedThisSession,
    ],
    enabled: open && !huntTagPending,
    queryFn: async (): Promise<TentRow[]> => {
      // Non-archived tents. When the plant HAS a grow with tents, cross-grow
      // tents are excluded by the grow_id filter. When it does NOT have a grow
      // (legacy / ON DELETE SET NULL), or when it HAS a grow but that grow has
      // zero selectable tents (Vegetation cleanup orphan — measured empty
      // "No tents available in this grow"), fall back to the owner's tents so
      // the plant can be re-homed — except hunt-linked plants, which must
      // untag before any grow_id change. Ownership stays fenced by RLS either
      // way; EditPlantDialog uses the same empty-grow fallback.
      let q = supabase
        .from("tents")
        .select("id, name, grow_id, is_archived")
        .eq("is_archived", false);
      if (growId && !untaggedThisSession) q = q.eq("grow_id", growId as string);
      const { data, error } = await q.order("created_at", { ascending: true });
      if (error) throw error;
      const scoped = mapRows(data);
      if (growId && scoped.length === 0 && !skipGrowFallback && !untaggedThisSession) {
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

  const { data: ownerTents = [] } = useQuery({
    queryKey: ["plant-detail", "owner-tents", plantId],
    enabled: open && huntLinked && !untaggedThisSession,
    queryFn: async (): Promise<TentRow[]> => {
      const { data, error } = await supabase
        .from("tents")
        .select("id, name, grow_id, is_archived")
        .eq("is_archived", false)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return mapRows(data);
    },
  });

  // When the plant's grow had zero tents we fell back to the full list above.
  // Treat that as no grow filter for eligibility partitioning so Male Tent
  // (and other owner tents) remain selectable. Hunt-linked plants skip this
  // until an explicit untag — grow_id must not change while tagged.
  const usedGrowFallback =
    !skipGrowFallback &&
    Boolean(growId) &&
    rows.length > 0 &&
    !rows.some((t) => t.grow_id === growId);
  const effectiveGrowId = usedGrowFallback ? null : (growId ?? null);
  const includeCrossGrow = untaggedThisSession;

  const { sameGrow, otherGrow, current } = useMemo(
    () =>
      partitionTentsForPlantMove(rows, currentTentId ?? null, effectiveGrowId, {
        includeCrossGrow,
      }),
    [rows, currentTentId, effectiveGrowId, includeCrossGrow],
  );
  const others = includeCrossGrow ? [...sameGrow, ...otherGrow] : sameGrow;

  const ownerPartition = useMemo(
    () =>
      partitionTentsForPlantMove(ownerTents, currentTentId ?? null, growId ?? null, {
        includeCrossGrow: true,
      }),
    [ownerTents, currentTentId, growId],
  );
  const hasCrossGrowDestinations = ownerPartition.otherGrow.length > 0;
  const showUntagPath =
    huntLinked && (hasCrossGrowDestinations || (Boolean(growId) && sameGrow.length === 0));

  async function confirmPhenoUntag() {
    setUntagBusy(true);
    const { error } = await supabase
      .from("plants")
      .update(buildPlantPhenoUntagPayload() as never)
      .eq("id", plantId);
    setUntagBusy(false);
    if (error) {
      toast.error(error.message || PHENO_UNTAG_BEFORE_CROSS_GROW_MOVE_COPY.untagFailed);
      return;
    }
    setUntaggedThisSession(true);
    setConfirmUntag(false);
    toast.success(PHENO_UNTAG_BEFORE_CROSS_GROW_MOVE_COPY.untagSuccess);
    qc.invalidateQueries({ queryKey: ["plant-detail", "pheno-hunt-tag", plantId] });
    qc.invalidateQueries({ queryKey: ["plant-detail", "eligible-tents", plantId] });
    qc.invalidateQueries({ queryKey: ["plants"] });
    qc.invalidateQueries({ queryKey: ["grow", "plant", plantId] });
  }

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
    const nextTent = others.find((t) => t.id === selected) ?? rows.find((t) => t.id === selected);
    const movePayload = buildPlantTentMoveUpdate({
      tentId: selected,
      plantGrowId: growId ?? null,
      destinationGrowId: nextTent?.grow_id ?? null,
      usedGrowFallback: usedGrowFallback || !growId || includeCrossGrow,
      phenoHuntId: livePhenoHuntId,
    });
    if (!movePayload) {
      toast.error(PHENO_UNTAG_BEFORE_CROSS_GROW_MOVE_COPY.blockedMove);
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("plants").update(movePayload).eq("id", plantId);
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
    const timelineGrowId = movePayload.grow_id != null ? movePayload.grow_id : (growId ?? null);
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
  const listingPending = huntTagPending || tentsPending;

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

          {listingPending ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              {huntTagError ? (
                <p
                  className="text-sm text-muted-foreground"
                  data-testid="assign-tent-hunt-tag-error"
                >
                  {PHENO_UNTAG_BEFORE_CROSS_GROW_MOVE_COPY.huntTagLoadFailed}
                </p>
              ) : null}
              {showUntagPath ? (
                <div
                  className="grid gap-2 rounded-md border border-border p-3"
                  data-testid="assign-tent-pheno-untag"
                >
                  <p className="text-sm font-medium">
                    {PHENO_UNTAG_BEFORE_CROSS_GROW_MOVE_COPY.bannerTitle}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {PHENO_UNTAG_BEFORE_CROSS_GROW_MOVE_COPY.bannerBody}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    data-testid="assign-tent-pheno-untag-open"
                    onClick={() => setConfirmUntag(true)}
                  >
                    {PHENO_UNTAG_BEFORE_CROSS_GROW_MOVE_COPY.untagCta}
                  </Button>
                </div>
              ) : null}
              {others.length === 0 && current.length === 0 ? (
                <div className="grid gap-3" data-testid="assign-tent-empty">
                  <p className="text-sm text-muted-foreground">
                    {growId && !usedGrowFallback && !includeCrossGrow
                      ? "No tents available in this grow."
                      : "No tents available."}
                  </p>
                  {growId && !huntLinked ? (
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
                        {sameGrow.length > 0 && (
                          <SelectGroup>
                            <SelectLabel>Tents in this grow</SelectLabel>
                            {sameGrow.map((t) => (
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
                        {includeCrossGrow && otherGrow.length > 0 && (
                          <SelectGroup>
                            <SelectLabel>Tents in other grows</SelectLabel>
                            {otherGrow.map((t) => (
                              <SelectItem
                                key={t.id}
                                value={t.id}
                                data-testid={`assign-tent-option-cross-grow-${t.id}`}
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
            </>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmUntag} onOpenChange={setConfirmUntag}>
        <AlertDialogContent data-testid="assign-tent-pheno-untag-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {PHENO_UNTAG_BEFORE_CROSS_GROW_MOVE_COPY.confirmTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {PHENO_UNTAG_BEFORE_CROSS_GROW_MOVE_COPY.confirmBody}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="assign-tent-pheno-untag-cancel">
              {PHENO_UNTAG_BEFORE_CROSS_GROW_MOVE_COPY.confirmCancel}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={untagBusy}
              onClick={(event) => {
                event.preventDefault();
                void confirmPhenoUntag();
              }}
              data-testid="assign-tent-pheno-untag-submit"
            >
              {PHENO_UNTAG_BEFORE_CROSS_GROW_MOVE_COPY.confirmAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
