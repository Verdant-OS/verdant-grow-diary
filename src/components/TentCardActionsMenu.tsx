import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
import { MoreHorizontal, ExternalLink, Pencil, Archive, Trash2 } from "lucide-react";
import { toast } from "sonner";
import EditTentDialog from "@/components/EditTentDialog";
import { tentDetailPath } from "@/lib/routes";

import { buildArchiveTentPayload, evaluateTentDeleteGuard } from "@/lib/tentManagementRules";

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
  assignedPlantCount: number | null;
  /** When true, hide the View Tent action (e.g. already on Tent Detail). */
  hideView?: boolean;
  variant?: "menu" | "row";
  /** Re-run the include-archived assignment proof when destructive guards fail closed. */
  onRetryAssignments?: () => void;
}

/**
 * Tent management actions: View / Edit / Archive / Delete (guarded).
 *
 * Archive sets `tents.is_archived = true`. Delete is only enabled when
 * the tent has no plants attached. Neither path deletes plants, logs,
 * photos, sensor readings, alerts, or action queue history.
 */
export default function TentCardActionsMenu({
  tent,
  assignedPlantCount,
  hideView = false,
  variant = "menu",
  onRetryAssignments,
}: Props) {
  const qc = useQueryClient();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const guard = evaluateTentDeleteGuard({
    tentId: tent.id,
    assignedPlantCount,
    archiveSupported: true,
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["tents"] });
    qc.invalidateQueries({ queryKey: ["grow", "tents"] });
    qc.invalidateQueries({ queryKey: ["grow", "tent", tent.id] });
  }

  async function archiveTent() {
    if (!guard.canArchive) {
      toast.error(guard.reason ?? "Tent cannot be archived");
      setConfirmArchive(false);
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("tents")
      .update(buildArchiveTentPayload() as never)
      .eq("id", tent.id);
    setBusy(false);
    setConfirmArchive(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Tent archived");
    invalidate();
  }

  async function deleteTent() {
    if (!guard.canDelete) {
      toast.error(guard.reason ?? "Tent cannot be deleted");
      setConfirmDelete(false);
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("tents").delete().eq("id", tent.id);
    setBusy(false);
    setConfirmDelete(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Tent deleted");
    invalidate();
  }

  const confirmDialogs = (
    <>
      <AlertDialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <AlertDialogContent data-testid="confirm-archive-tent">
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {tent.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Archiving hides the tent from active lists. Plants, logs, photos, sensor readings,
              alerts, and action queue history are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || !guard.canArchive}
              onClick={archiveTent}
              data-testid="confirm-archive-tent-submit"
            >
              Archive tent
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent data-testid="confirm-delete-tent">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {tent.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {guard.canDelete
                ? "This permanently removes the tent record. Plants, logs, photos, and sensor history are not deleted."
                : guard.reason}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || !guard.canDelete}
              onClick={deleteTent}
              data-testid="confirm-delete-tent-submit"
            >
              Delete tent
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  if (variant === "row") {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2" data-testid="tent-card-actions-row">
          <EditTentDialog
            tent={tent}
            trigger={
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                data-testid="tent-detail-edit-tent"
              >
                <Pencil className="h-4 w-4" /> Edit Tent
              </Button>
            }
          />
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            disabled={!guard.canArchive}
            aria-describedby={guard.reason ? "tent-management-guard-reason" : undefined}
            onClick={() => setConfirmArchive(true)}
            data-testid="tent-detail-archive-tent"
          >
            <Archive className="h-4 w-4" /> Archive Tent
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1 text-destructive hover:text-destructive disabled:opacity-50"
            disabled={!guard.canDelete}
            aria-describedby={guard.reason ? "tent-management-guard-reason" : undefined}
            onClick={() => setConfirmDelete(true)}
            data-testid="tent-detail-delete-tent"
          >
            <Trash2 className="h-4 w-4" /> Delete Tent
          </Button>
        </div>
        {guard.reason && (
          <div
            id="tent-management-guard-reason"
            role="status"
            aria-live="polite"
            data-testid="tent-management-guard-reason"
            className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground"
          >
            <span className="min-w-0 break-words">{guard.reason}</span>
            {guard.recommendedAction === "retry_plant_count" && onRetryAssignments && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label="Retry plant assignment check"
                onClick={onRetryAssignments}
              >
                Retry
              </Button>
            )}
          </div>
        )}
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
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            data-testid="tent-card-actions-trigger"
            aria-label={`Actions for ${tent.name}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" data-testid="tent-card-actions-menu">
          {guard.reason && (
            <DropdownMenuLabel
              role="status"
              data-testid="tent-card-management-guard-reason"
              className="max-w-64 whitespace-normal break-words text-xs font-normal text-muted-foreground"
            >
              {guard.reason}
            </DropdownMenuLabel>
          )}
          {guard.recommendedAction === "retry_plant_count" && onRetryAssignments && (
            <DropdownMenuItem
              onSelect={() => onRetryAssignments()}
              data-testid="tent-card-action-retry-assignments"
            >
              Retry plant assignment check
            </DropdownMenuItem>
          )}
          {guard.reason && <DropdownMenuSeparator />}
          {!hideView && (
            <DropdownMenuItem asChild data-testid="tent-card-action-view">
              <Link to={tentDetailPath(tent.id)}>
                <ExternalLink className="h-4 w-4 mr-2" /> View Tent
              </Link>
            </DropdownMenuItem>
          )}
          <EditTentDialog
            tent={tent}
            trigger={
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                data-testid="tent-card-action-edit"
              >
                <Pencil className="h-4 w-4 mr-2" /> Edit Tent
              </DropdownMenuItem>
            }
          />
          <DropdownMenuItem
            disabled={!guard.canArchive}
            onSelect={(e) => {
              e.preventDefault();
              if (!guard.canArchive) {
                toast.error(guard.reason ?? "Tent cannot be archived");
                return;
              }
              setConfirmArchive(true);
            }}
            data-testid="tent-card-action-archive"
          >
            <Archive className="h-4 w-4 mr-2" /> Archive Tent
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!guard.canDelete}
            className="text-destructive focus:text-destructive"
            onSelect={(e) => {
              e.preventDefault();
              if (!guard.canDelete) {
                toast.error(guard.reason ?? "Tent cannot be deleted");
                return;
              }
              setConfirmDelete(true);
            }}
            data-testid="tent-card-action-delete"
          >
            <Trash2 className="h-4 w-4 mr-2" /> Delete Tent
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {confirmDialogs}
    </>
  );
}
