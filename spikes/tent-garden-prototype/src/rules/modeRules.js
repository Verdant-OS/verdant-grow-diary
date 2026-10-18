// Pure mode-transition rules. The UI asks these functions what to do; it never resets a draft itself.

/**
 * Decide what entering a mode does to the draft.
 * - view→edit: start a fresh draft from the saved state.
 * - edit→edit (repeated click): keep the draft untouched.
 * - edit→view with unsaved changes or a pending failed save: ask first.
 * - anything else: switch with no draft change.
 *
 * @param {{ mode: "view"|"edit", hasUnsaved: boolean, isToday: boolean }} current
 * @param {"view"|"edit"} requested
 * @returns {{ action: "noop"|"start-draft"|"confirm-discard"|"switch", mode: "view"|"edit" }}
 */
export function resolveModeChange(current, requested) {
  const mode = current?.mode === "edit" ? "edit" : "view";
  if (requested === "edit") {
    if (!current?.isToday) return { action: "noop", mode };
    if (mode === "edit") return { action: "noop", mode: "edit" };
    return { action: "start-draft", mode: "edit" };
  }
  if (mode === "edit" && current?.hasUnsaved) return { action: "confirm-discard", mode: "edit" };
  return { action: "switch", mode: "view" };
}

/**
 * Which leave controls Edit Layout shows.
 * No draft changes: Done, and Done returns to View.
 * Draft changes, or a failed save that still holds the draft: Undo, Cancel and Save.
 * @param {{ changeCount?:number, noteChangeCount?:number, saveFailed?:boolean } | null} input
 * @returns {{ kind:"clean"|"draft", buttons:string[] }}
 */
export function editLeaveControls(input) {
  const changes = Number(input?.changeCount) || 0;
  const notes = Number(input?.noteChangeCount) || 0;
  if (changes + notes > 0 || input?.saveFailed) return { kind: "draft", buttons: ["undo", "cancel", "save"] };
  return { kind: "clean", buttons: ["done"] };
}

/** Camera interaction is locked whenever layout editing is on. */
export function cameraLocked(mode) {
  return mode === "edit";
}

/**
 * Should Escape clear the current selection? Anywhere on the page, except where Escape already
 * means something else: an open dialog (Escape closes it), a text field or select (Escape is
 * the user's own cancel there), or a key another handler already consumed.
 * @param {{ key?:string, defaultPrevented?:boolean, dialogOpen?:boolean, editableTarget?:boolean, hasSelection?:boolean }} e
 */
export function escapeClearsSelection(e) {
  return (
    !!e &&
    e.key === "Escape" &&
    !e.defaultPrevented &&
    !e.dialogOpen &&
    !e.editableTarget &&
    !!e.hasSelection
  );
}
