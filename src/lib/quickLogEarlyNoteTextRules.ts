import {
  buildEarlyStageDetails,
  buildEarlyStageNoteSuffix,
  type EarlyStageDetailsInput,
} from "@/lib/earlyStageQuickLogRules";

export interface QuickLogEarlyNoteTextInput extends EarlyStageDetailsInput {
  /**
   * The rest of the diary note the early-stage text is appended to: Short
   * note, hardware readings and optional details, already joined. Empty or
   * absent when the grower typed nothing else.
   */
  otherNoteText?: string | null;
}

/**
 * Early-stage text for the saved diary note.
 *
 * When "What changed?" is the only thing the grower wrote (no Short note,
 * readings, details, milestone or vigor), the note is saved exactly as typed,
 * trimmed, with no "Early note:" label: there is nothing else to tell it apart
 * from. Every other case keeps `buildEarlyStageNoteSuffix` unchanged.
 *
 * Only shapes new saves. Notes already saved are never rewritten.
 */
export function buildQuickLogEarlyStageNoteText(input: QuickLogEarlyNoteTextInput): string {
  const envelope = buildEarlyStageDetails(input);
  if (!envelope) return "";
  const otherNoteText = typeof input.otherNoteText === "string" ? input.otherNoteText.trim() : "";
  if (
    envelope.notes !== null &&
    envelope.early_stage_milestone === null &&
    envelope.vigor === null &&
    otherNoteText.length === 0
  ) {
    return envelope.notes;
  }
  return buildEarlyStageNoteSuffix(input);
}
