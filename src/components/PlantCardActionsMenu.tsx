import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@/lib/react-router-compat";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  MoreHorizontal,
  ExternalLink,
  Pencil,
  Move,
  Unlink,
  Archive,
  RotateCcw,
  GitMerge,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import EditPlantDialog from "@/components/EditPlantDialog";
import AssignTentDialog from "@/components/AssignTentDialog";
import PlantMergeDialog from "@/components/PlantMergeDialog";
import { plantDetailPath } from "@/lib/routes";

import {
  buildArchivePlantPayload,
  buildRemovePlantFromTentPayload,
  buildRestorePlantPayload,
  resolvePlantArchiveMenuAction,
} from "@/lib/plantTentRelationshipRules";
import { PlantLifecycleWriteRules } from "@/lib/plantLifecycleWriteRules";

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
  isArchived?: boolean | null;
  photo?: string | null;
  /** Stored plant type; required for Edit Plant to prefill and preserve it. */
  plantType?: string | null;
}

interface Props {
  plant: Plant;
  /** When true (PlantDetail), render an inline action row. Otherwise dropdown. */
  variant?: "row" | "menu";
  /** Hide the View action when already on Plant Detail. */
  hideView?: boolean;
}

/**
 * Plant management actions: View / Edit / Move / Remove from tent / Archive or Restore.
 *
 * Remove from Tent only nulls `plants.tent_id`. Archive only sets
 * `plants.is_archived = true`. Restore only sets `plants.is_archived = false`.
 * Diary entries, photos, and sensor readings are intentionally untouched.
 *
 * Out of scope: alerts, Action Queue, sensors, automation, device control.
 */
