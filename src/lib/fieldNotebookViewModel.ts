/**
 * Field notebook presentation. Copy is data. Times are formatted from the
 * server timestamp the caller already verified. No Date.now().
 */

import type { FieldNotebookPhase } from "./fieldNotebookOutcomeRules";

export const FIELD_NOTEBOOK_EMPTY_NOTE_PLACEHOLDER = "Add what you observed.";

export const FIELD_NOTEBOOK_READING_MISSING = "—";

export interface ReadingSlot {
  label: "TEMP" | "RH" | "VPD" | "PPFD";
  /** Null when the reading is absent. Zero is a real value. */
  value: string | null;
  source: string | null;
  ageLabel: string | null;
  /** Epoch ms of the underlying sample. Null when absent. */
  capturedAtMs: number | null;
}

export function formatReadingValue(value: string | null): string {
  if (value === null || value.trim() === "") return FIELD_NOTEBOOK_READING_MISSING;
  return value;
}

export function formatReadingProvenance(slot: ReadingSlot): string | null {
  if (slot.value === null || slot.value.trim() === "") return null;
  if (!slot.source || !slot.ageLabel) return null;
  return `${slot.source} · ${slot.ageLabel}`;
}

/**
 * VPD shows only when TEMP and RH share the same captured instant.
 * Display strings are not compared. No new staleness threshold.
 */
export function vpdAllowed(temp: ReadingSlot, rh: ReadingSlot): boolean {
  if (temp.capturedAtMs === null || rh.capturedAtMs === null) return false;
  if (temp.value === null || rh.value === null) return false;
  if (temp.value.trim() === "" || rh.value.trim() === "") return false;
  return temp.capturedAtMs === rh.capturedAtMs;
}

/** Format an authoritative ISO timestamp in the grower's local time. */
export function formatServerClockLabel(iso: string): string | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(ms);
}

export function formatSavedLine(tentName: string, serverTimeLabel: string): string {
  return `Saved to ${tentName} · ${serverTimeLabel}`;
}

export function formatSaveButton(tentName: string): string {
  return `Save to ${tentName}`;
}

export function formatUncertainLine(): string {
  return "This note may not have saved. Check Timeline. It stays here so you can copy it.";
}

export function formatClearFailureLine(): string {
  return "Couldn't save. Your note is still here.";
}

export function formatFoundTitle(tentName: string, serverTimeLabel: string): string {
  return `${tentName} · ${serverTimeLabel}`;
}

export interface StatusView {
  phase: FieldNotebookPhase;
  statusLine: string | null;
  primaryLabel: string;
  primaryDisabled: boolean;
  showRetry: boolean;
  showCheckTimeline: boolean;
}

export function statusView(input: {
  phase: FieldNotebookPhase;
  tentName: string;
  serverTimeLabel: string | null;
  noteChanged?: boolean;
}): StatusView {
  const save = formatSaveButton(input.tentName);
  switch (input.phase) {
    case "editing":
      return {
        phase: input.phase,
        statusLine: null,
        primaryLabel: save,
        primaryDisabled: false,
        showRetry: false,
        showCheckTimeline: false,
      };
    case "saving":
      return {
        phase: input.phase,
        statusLine: null,
        primaryLabel: "Saving...",
        primaryDisabled: true,
        showRetry: false,
        showCheckTimeline: false,
      };
    case "saved":
      return {
        phase: input.phase,
        statusLine:
          input.serverTimeLabel !== null
            ? formatSavedLine(input.tentName, input.serverTimeLabel)
            : null,
        primaryLabel: input.noteChanged ? save : "New note",
        primaryDisabled: false,
        showRetry: false,
        showCheckTimeline: false,
      };
    case "clear_failure":
      return {
        phase: input.phase,
        statusLine: formatClearFailureLine(),
        primaryLabel: "Retry",
        primaryDisabled: false,
        showRetry: true,
        showCheckTimeline: false,
      };
    case "uncertain":
      return {
        phase: input.phase,
        statusLine: formatUncertainLine(),
        primaryLabel: save,
        primaryDisabled: true,
        showRetry: false,
        showCheckTimeline: true,
      };
    case "check_found":
      return {
        phase: input.phase,
        statusLine: "Not sure this saved",
        primaryLabel: "Yes, that's it",
        primaryDisabled: false,
        showRetry: false,
        showCheckTimeline: false,
      };
    case "check_none":
      return {
        phase: input.phase,
        statusLine: "No matching entry found",
        primaryLabel: "Back to note",
        primaryDisabled: false,
        showRetry: false,
        showCheckTimeline: false,
      };
    default: {
      const _never: never = input.phase;
      return _never;
    }
  }
}
