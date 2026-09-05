/**
 * Visit Checkpoint Resurface V0 — parse Guided Walk "Next checkpoint:" lines
 * from durable Quick Log notes and decide whether to show a calm, read-only cue.
 *
 * Pure: no React, no Supabase, no Action Queue, no device control.
 * Reuses the label written by composeGrowWalkCloseoutNote / GROW_WALK_FOLLOW_UP_OPTIONS.
 */

import { GROW_WALK_FOLLOW_UP_OPTIONS, composeGrowWalkCloseoutNote } from "@/lib/growWalkContracts";

/** Exact label prefix composed into durable notes today. */
export const VISIT_CHECKPOINT_NOTE_LABEL = "Next checkpoint:" as const;

/** Lookback for resurfacing a recent checkpoint cue (covers 24h + 72h options). */
export const VISIT_CHECKPOINT_RESURFACE_MAX_AGE_HOURS = 96;

const HOUR_MS = 60 * 60 * 1000;

/** Known follow-up values from Guided Walk closeout — not an exclusive allowlist. */
export const VISIT_CHECKPOINT_KNOWN_OPTIONS = GROW_WALK_FOLLOW_UP_OPTIONS;

export interface VisitCheckpointNoteInput {
  readonly id?: string | null;
  readonly note: string | null | undefined;
  readonly occurredAt: string | null | undefined;
}

export interface VisitCheckpointResurfaceCue {
  readonly show: true;
  readonly checkpointLabel: string;
  readonly entryId: string | null;
  readonly occurredAt: string;
  readonly headline: string;
  readonly body: string;
  readonly ariaLabel: string;
}

export interface VisitCheckpointResurfaceHidden {
  readonly show: false;
  readonly reason: "no_notes" | "no_checkpoint" | "expired" | "invalid_now" | "invalid_timestamp";
}

export type VisitCheckpointResurfaceResult =
  VisitCheckpointResurfaceCue | VisitCheckpointResurfaceHidden;

const CUE_COPY = {
  headline: "Next checkpoint",
  bodyPrefix: "From a recent Guided Walk note:",
  ariaLabel: "Next checkpoint from a recent Guided Walk note",
} as const;

/**
 * Parse the first `Next checkpoint: …` line from a note body.
 * Matches the line shape written by composeGrowWalkCloseoutNote.
 * Returns null when the label is absent or the value is empty.
 */
export function parseNextCheckpointFromNote(note: string | null | undefined): string | null {
  if (typeof note !== "string" || note.length === 0) return null;
  const lines = note.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.toLowerCase().startsWith(VISIT_CHECKPOINT_NOTE_LABEL.toLowerCase())) {
      continue;
    }
    const value = line.slice(VISIT_CHECKPOINT_NOTE_LABEL.length).trim();
    if (!value) return null;
    return value;
  }
  return null;
}

function parseTime(iso: string | null | undefined): number | null {
  if (!iso || typeof iso !== "string") return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function hidden(reason: VisitCheckpointResurfaceHidden["reason"]): VisitCheckpointResurfaceHidden {
  return { show: false, reason };
}

/**
 * Among recent notes, pick the newest with a parseable Next checkpoint still
 * within the resurface window. Read-only decision — never enqueues actions.
 */
export function selectVisitCheckpointResurface(input: {
  readonly notes: readonly VisitCheckpointNoteInput[] | null | undefined;
  readonly now: number;
  readonly maxAgeHours?: number;
}): VisitCheckpointResurfaceResult {
  if (typeof input.now !== "number" || !Number.isFinite(input.now)) {
    return hidden("invalid_now");
  }

  const maxAgeHours =
    typeof input.maxAgeHours === "number" && Number.isFinite(input.maxAgeHours)
      ? Math.max(1, input.maxAgeHours)
      : VISIT_CHECKPOINT_RESURFACE_MAX_AGE_HOURS;

  const notes = input.notes ?? [];
  if (notes.length === 0) return hidden("no_notes");

  const ranked = notes
    .map((row, sourceIndex) => ({
      row,
      at: parseTime(row.occurredAt),
      checkpoint: parseNextCheckpointFromNote(row.note),
      sourceIndex,
    }))
    .filter(
      (
        item,
      ): item is {
        row: VisitCheckpointNoteInput;
        at: number;
        checkpoint: string;
        sourceIndex: number;
      } => item.at !== null && item.checkpoint !== null,
    )
    .sort((a, b) => {
      if (a.at !== b.at) return b.at - a.at;
      const idDelta = (a.row.id ?? "").localeCompare(b.row.id ?? "");
      return idDelta !== 0 ? idDelta : a.sourceIndex - b.sourceIndex;
    });

  if (ranked.length === 0) return hidden("no_checkpoint");

  const newest = ranked[0];
  const ageHours = (input.now - newest.at) / HOUR_MS;
  if (ageHours > maxAgeHours) return hidden("expired");
  if (ageHours < 0) return hidden("invalid_timestamp");

  return {
    show: true,
    checkpointLabel: newest.checkpoint,
    entryId: newest.row.id ?? null,
    occurredAt: newest.row.occurredAt as string,
    headline: CUE_COPY.headline,
    body: `${CUE_COPY.bodyPrefix} ${newest.checkpoint}.`,
    ariaLabel: CUE_COPY.ariaLabel,
  };
}

/** Test/helper: compose then parse round-trip for a known follow-up option. */
export function composeThenParseCheckpoint(
  nextCheckpoint: (typeof GROW_WALK_FOLLOW_UP_OPTIONS)[number],
): string | null {
  const note = composeGrowWalkCloseoutNote({
    observation: "Canopy look",
    nextCheckpoint,
  });
  return parseNextCheckpointFromNote(note);
}