export default function PlantCardActionsMenu({ plant, variant = "menu", hideView = false }: Props) {
  const qc = useQueryClient();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** Lifted Assign/Move dialog — must not live inside DropdownMenuContent. */
  const [assignOpen, setAssignOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const archiveMenuAction = resolvePlantArchiveMenuAction(plant.isArchived);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["plants"] });
    qc.invalidateQueries({ queryKey: ["grow", "plants"] });
    qc.invalidateQueries({ queryKey: ["grow", "plant", plant.id] });
    qc.invalidateQueries({ queryKey: ["tent-detail"] });
  }

  async function removeFromTent() {
    setBusy(true);
    const { error } = await supabase
      .from("plants")
      .update(buildRemovePlantFromTentPayload(plant.id) as never)
      .eq("id", plant.id);
    setBusy(false);
    setConfirmRemove(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Plant removed from tent");
    invalidate();
  }

  async function archivePlant() {
    setBusy(true);
    const { error } = await supabase
      .from("plants")
      .update(buildArchivePlantPayload(plant.id) as never)
      .eq("id", plant.id);
    setBusy(false);
    setConfirmArchive(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Plant archived");
    invalidate();
  }

  async function restorePlant() {
    setBusy(true);
    const { error } = await supabase
      .from("plants")
      .update(buildRestorePlantPayload(plant.id) as never)
      .eq("id", plant.id);
    setBusy(false);
    setConfirmRestore(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Plant restored");
    invalidate();
  }

  async function deletePlant() {
    setBusy(true);
    const result = await supabase.from("plants").delete().eq("id", plant.id).select("id");
    setBusy(false);
    setConfirmDelete(false);
    if (!PlantLifecycleWriteRules.rowWasWritten(result)) {
      toast.error(
        PlantLifecycleWriteRules.failureMessage(
          result,
          "Plant was not deleted. Linked records may still reference it.",
        ),
      );
      return;
    }
    toast.success("Plant deleted");
    invalidate();
  }

  const confirmDialogs = (
    <>
      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent data-testid="confirm-remove-plant-from-tent">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this plant from this tent?</AlertDialogTitle>
            <AlertDialogDescription>
              The plant stays in your grow. Logs, photos, and diary history are not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={removeFromTent}
              data-testid="confirm-remove-plant-from-tent-submit"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <AlertDialogContent data-testid="confirm-archive-plant">
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {plant.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Archiving hides the plant from your active lists. Logs, photos, and diary history are
              kept. You can restore it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void archivePlant();
              }}
              data-testid="confirm-archive-plant-submit"
            >
              Archive plant
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmRestore} onOpenChange={setConfirmRestore}>
        <AlertDialogContent data-testid="confirm-restore-plant">
          <AlertDialogHeader>
            <AlertDialogTitle>Restore {plant.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Restoring brings the plant back into your active lists. Logs, photos, and diary
              history stay intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={restorePlant}
              data-testid="confirm-restore-plant-submit"
            >
              Restore plant
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent data-testid="confirm-delete-plant">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {plant.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the plant. Logs and photos that the database already cascades or unlinks
              are updated with it. If the database refuses, the plant stays and you will see the
              error.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void deletePlant();
              }}
              data-testid="confirm-delete-plant-submit"
            >
              Delete plant
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  const archiveOrRestoreRowButton =
    archiveMenuAction === "restore" ? (
      <Button
        size="sm"
        variant="outline"
        className="gap-1"
        onClick={() => setConfirmRestore(true)}
        data-testid="plant-detail-restore-plant"
      >
        <RotateCcw className="h-4 w-4" /> Restore Plant
      </Button>
    ) : (
      <Button
        size="sm"
        variant="outline"
        className="gap-1 text-destructive hover:text-destructive"
        onClick={() => setConfirmArchive(true)}
        data-testid="plant-detail-archive-plant"
      >
        <Archive className="h-4 w-4" /> Archive Plant
      </Button>
    );

  const archiveOrRestoreMenuItem =
    archiveMenuAction === "restore" ? (
      <DropdownMenuItem
        onSelect={(e) => {
          e.preventDefault();
          setConfirmRestore(true);
        }}
        data-testid="plant-card-action-restore"
      >
        <RotateCcw className="h-4 w-4 mr-2" /> Restore Plant
      </DropdownMenuItem>
    ) : (
      <DropdownMenuItem
        className="text-destructive focus:text-destructive"
        onSelect={(e) => {
          e.preventDefault();
          setConfirmArchive(true);
        }}
        data-testid="plant-card-action-archive"
      >
        <Archive className="h-4 w-4 mr-2" /> Archive Plant
      </DropdownMenuItem>
    );

  if (variant === "row") {
    return (
      <div className="flex flex-wrap gap-2" data-testid="plant-card-actions-row">
        <EditPlantDialog
          plant={plant}
          trigger={
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              data-testid="plant-detail-edit-plant"
            >
              <Pencil className="h-4 w-4" /> Edit Plant
            </Button>
          }
        />
        {plant.tentId && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() => setConfirmRemove(true)}
            data-testid="plant-detail-remove-from-tent"
          >
            <Unlink className="h-4 w-4" /> Remove from Tent
          </Button>
        )}
        <PlantMergeDialog
          source={{
            id: plant.id,
            name: plant.name,
            strain: plant.strain,
            grow_id: plant.growId ?? null,
            tent_id: plant.tentId ?? null,
            started_at: plant.startedAt ?? null,
            is_archived: plant.isArchived ?? false,
          }}
          trigger={
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              data-testid="plant-detail-merge-duplicate"
            >
              <GitMerge className="h-4 w-4" /> Merge Duplicate
            </Button>
          }
        />
        {archiveOrRestoreRowButton}
        <Button
          size="sm"
          variant="outline"
          className="gap-1 text-destructive hover:text-destructive"
          onClick={() => setConfirmDelete(true)}
          data-testid="plant-detail-delete-plant"
        >
          <Trash2 className="h-4 w-4" /> Delete Plant
        </Button>
        {confirmDialogs}
      </div>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={(e) => e.preventDefault()}
            data-testid="plant-card-actions-trigger"
            aria-label="Plant actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" data-testid="plant-card-actions-menu">
          {!hideView && (
            <DropdownMenuItem asChild data-testid="plant-card-action-view">
              <Link to={plantDetailPath(plant.id)}>
                <ExternalLink className="h-4 w-4 mr-2" /> View Plant
              </Link>
            </DropdownMenuItem>
          )}
          <EditPlantDialog
            plant={plant}
            trigger={
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                data-testid="plant-card-action-edit"
              >
                <Pencil className="h-4 w-4 mr-2" /> Edit Plant
              </DropdownMenuItem>
            }
          />
          <DropdownMenuItem
            onSelect={() => setAssignOpen(true)}
            data-testid="plant-card-action-move"
          >
            <Move className="h-4 w-4 mr-2" /> Move Plant
          </DropdownMenuItem>
          {plant.tentId && (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setConfirmRemove(true);
              }}
              data-testid="plant-card-action-remove"
            >
              <Unlink className="h-4 w-4 mr-2" /> Remove from Tent
            </DropdownMenuItem>
          )}
          <PlantMergeDialog
            source={{
              id: plant.id,
              name: plant.name,
              strain: plant.strain,
              grow_id: plant.growId ?? null,
              tent_id: plant.tentId ?? null,
              started_at: plant.startedAt ?? null,
              is_archived: plant.isArchived ?? false,
            }}
            trigger={
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                data-testid="plant-card-action-merge"
              >
                <GitMerge className="h-4 w-4 mr-2" /> Merge Duplicate
              </DropdownMenuItem>
            }
          />
          <DropdownMenuSeparator />
          {archiveOrRestoreMenuItem}
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={(e) => {
              e.preventDefault();
              setConfirmDelete(true);
            }}
            data-testid="plant-card-action-delete"
          >
            <Trash2 className="h-4 w-4 mr-2" /> Delete Plant
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AssignTentDialog
        plantId={plant.id}
        growId={plant.growId ?? null}
        currentTentId={plant.tentId ?? null}
        open={assignOpen}
        onOpenChange={setAssignOpen}
      />
      {confirmDialogs}
    </>
  );
}
