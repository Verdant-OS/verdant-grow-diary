/**
 * videoAttachmentRules — pure validation helpers for Quick Log video
 * attachments.
 *
 * No I/O, no Supabase, no React. Deterministic where possible; the
 * duration probe delegates to a caller-injected async prober so tests
 * can drive it without a real browser.
 *
 * Safety:
 *  - No writes.
 *  - No AI, alerts, Action Queue, or device control.
 *  - Never sets photo_url. Never touches sensor tables.
 */

export const VIDEO_MAX_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
export const VIDEO_MAX_DURATION_S = 60;
export const ALLOWED_VIDEO_MIME_TYPES: readonly string[] = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
];

export type VideoAttachmentRejectionReason =
  | "empty"
  | "mime_not_allowed"
  | "size_exceeded"
  | "duration_exceeded"
  | "unreadable";

export interface VideoAttachmentMetadataOk {
  ok: true;
  mime: string;
  sizeBytes: number;
  durationS: number;
}

export interface VideoAttachmentMetadataError {
  ok: false;
  reason: VideoAttachmentRejectionReason;
  message: string;
}

export type VideoAttachmentMetadata =
  | VideoAttachmentMetadataOk
  | VideoAttachmentMetadataError;

export function isAllowedVideoMime(mime: string | null | undefined): boolean {
  if (!mime) return false;
  return ALLOWED_VIDEO_MIME_TYPES.includes(mime.toLowerCase());
}

export function isWithinVideoSizeCap(bytes: number | null | undefined): boolean {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) return false;
  return bytes <= VIDEO_MAX_SIZE_BYTES;
}

export function isWithinVideoDurationCap(
  durationS: number | null | undefined,
): boolean {
  if (typeof durationS !== "number" || !Number.isFinite(durationS) || durationS <= 0) {
    return false;
  }
  return durationS <= VIDEO_MAX_DURATION_S;
}

export function rejectionMessage(reason: VideoAttachmentRejectionReason): string {
  switch (reason) {
    case "empty":
      return "No video selected.";
    case "mime_not_allowed":
      return "Unsupported video type. Use MP4, MOV, or WebM.";
    case "size_exceeded":
      return "Video is larger than 100 MB.";
    case "duration_exceeded":
      return "Video is longer than 60 seconds.";
    case "unreadable":
      return "That video could not be read. Try a different file.";
  }
}

export interface VideoLike {
  name?: string;
  type?: string;
  size?: number;
}

/**
 * Pure synchronous pre-check that runs before we probe duration. Returns
 * `ok: true` if the file passes mime + size + non-empty checks.
 */
export function precheckVideoAttachment(
  file: VideoLike | null | undefined,
): { ok: true } | { ok: false; reason: VideoAttachmentRejectionReason; message: string } {
  if (!file || typeof file.size !== "number" || file.size <= 0) {
    return { ok: false, reason: "empty", message: rejectionMessage("empty") };
  }
  if (!isAllowedVideoMime(file.type ?? null)) {
    return {
      ok: false,
      reason: "mime_not_allowed",
      message: rejectionMessage("mime_not_allowed"),
    };
  }
  if (!isWithinVideoSizeCap(file.size)) {
    return {
      ok: false,
      reason: "size_exceeded",
      message: rejectionMessage("size_exceeded"),
    };
  }
  return { ok: true };
}

export type VideoDurationProber = (
  file: Blob,
) => Promise<{ ok: true; durationS: number } | { ok: false }>;

/**
 * Full validation: pre-check + duration probe.
 */
export async function validateVideoAttachment(
  file: (VideoLike & Blob) | null | undefined,
  probe: VideoDurationProber,
): Promise<VideoAttachmentMetadata> {
  const pre = precheckVideoAttachment(file ?? null);
  if (pre.ok === false) return pre;
  let probed: Awaited<ReturnType<VideoDurationProber>>;
  try {
    probed = await probe(file as Blob);
  } catch {
    return {
      ok: false,
      reason: "unreadable",
      message: rejectionMessage("unreadable"),
    };
  }
  if (!probed.ok) {
    return {
      ok: false,
      reason: "unreadable",
      message: rejectionMessage("unreadable"),
    };
  }
  if (!isWithinVideoDurationCap(probed.durationS)) {
    return {
      ok: false,
      reason: "duration_exceeded",
      message: rejectionMessage("duration_exceeded"),
    };
  }
  return {
    ok: true,
    mime: (file!.type ?? "").toLowerCase(),
    sizeBytes: file!.size!,
    durationS: probed.durationS,
  };
}

/**
 * Browser-default duration prober. Loads video metadata via an offscreen
 * <video> element. Falls back to `{ ok: false }` on any error.
 */
export function createBrowserVideoDurationProber(): VideoDurationProber {
  return (file: Blob) =>
    new Promise((resolve) => {
      if (typeof document === "undefined") return resolve({ ok: false });
      const url = URL.createObjectURL(file);
      const el = document.createElement("video");
      el.preload = "metadata";
      const cleanup = () => {
        URL.revokeObjectURL(url);
        el.removeAttribute("src");
        el.load();
      };
      el.onloadedmetadata = () => {
        const d = el.duration;
        cleanup();
        if (typeof d === "number" && Number.isFinite(d) && d > 0) {
          resolve({ ok: true, durationS: d });
        } else {
          resolve({ ok: false });
        }
      };
      el.onerror = () => {
        cleanup();
        resolve({ ok: false });
      };
      el.src = url;
    });
}
