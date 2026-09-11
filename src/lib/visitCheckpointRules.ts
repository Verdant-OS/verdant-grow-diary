/**
 * visitCheckpointRules — pure V0 helpers to resurface a guided-walk
 * "Next checkpoint" line from plant diary notes.
 *
 * GDP GATE: no schema/RPC/migration. Checkpoint text is parsed from note
 * bodies written by composeGrowWalkCloseoutNote (`Next checkpoint: …`).
 * Clear is a grower-driven durable marker line on the same entry
 * (`Checkpoint status: done` / `Checkpoint status: dismissed`), matching
 * the existing diary_entries.note update path (EntryEditDialog).
 *
 * No Action Queue. No fake data. Client-side derive only.
 */

export const NEXT_CHECKPOINT_PREFIX = "Next checkpoint:";
export const CHECKPOINT_STATUS_DONE = "Checkpoint status: done";
export const CHECKPOINT_STATUS_DISMISSED = "Checkpoint status: dismissed";

export type CheckpointClearStatus = "done" | "dismissed";

export interface VisitCheckpointDiaryEntry {
  readonly id: string;
  readonly note?: string | null;
  /** Preferred chronology field (diary_entries.entry_at). */
  readonly entry_at?: string | null;
  readonly occurred_at?: string | null;
  readonly created_at?: string | null;
}

export interface PendingVisitCheckpoint {
  readonly text: string;
  /** ISO timestamp of the source diary entry when available. */
  readonly setAt: string | null;
  readonly diaryEntryId: string;
}

function nonBlank(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function entrySortKey(entry: VisitCheckpointDiaryEntry): string {
  return (
    nonBlank(entry.occurred_at) ?? nonBlank(entry.entry_at) ?? nonBlank(entry.created_at) ?? ""
  );
}

/** Parse `Next checkpoint: <text>` from a diary note. Empty → null. */
export function parseNextCheckpointFromNote(note: string): string | null {
  if (typeof note !== "string" || note.length === 0) return null;
  for (const rawLine of note.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.toLowerCase().startsWith(NEXT_CHECKPOINT_PREFIX.toLowerCase())) continue;
    const text = line.slice(NEXT_CHECKPOINT_PREFIX.length).trim();
    return text.length > 0 ? text : null;
  }
  return null;
}

/** True when the note already carries a done/dismissed clear marker. */
export function isCheckpointClearedInNote(note: string | null | undefined): boolean {
  if (typeof note !== "string" || note.length === 0) return false;
  for (const rawLine of note.split(/\r?\n/)) {
    const line = rawLine.trim().toLowerCase();
    if (line === CHECKPOINT_STATUS_DONE.toLowerCase()) return true;
    if (line === CHECKPOINT_STATUS_DISMISSED.toLowerCase()) return true;
  }
  return false;
}

export function checkpointClearMarkerLine(status: CheckpointClearStatus): string {
  return status === "done" ? CHECKPOINT_STATUS_DONE : CHECKPOINT_STATUS_DISMISSED;
}

/**
 * Append a durable clear marker to a note body (idempotent if already cleared).
 * Does not invent other content.
 */
export function appendCheckpointClearMarker(
  note: string | null | undefined,
  status: CheckpointClearStatus,
): string {
  const base = typeof note === "string" ? note.replace(/\s+$/, "") : "";
  if (isCheckpointClearedInNote(base)) return base;
  const marker = checkpointClearMarkerLine(status);
  return base.length > 0 ? `${base}\n${marker}` : marker;
}

/**
 * Latest plant diary entry (by occurred_at / entry_at / created_at) with a
 * non-empty parsed checkpoint that has not been cleared.
 */
export function derivePendingCheckpoint(input: {
  readonly entries: readonly VisitCheckpointDiaryEntry[] | null | undefined;
}): PendingVisitCheckpoint | null {
  const entries = input.entries;
  if (!Array.isArray(entries) || entries.length === 0) return null;

  const sorted = [...entries].sort((a, b) => {
    const ka = entrySortKey(a);
    const kb = entrySortKey(b);
    if (ka === kb) return 0;
    // ISO timestamps sort lexicographically; missing keys sort last.
    if (!ka) return 1;
    if (!kb) return -1;
    return ka < kb ? 1 : -1;
  });

  for (const entry of sorted) {
    const id = nonBlank(entry.id);
    if (!id) continue;
    const note = typeof entry.note === "string" ? entry.note : "";
    if (isCheckpointClearedInNote(note)) continue;
    const text = parseNextCheckpointFromNote(note);
    if (!text) continue;
    return {
      text,
      setAt: nonBlank(entrySortKey(entry)),
      diaryEntryId: id,
    };
  }
  return null;
}

/** Prefill note hint for same-angle Quick Log open (hint only; grower saves). */
export function buildCheckpointFollowUpNotePrefill(checkpointText: string): string {
  const text = checkpointText.trim();
  if (!text) return "";
  return `Follow-up: ${text}`;
}
