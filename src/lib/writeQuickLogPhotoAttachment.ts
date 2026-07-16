/**
 * writeQuickLogPhotoAttachment — the sanctioned write path for the Quick Log
 * v2 companion photo diary entry.
 *
 * Quick Log v2 saves the log itself through the `quicklog_save_manual` RPC
 * (useQuickLogV2Save). That RPC has no photo parameter, and the alternative
 * `quicklog_save_event` RPC stores `photo_url` inside the details jsonb
 * rather than in the `diary_entries.photo_url` column this entry relies on.
 * Until an RPC accepts this exact shape, the companion entry is written to
 * `diary_entries` here — never inline in a component. Static-safety tests
 * assert the sheet contains no direct table writes.
 *
 * Rules:
 *   - Row ownership stays with RLS: the writer never sets the owner column;
 *     the table default derives it from the auth context.
 *   - Only a `diary_entries` insert. No updates/deletes/upserts, no other
 *     tables, no RPCs, no edge functions.
 *   - No alerts, Action Queue rows, or model sessions.
 *   - The client is injectable so tests can stub the boundary without a
 *     network layer.
 *
 * Contract (kept in lockstep with QuickLogV2Sheet expectations):
 *   - A blank note falls back to "Photo attached from Quick Log."
 *   - `entry_at` is stamped at write time (ISO-8601).
 *   - `details.event_type` is "quicklog_photo_attachment".
 *   - Failures come back as `{ ok: false, message }` — never thrown — so a
 *     failed companion entry surfaces inline without crashing the save flow.
 */

import { supabase as defaultSupabase } from "@/integrations/supabase/client";

export const QUICK_LOG_PHOTO_ATTACHMENT_EVENT_TYPE = "quicklog_photo_attachment";
export const QUICK_LOG_PHOTO_ATTACHMENT_NOTE_FALLBACK = "Photo attached from Quick Log.";

export interface QuickLogPhotoAttachmentInput {
  growId: string;
  tentId?: string | null;
  plantId?: string | null;
  /** Storage path returned by the diary-photos upload. */
  photoPath: string;
  /** Raw note text from the sheet; blank falls back to the standard copy. */
  note?: string | null;
  /** The Quick Log action this photo rides along with (e.g. "water", "note"). */
  attachedToAction: string;
}

export interface QuickLogPhotoAttachmentRow {
  grow_id: string;
  tent_id: string | null;
  plant_id: string | null;
  note: string;
  photo_url: string;
  entry_at: string;
  details: {
    event_type: typeof QUICK_LOG_PHOTO_ATTACHMENT_EVENT_TYPE;
    source: "manual";
    attached_to_action: string;
  };
}

// Minimal client surface we depend on, so tests can inject a stub without
// dragging the full Supabase generic in.
export interface PhotoAttachmentDiaryClient {
  from: (table: "diary_entries") => {
    insert: (
      row: QuickLogPhotoAttachmentRow,
    ) => PromiseLike<{ error: { message?: string } | null }>;
  };
}

export type WriteQuickLogPhotoAttachmentResult = { ok: true } | { ok: false; message: string };

function trimmed(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Pure row builder. Validation runs before any I/O; the DB remains the
 * final authority via RLS.
 */
export function buildQuickLogPhotoAttachmentRow(
  input: QuickLogPhotoAttachmentInput,
  entryAt: string,
): { ok: true; row: QuickLogPhotoAttachmentRow } | { ok: false; message: string } {
  const growId = trimmed(input.growId);
  if (!growId) {
    return { ok: false, message: "Photo diary entry failed: missing grow context." };
  }
  const photoPath = trimmed(input.photoPath);
  if (!photoPath) {
    return { ok: false, message: "Photo diary entry failed: missing photo path." };
  }
  const note = trimmed(input.note) || QUICK_LOG_PHOTO_ATTACHMENT_NOTE_FALLBACK;
  return {
    ok: true,
    row: {
      grow_id: growId,
      tent_id: input.tentId ?? null,
      plant_id: input.plantId ?? null,
      note,
      photo_url: photoPath,
      entry_at: entryAt,
      details: {
        event_type: QUICK_LOG_PHOTO_ATTACHMENT_EVENT_TYPE,
        source: "manual",
        attached_to_action: input.attachedToAction,
      },
    },
  };
}

export interface WriteQuickLogPhotoAttachmentOptions {
  /** Optional injectable client for tests. Defaults to the app's Supabase
   * authenticated client. */
  client?: PhotoAttachmentDiaryClient;
}

export async function writeQuickLogPhotoAttachment(
  input: QuickLogPhotoAttachmentInput,
  options: WriteQuickLogPhotoAttachmentOptions = {},
): Promise<WriteQuickLogPhotoAttachmentResult> {
  const built = buildQuickLogPhotoAttachmentRow(input, new Date().toISOString());
  if (built.ok !== true) {
    return { ok: false, message: built.message };
  }

  const client: PhotoAttachmentDiaryClient =
    options.client ?? (defaultSupabase as unknown as PhotoAttachmentDiaryClient);

  let response: { error: { message?: string } | null };
  try {
    response = await client.from("diary_entries").insert(built.row);
  } catch {
    return { ok: false, message: "Photo diary entry failed: unexpected error." };
  }

  if (response.error) {
    return {
      ok: false,
      message: `Photo diary entry failed: ${response.error.message}`,
    };
  }
  return { ok: true };
}
