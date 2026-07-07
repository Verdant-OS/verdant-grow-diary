/**
 * quickLogPhotoDiaryEntry — extracted photo-diary write helper for
 * QuickLog v2.
 *
 * Split into two exports:
 *   1. `buildQuickLogPhotoDiaryEntryRow` — PURE payload builder. No I/O,
 *      no Supabase, no React, no time (caller injects `now`).
 *   2. `createQuickLogPhotoDiaryEntry` — thin write wrapper around the
 *      one existing `diary_entries` insert previously inlined in
 *      `QuickLogV2Sheet.tsx`. Behavior preserved verbatim.
 *
 * Safety:
 *   - Does NOT broaden writes. Same table, same row shape.
 *   - Does NOT alter schema / RLS / auth / edge functions.
 *   - Does NOT touch Action Queue / AI / alerts / device control.
 *   - The synchronous in-flight guard remains OWNED BY THE CALLER (a
 *     component-level `useRef`) so this helper stays pure/reusable and
 *     does not smuggle module-level singleton state.
 */
import { supabase } from "@/integrations/supabase/client";

export interface QuickLogPhotoDiaryEntryInput {
  growId: string;
  tentId: string | null;
  plantId: string | null;
  photoPath: string;
  /** Raw note text from the form (untrimmed). */
  noteRaw: string;
  /** The Quick Log action the photo was attached to (e.g. "water"). */
  action: string;
  /** Injectable clock for deterministic tests. Defaults to `new Date()`. */
  now?: () => Date;
}

export interface QuickLogPhotoDiaryEntryRow {
  grow_id: string;
  tent_id: string | null;
  plant_id: string | null;
  note: string;
  photo_url: string;
  entry_at: string;
  details: {
    event_type: "quicklog_photo_attachment";
    source: "manual";
    attached_to_action: string;
  };
}

export const QUICK_LOG_PHOTO_DIARY_DEFAULT_NOTE =
  "Photo attached from Quick Log." as const;

/**
 * Deterministic pure builder. Returns the exact row shape passed to
 * `diary_entries.insert(...)` — identical to the historical inline code.
 */
export function buildQuickLogPhotoDiaryEntryRow(
  input: QuickLogPhotoDiaryEntryInput,
): QuickLogPhotoDiaryEntryRow {
  const trimmed = (input.noteRaw ?? "").trim();
  const note = trimmed === "" ? QUICK_LOG_PHOTO_DIARY_DEFAULT_NOTE : trimmed;
  const now = input.now ? input.now() : new Date();
  return {
    grow_id: input.growId,
    tent_id: input.tentId,
    plant_id: input.plantId,
    note,
    photo_url: input.photoPath,
    entry_at: now.toISOString(),
    details: {
      event_type: "quicklog_photo_attachment",
      source: "manual",
      attached_to_action: input.action,
    },
  };
}

export type QuickLogPhotoDiaryEntryResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Thin wrapper around the extracted `diary_entries.insert`. The caller
 * remains responsible for the synchronous in-flight guard (component
 * ref) so we don't introduce hidden module-level singletons.
 */
export async function createQuickLogPhotoDiaryEntry(
  input: QuickLogPhotoDiaryEntryInput,
): Promise<QuickLogPhotoDiaryEntryResult> {
  const row = buildQuickLogPhotoDiaryEntryRow(input);
  const { error } = await supabase
    .from("diary_entries")
    .insert(row as never);
  if (error) {
    return { ok: false, message: `Photo diary entry failed: ${error.message}` };
  }
  return { ok: true };
}
