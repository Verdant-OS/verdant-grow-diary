/**
 * quickLogVideoDiaryEntry — pure payload builder + thin insert wrapper
 * for attaching a video to a Quick Log diary entry.
 *
 * Contract:
 *  - `photo_url` is ALWAYS null. Videos never populate the photo column.
 *  - Video metadata lives in `details.video`.
 *  - `details.event_type = "quicklog_video_attachment"`.
 *  - `details.source = "manual"`.
 *  - Insert wrapper writes only to `diary_entries`. No service_role,
 *    no sensor tables, no Action Queue, no AI.
 */
import { supabase } from "@/integrations/supabase/client";

export interface QuickLogVideoDiaryEntryInput {
  growId: string;
  tentId: string | null;
  plantId: string | null;
  /** Storage path inside the `diary-videos` bucket. */
  videoPath: string;
  mime: string;
  sizeBytes: number;
  durationS: number;
  noteRaw: string;
  action: string;
  now?: () => Date;
}

export interface QuickLogVideoDiaryEntryRow {
  grow_id: string;
  tent_id: string | null;
  plant_id: string | null;
  note: string;
  photo_url: null;
  entry_at: string;
  details: {
    event_type: "quicklog_video_attachment";
    source: "manual";
    attached_to_action: string;
    video: {
      path: string;
      mime: string;
      size_bytes: number;
      duration_s: number;
      poster_path: null;
    };
  };
}

export const QUICK_LOG_VIDEO_DIARY_DEFAULT_NOTE =
  "Video attached from Quick Log." as const;

export function buildQuickLogVideoDiaryEntryRow(
  input: QuickLogVideoDiaryEntryInput,
): QuickLogVideoDiaryEntryRow {
  const trimmed = (input.noteRaw ?? "").trim();
  const note = trimmed === "" ? QUICK_LOG_VIDEO_DIARY_DEFAULT_NOTE : trimmed;
  const now = input.now ? input.now() : new Date();
  return {
    grow_id: input.growId,
    tent_id: input.tentId,
    plant_id: input.plantId,
    note,
    photo_url: null,
    entry_at: now.toISOString(),
    details: {
      event_type: "quicklog_video_attachment",
      source: "manual",
      attached_to_action: input.action,
      video: {
        path: input.videoPath,
        mime: input.mime,
        size_bytes: input.sizeBytes,
        duration_s: input.durationS,
        poster_path: null,
      },
    },
  };
}

export type QuickLogVideoDiaryEntryResult =
  | { ok: true }
  | { ok: false; message: string };

export async function createQuickLogVideoDiaryEntry(
  input: QuickLogVideoDiaryEntryInput,
): Promise<QuickLogVideoDiaryEntryResult> {
  const row = buildQuickLogVideoDiaryEntryRow(input);
  const { error } = await supabase
    .from("diary_entries")
    .insert(row as never);
  if (error) {
    return { ok: false, message: `Video diary entry failed: ${error.message}` };
  }
  return { ok: true };
}
