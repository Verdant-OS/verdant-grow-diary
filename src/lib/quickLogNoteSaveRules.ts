/**
 * Quick Log note-save rules — pure, deterministic, null-safe.
 *
 * The All activity types Note panel saves its own diary entry. After that save
 * the legacy Quick Log form below it must stop asking for a note, and its
 * Save log must not write the same note a second time. Both confirmations name
 * the saved note text so the grower can see what went in.
 *
 * No React, no Supabase, no clock.
 */

/** Preview line code that replaces `note:missing` after a panel note save. */
export const QUICK_LOG_PANEL_NOTE_SAVED_CODE = "note:saved-in-panel" as const;

/** Shown when Save log would repeat the note the Note panel already saved. */
export const QUICK_LOG_NOTE_ALREADY_SAVED_COPY =
  "This note is already saved. Change the text to add another entry, or close Quick Log.";

/** Default length of a note excerpt shown in a save confirmation. */
export const QUICK_LOG_SAVED_NOTE_EXCERPT_MAX = 120;

/** Legacy Quick Log event types that save as a plain note entry. */
const NOTE_LIKE_EVENT_TYPES: ReadonlySet<string> = new Set(["observation", "note"]);

/** Trim and collapse whitespace; anything that is not a string becomes "". */
export function normalizeQuickLogNoteText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

/** A short, single-line excerpt of a saved note, or null when there is no text. */
export function buildQuickLogSavedNoteExcerpt(
  note: unknown,
  max: number = QUICK_LOG_SAVED_NOTE_EXCERPT_MAX,
): string | null {
  const text = normalizeQuickLogNoteText(note);
  if (!text) return null;
  const limit =
    Number.isFinite(max) && max >= 2 ? Math.floor(max) : QUICK_LOG_SAVED_NOTE_EXCERPT_MAX;
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trimEnd()}…`;
}

/** Grower-facing preview line naming the note the panel already saved. */
export function buildPanelSavedNotePreviewMessage(note: unknown): string | null {
  const excerpt = buildQuickLogSavedNoteExcerpt(note);
  if (!excerpt) return null;
  return `Note saved: “${excerpt}”. You don't need to save it again.`;
}

export interface QuickLogPreviewLine {
  code: string;
  message: string;
  severity: "info" | "warning";
}

/**
 * Swap the "Add a quick note before saving" hint for a saved-note line once
 * the Note panel has saved a note. Returns the input array unchanged when no
 * panel note was saved, so callers can compare by reference.
 */
export function applyPanelSavedNoteToPreviewWarnings<T extends QuickLogPreviewLine>(
  warnings: readonly T[],
  panelSavedNote: string | null | undefined,
): ReadonlyArray<T | QuickLogPreviewLine> {
  const message = buildPanelSavedNotePreviewMessage(panelSavedNote);
  if (!message) return warnings;
  if (!warnings.some((w) => w.code === "note:missing")) return warnings;
  return warnings.map((w) =>
    w.code === "note:missing"
      ? { code: QUICK_LOG_PANEL_NOTE_SAVED_CODE, message, severity: "info" as const }
      : w,
  );
}

export interface DuplicatePanelNoteInput {
  note: unknown;
  panelSavedNote: unknown;
  eventType: unknown;
}

/**
 * True when Save log would write the same plain note the Note panel already
 * saved in this Quick Log session. Other entry types keep their own data and
 * are never blocked here.
 */
export function isDuplicateOfPanelSavedNote(input: DuplicatePanelNoteInput): boolean {
  if (typeof input.eventType !== "string" || !NOTE_LIKE_EVENT_TYPES.has(input.eventType)) {
    return false;
  }
  const note = normalizeQuickLogNoteText(input.note);
  const saved = normalizeQuickLogNoteText(input.panelSavedNote);
  return note.length > 0 && note === saved;
}

/** Title of the toast shown when the All activity types Note panel saves. */
export const QUICK_LOG_NOTE_SAVED_TOAST_TITLE = "Note saved";

/** Length of the first-line quote in the Note-saved toast. */
export const QUICK_LOG_NOTE_SAVED_TOAST_EXCERPT_MAX = 80;

export interface QuickLogNoteSavedToast {
  title: string;
  /** The note's first non-empty line, quoted; null when there is no text. */
  description: string | null;
}

/** Toast for a confirmed Note panel save: the title and the note's first line. */
export function buildQuickLogNoteSavedToast(note: unknown): QuickLogNoteSavedToast {
  const firstLine =
    typeof note === "string"
      ? (note.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "")
      : "";
  const excerpt = buildQuickLogSavedNoteExcerpt(firstLine, QUICK_LOG_NOTE_SAVED_TOAST_EXCERPT_MAX);
  return {
    title: QUICK_LOG_NOTE_SAVED_TOAST_TITLE,
    description: excerpt ? `“${excerpt}”` : null,
  };
}
