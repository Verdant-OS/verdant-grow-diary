// Pure rules for the note-first Quick Log V2 sheet (Verdant North Star:
// capture the observation immediately, add structure only when useful,
// make the save state obvious). No I/O, no clock, no React.

export type QuickLogV2SaveState = "idle" | "saving" | "saved" | "failed";

export interface QuickLogV2SaveStateInput {
  saving: boolean;
  saved: boolean;
  error: string | null | undefined;
}

/** Saving wins over everything; a confirmed save wins over a stale error. */
export function deriveQuickLogV2SaveState(input: QuickLogV2SaveStateInput): QuickLogV2SaveState {
  if (input.saving) return "saving";
  if (input.saved) return "saved";
  if (input.error && input.error.trim().length > 0) return "failed";
  return "idle";
}

export interface QuickLogV2SaveFailedErrorInput {
  /** True only where a save was actually attempted and failed (not input checks). */
  saveFailed: boolean;
  action: string;
  error: string | null | undefined;
}

/**
 * The note-first "Not saved yet" line belongs to a real failed save of a Note
 * or Water entry. Input errors (no target, unreadable photo, pending video
 * check, empty content), recovery/Timeline messages and Feed (no note box)
 * never surface it. Returns the error to feed into deriveQuickLogV2SaveState.
 */
export function quickLogV2SaveFailedError(input: QuickLogV2SaveFailedErrorInput): string | null {
  if (!input.saveFailed) return null;
  if (input.action !== "note" && input.action !== "water") return null;
  return input.error ?? null;
}

/** Short, plain status line shown next to Save. Empty when there is nothing to say. */
export function quickLogV2SaveStateLabel(state: QuickLogV2SaveState): string {
  switch (state) {
    case "saving":
      return "Saving…";
    case "saved":
      return "Saved";
    case "failed":
      return "Not saved yet. Your note is kept — try again.";
    case "idle":
      return "";
    default: {
      const unreachable: never = state;
      return unreachable;
    }
  }
}

export interface QuickLogV2NoteFocusInput {
  open: boolean;
  action: string;
  recoveryPending: boolean;
  submissionLocked: boolean;
}

/**
 * Focus the note box when a fresh Note sheet opens. Never steal focus while a
 * pending record is being recovered or a submission is locked.
 */
export function shouldFocusQuickLogV2NoteOnOpen(input: QuickLogV2NoteFocusInput): boolean {
  return input.open && input.action === "note" && !input.recoveryPending && !input.submissionLocked;
}
