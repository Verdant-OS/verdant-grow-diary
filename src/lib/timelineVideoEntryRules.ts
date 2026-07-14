/**
 * timelineVideoEntryRules — pure view-model helpers for surfacing video
 * attachments on the timeline.
 *
 * Contract:
 *  - A "video entry" is one whose `details.video.path` is a non-empty string.
 *  - If an entry has BOTH `photo_url` and `details.video`, the photo wins
 *    and a `photo_over_video_conflict` warning is flagged. Never render both.
 *  - Video entries are NEVER photo evidence and NEVER live sensor data.
 */

export interface TimelineVideoSlot {
  path: string;
  mime: string;
  sizeBytes: number;
  durationS: number;
  posterPath: string | null;
}

export interface TimelineVideoResolution {
  showVideo: boolean;
  showPhoto: boolean;
  video: TimelineVideoSlot | null;
  warnings: readonly string[];
}

export interface TimelineVideoInput {
  photoUrl?: string | null;
  details?: unknown;
}

function readString(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function readNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

export function extractTimelineVideoSlot(
  details: unknown,
): TimelineVideoSlot | null {
  if (!details || typeof details !== "object") return null;
  const video = (details as Record<string, unknown>).video;
  if (!video || typeof video !== "object") return null;
  const v = video as Record<string, unknown>;
  const path = readString(v.path);
  if (!path) return null;
  const mime = readString(v.mime) ?? "";
  const size = readNumber(v.size_bytes) ?? 0;
  const duration = readNumber(v.duration_s) ?? 0;
  const poster = readString(v.poster_path);
  return { path, mime, sizeBytes: size, durationS: duration, posterPath: poster };
}

export function resolveTimelineVideoEntry(
  input: TimelineVideoInput,
): TimelineVideoResolution {
  const video = extractTimelineVideoSlot(input.details ?? null);
  const hasPhoto = readString(input.photoUrl ?? null) !== null;
  if (video && hasPhoto) {
    return {
      showVideo: false,
      showPhoto: true,
      video: null,
      warnings: ["photo_over_video_conflict"],
    };
  }
  if (video) {
    return { showVideo: true, showPhoto: false, video, warnings: [] };
  }
  return { showVideo: false, showPhoto: hasPhoto, video: null, warnings: [] };
}
