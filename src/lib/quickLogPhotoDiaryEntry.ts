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
  /** Authenticated owner used only to reconcile a lost insert response. */
  ownerId: string;
  growId: string;
  tentId: string | null;
  plantId: string | null;
  photoPath: string;
  /** Raw note text from the form (untrimmed). */
  noteRaw: string;
  /** The Quick Log action the photo was attached to (e.g. "water"). */
  action: string;
  /**
   * Optional sanitized structured detail (e.g. photo subject/caption from the
   * Quick Log activity spec). Merged into details; the fixed identity keys
   * (event_type/source/attached_to_action) always win.
   */
  extraDetails?: Readonly<Record<string, string>> | null;
  /**
   * Diary event type. Defaults to the attachment marker
   * "quicklog_photo_attachment" (the V2-sheet contract plant-memory episodes
   * key on). The STANDALONE Photo activity passes "photo" so the read layers
   * (normalizeDiaryEntry allow-list, Timeline classification) badge the row as
   * a Photo instead of falling back to Note/Observation.
   */
  eventType?: "quicklog_photo_attachment" | "photo";
  /** Injectable clock for deterministic tests. Defaults to `new Date()`. */
  now?: () => Date;
  /**
   * Optional preallocated UUID for the row. Supplying it is useful when a
   * caller owns an operation boundary; otherwise this helper allocates one
   * before the insert so a lost response can be reconciled exactly.
   */
  entryId?: string;
}

export interface QuickLogPhotoDiaryEntryRow {
  grow_id: string;
  tent_id: string | null;
  plant_id: string | null;
  note: string;
  photo_url: string;
  entry_at: string;
  details: {
    event_type: "quicklog_photo_attachment" | "photo";
    source: "manual";
    attached_to_action: string;
  } & Record<string, string>;
}

export const QUICK_LOG_PHOTO_DIARY_DEFAULT_NOTE = "Photo attached from Quick Log." as const;

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
      // Caller-supplied structured detail first; fixed identity keys win so
      // no extraDetails key can spoof the attachment envelope.
      ...(input.extraDetails ?? {}),
      event_type: input.eventType ?? "quicklog_photo_attachment",
      source: "manual",
      attached_to_action: input.action,
    },
  };
}

export type QuickLogPhotoDiaryEntryResult =
  { ok: true } | { ok: false; message: string; ambiguous?: boolean };

const UNCERTAIN_PHOTO_ATTACHMENT_MESSAGE =
  "Could not confirm the photo attachment; it may still appear in history.";

function resolvePhotoDiaryEntryId(input: QuickLogPhotoDiaryEntryInput): string | null {
  if (typeof input.entryId === "string" && input.entryId.trim() !== "") return input.entryId;
  const crypto = globalThis.crypto;
  if (!crypto || typeof crypto.randomUUID !== "function") return null;
  return crypto.randomUUID();
}

function isDefinitiveNonCommitError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  // A structured database/PostgREST code proves the server returned a
  // terminal rejection. A unique collision is deliberately excluded: it may
  // be a replay of this exact preallocated ID and needs reconciliation first.
  return typeof code === "string" && code.trim() !== "" && code !== "23505";
}

async function reconcileExactOwnerPhotoDiaryEntry(
  ownerId: string,
  entryId: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("diary_entries")
      .select("id")
      .eq("id", entryId)
      .eq("user_id", ownerId)
      .maybeSingle();
    return !error && data?.id === entryId;
  } catch {
    return false;
  }
}

/**
 * Thin wrapper around the extracted `diary_entries.insert`. The caller
 * remains responsible for the synchronous in-flight guard (component
 * ref) so we don't introduce hidden module-level singletons.
 */
export async function createQuickLogPhotoDiaryEntry(
  input: QuickLogPhotoDiaryEntryInput,
): Promise<QuickLogPhotoDiaryEntryResult> {
  const entryId = resolvePhotoDiaryEntryId(input);
  if (!entryId) {
    return { ok: false, message: "Photo diary entry could not be prepared." };
  }
  const row = { ...buildQuickLogPhotoDiaryEntryRow(input), id: entryId };
  try {
    const { error } = await supabase.from("diary_entries").insert(row as never);
    if (error) {
      if (await reconcileExactOwnerPhotoDiaryEntry(input.ownerId, entryId)) {
        return { ok: true };
      }
      if (!isDefinitiveNonCommitError(error)) {
        return {
          ok: false,
          ambiguous: true,
          message: UNCERTAIN_PHOTO_ATTACHMENT_MESSAGE,
        };
      }
      return { ok: false, message: `Photo diary entry failed: ${error.message}` };
    }
    return { ok: true };
  } catch {
    // A rejected request may have committed before its response was lost. The
    // client supplied this exact UUID, so only an owner-scoped lookup for that
    // row can prove the attachment exists. Any other outcome stays uncertain
    // and callers must retain the uploaded object rather than deleting it.
    if (await reconcileExactOwnerPhotoDiaryEntry(input.ownerId, entryId)) return { ok: true };
    return {
      ok: false,
      ambiguous: true,
      message: UNCERTAIN_PHOTO_ATTACHMENT_MESSAGE,
    };
  }
}
