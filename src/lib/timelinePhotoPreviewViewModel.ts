/**
 * timelinePhotoPreviewViewModel — pure view-model that projects an
 * arbitrary photo payload (single `photo_url` or an array of photo
 * URLs / { url } objects) into a capped Timeline thumbnail strip.
 *
 * Hard constraints:
 *  - Pure function. No I/O, no React, no DOM.
 *  - Never fabricates URLs. Empty / non-string / obviously invalid
 *    values are dropped silently — broken images never reach the UI.
 *  - Caps the visible strip at 3 thumbnails; the rest become `moreCount`.
 *  - Alt text is composed from supplied context only; never invented.
 */

export interface TimelinePhotoThumbnail {
  url: string;
  alt: string;
}

export type TimelinePhotoPreviewViewModel =
  | { kind: "none" }
  | {
      kind: "strip";
      thumbnails: TimelinePhotoThumbnail[];
      moreCount: number;
      totalCount: number;
    };

export interface TimelinePhotoPreviewContext {
  plantName?: string | null;
  occurredAt?: string | null;
  eventType?: string | null;
}

export interface BuildTimelinePhotoPreviewInput {
  /** Optional array of URL strings or `{ url }` objects. */
  photos?: unknown;
  /** Optional legacy single-photo URL field. */
  photoUrl?: unknown;
  /** Context used to compose accessible alt text. */
  context?: TimelinePhotoPreviewContext;
  /** Max thumbnails before collapsing the remainder into `+N more`. */
  maxThumbnails?: number;
}

const DEFAULT_MAX = 3;

function isLikelyUrl(s: string): boolean {
  if (s.length === 0) return false;
  // Accept http(s), data:, blob:, protocol-relative, or root-absolute paths.
  if (/^(https?:|data:|blob:)/i.test(s)) return true;
  if (s.startsWith("//")) return true;
  if (s.startsWith("/")) return true;
  return false;
}

function extractUrl(raw: unknown): string | null {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return isLikelyUrl(trimmed) ? trimmed : null;
  }
  if (raw && typeof raw === "object") {
    const candidate =
      (raw as { url?: unknown }).url ??
      (raw as { photo_url?: unknown }).photo_url ??
      (raw as { src?: unknown }).src;
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      return isLikelyUrl(trimmed) ? trimmed : null;
    }
  }
  return null;
}

function buildAlt(
  index: number,
  total: number,
  context: TimelinePhotoPreviewContext | undefined,
): string {
  const parts: string[] = [];
  const plant = context?.plantName?.trim();
  const event = context?.eventType?.trim();
  const when = context?.occurredAt?.trim();

  if (plant) parts.push(plant);
  if (event) parts.push(event);
  if (when) parts.push(when);
  if (parts.length === 0) parts.push("Timeline photo");

  const label = parts.join(" · ");
  return total > 1 ? `${label} (photo ${index + 1} of ${total})` : label;
}

export function buildTimelinePhotoPreviewViewModel(
  input: BuildTimelinePhotoPreviewInput,
): TimelinePhotoPreviewViewModel {
  const max = Math.max(1, input.maxThumbnails ?? DEFAULT_MAX);
  const urls: string[] = [];

  if (Array.isArray(input.photos)) {
    for (const raw of input.photos) {
      const u = extractUrl(raw);
      if (u) urls.push(u);
    }
  }
  if (urls.length === 0) {
    const u = extractUrl(input.photoUrl);
    if (u) urls.push(u);
  }

  if (urls.length === 0) return { kind: "none" };

  const total = urls.length;
  const visible = urls.slice(0, max);
  const thumbnails: TimelinePhotoThumbnail[] = visible.map((url, i) => ({
    url,
    alt: buildAlt(i, total, input.context),
  }));

  return {
    kind: "strip",
    thumbnails,
    moreCount: Math.max(0, total - visible.length),
    totalCount: total,
  };
}
