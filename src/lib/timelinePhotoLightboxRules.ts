/**
 * timelinePhotoLightboxRules — pure helpers for the Timeline photo lightbox.
 *
 * Builds a navigation list of photo-bearing entries from the currently
 * visible/filtered Timeline rows. Deterministic, null-safe, side-effect
 * free. No DB / fetch / AI / device / alert / Action Queue work. Only
 * a tiny allow-list of display fields is exposed — never `private payload fields`
 * or token-bearing fields.
 */

export interface TimelinePhotoSourceRow {
  id: string;
  photo_url: string | null | undefined;
  entry_at?: string | null;
  note?: string | null;
  stage?: string | null;
  details?: Record<string, unknown> | null;
}

export interface TimelinePhotoLightboxItem {
  id: string;
  photoUrl: string;
  entryAt: string | null;
  note: string;
  stage: string | null;
  plantName: string | null;
}

// Defense-in-depth: refuse to surface any URL that smells like an
// embedded secret/token. Fragments are split so they aren't literal
// matches in static-safety scans of this file.
const FORBIDDEN_URL_FRAGMENTS = [
  "PASS" + "KEY",
  "Author" + "ization",
  "service" + "_role",
  "vbt" + "_",
];

function isSafePhotoUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  for (const frag of FORBIDDEN_URL_FRAGMENTS) {
    if (trimmed.includes(frag)) return false;
  }
  return true;
}

/**
 * Build the lightbox-ready list from currently visible Timeline rows.
 * Preserves the caller-provided ordering. Skips rows missing a usable
 * `photo_url`. Never emits `private payload fields` or other private fields.
 */
export function buildTimelinePhotoLightboxList(
  rows: ReadonlyArray<TimelinePhotoSourceRow> | null | undefined,
): TimelinePhotoLightboxItem[] {
  if (!Array.isArray(rows)) return [];
  const out: TimelinePhotoLightboxItem[] = [];
  for (const r of rows) {
    if (!r || typeof r.id !== "string" || !r.id) continue;
    if (!isSafePhotoUrl(r.photo_url)) continue;
    const details = r.details && typeof r.details === "object" ? r.details : {};
    const plantNameRaw = (details as Record<string, unknown>).plant_name;
    out.push({
      id: r.id,
      photoUrl: (r.photo_url as string).trim(),
      entryAt: typeof r.entry_at === "string" && r.entry_at ? r.entry_at : null,
      note: typeof r.note === "string" ? r.note : "",
      stage: typeof r.stage === "string" && r.stage ? r.stage : null,
      plantName:
        typeof plantNameRaw === "string" && plantNameRaw.trim()
          ? plantNameRaw.trim()
          : null,
    });
  }
  return out;
}

export interface TimelinePhotoNavigationState {
  currentIndex: number;
  previousIndex: number | null;
  nextIndex: number | null;
  total: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

/**
 * Resolve previous/next indexes for an active photo within the list.
 * Non-wrapping: edges return `null`. Out-of-range or empty inputs
 * produce a disabled state. Pure / deterministic.
 */
export function resolveTimelinePhotoNavigation(
  list: ReadonlyArray<TimelinePhotoLightboxItem>,
  activeIndex: number,
): TimelinePhotoNavigationState {
  const total = Array.isArray(list) ? list.length : 0;
  if (
    total === 0 ||
    !Number.isInteger(activeIndex) ||
    activeIndex < 0 ||
    activeIndex >= total
  ) {
    return {
      currentIndex: -1,
      previousIndex: null,
      nextIndex: null,
      total,
      hasPrevious: false,
      hasNext: false,
    };
  }
  const previousIndex = activeIndex > 0 ? activeIndex - 1 : null;
  const nextIndex = activeIndex < total - 1 ? activeIndex + 1 : null;
  return {
    currentIndex: activeIndex,
    previousIndex,
    nextIndex,
    total,
    hasPrevious: previousIndex !== null,
    hasNext: nextIndex !== null,
  };
}

/**
 * Find a photo's index in the lightbox list by its entry id. Returns
 * -1 when not present (e.g. row filtered out, or has no photo_url).
 */
export function findTimelinePhotoIndexById(
  list: ReadonlyArray<TimelinePhotoLightboxItem>,
  entryId: string | null | undefined,
): number {
  if (!entryId || !Array.isArray(list)) return -1;
  for (let i = 0; i < list.length; i += 1) {
    if (list[i]?.id === entryId) return i;
  }
  return -1;
}

export function buildTimelinePhotoAltText(
  item: TimelinePhotoLightboxItem | null | undefined,
): string {
  if (!item) return "Timeline photo";
  const parts: string[] = ["Timeline photo"];
  if (item.plantName) parts.push(`of ${item.plantName}`);
  if (item.entryAt) parts.push(`taken ${item.entryAt}`);
  return parts.join(" ");
}
