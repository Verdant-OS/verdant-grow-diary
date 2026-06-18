/**
 * DiaryEntryRemoveButton — single-entry diary/photo log removal control.
 *
 * Presents an explicit two-step (button -> confirmation dialog) UI for
 * removing one diary entry that was added to the wrong plant/strain.
 *
 * Safety:
 *   - No bulk delete.
 *   - No keyboard one-click shortcut. Confirm requires a real click.
 *   - Hidden entirely when eligibility check rejects the entry.
 *   - Toast/dialog copy is fixed; never echoes raw DB errors.
 */
import { useState } from "react";
import { Trash2 } from "lucide-react";
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
import { useRemoveDiaryEntry } from "@/hooks/useRemoveDiaryEntry";
import {
  REMOVE_LOG_DIALOG_BODY,
  REMOVE_LOG_DIALOG_CANCEL,
  REMOVE_LOG_DIALOG_CONFIRM,
  REMOVE_LOG_DIALOG_TITLE,
  REMOVE_PHOTO_LOG_DIALOG_EXTRA,
  canRemoveDiaryEntry,
  getRemoveButtonAriaLabel,
  getRemoveButtonLabel,
  isPhotoLogEntry,
  type DiaryEntryRemovalCandidate,
  type DiaryEntryRemovalViewerContext,
} from "@/lib/diaryEntryRemovalRules";

export interface DiaryEntryRemoveButtonProps {
  entry: DiaryEntryRemovalCandidate;
  viewer: DiaryEntryRemovalViewerContext;
  plantName?: string | null;
  /** Optional metadata passed through for query invalidation. Not shown to users. */
  plantId?: string | null;
  tentId?: string | null;
  growId?: string | null;
  onRemoved?: (id: string) => void;
  className?: string;
}

export default function DiaryEntryRemoveButton({
  entry,
  viewer,
  plantName,
  plantId,
  tentId,
  growId,
  onRemoved,
  className,
}: DiaryEntryRemoveButtonProps) {
  const [open, setOpen] = useState(false);
  const { remove, isRemoving } = useRemoveDiaryEntry(onRemoved);

  if (!canRemoveDiaryEntry(entry, viewer)) return null;

  const isPhoto = isPhotoLogEntry(entry);
  const label = getRemoveButtonLabel(isPhoto);
  const aria = getRemoveButtonAriaLabel(isPhoto, plantName);

  const handleConfirm = async () => {
    if (!entry.id) return;
    const ok = await remove({
      id: entry.id,
      isPhotoLog: isPhoto,
      plantId,
      tentId,
      growId,
    });
    if (ok) setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={(ev) => {
          ev.stopPropagation();
          setOpen(true);
        }}
        aria-label={aria}
        data-testid="diary-entry-remove-button"
        className={
          className ??
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
        }
      >
        <Trash2 className="h-3 w-3" />
        {label}
      </button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent data-testid="diary-entry-remove-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{REMOVE_LOG_DIALOG_TITLE}</AlertDialogTitle>
            <AlertDialogDescription>
              {REMOVE_LOG_DIALOG_BODY}
              {isPhoto ? ` ${REMOVE_PHOTO_LOG_DIALOG_EXTRA}` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              data-testid="diary-entry-remove-cancel"
              disabled={isRemoving}
            >
              {REMOVE_LOG_DIALOG_CANCEL}
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="diary-entry-remove-confirm"
              onClick={(ev) => {
                ev.preventDefault();
                void handleConfirm();
              }}
              disabled={isRemoving}
            >
              {REMOVE_LOG_DIALOG_CONFIRM}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
