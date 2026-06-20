/**
 * quickLogDraftPreviewViewModel — pure helper that derives a compact
 * draft preview header shown at the top of the existing Quick Log sheet
 * when it was opened with a prefill (HyperLog handoff, plant-detail
 * deep-link, etc).
 *
 * Hard constraints:
 *   - No I/O. No JSX. Deterministic.
 *   - Never labels HyperLog / demo / manual data as live.
 *   - Never throws on malformed input.
 *   - Returns a `show: false` result when there is nothing meaningful
 *     to surface (no prefill at all).
 */

export type QuickLogDraftSource =
  | "hyperlog"
  | "plant-detail"
  | "fast-add"
  | string
  | null
  | undefined;

export interface QuickLogDraftPreviewInput {
  /** Mirrors the optional QuickLogPrefill exposed by QuickLog.tsx. */
  prefill?:
    | {
        eventType?: string | null;
        note?: string | null;
        plantName?: string | null;
        tentId?: string | null;
        suggestSnapshot?: boolean | null;
        /** Optional handoff source label (e.g. "hyperlog"). */
        source?: QuickLogDraftSource;
        /** Number of locally previewed photos waiting in the handoff caller. */
        photoCount?: number | null;
      }
    | null
    | undefined;
}

export interface QuickLogDraftPreviewViewModel {
  show: boolean;
  /** Human label for the prefilled event type, e.g. "Watering". */
  eventTypeLabel: string | null;
  /** Trimmed first line of the prefilled note, or null. */
  noteSummary: string | null;
  /** Calm source label e.g. "From HyperLog draft (manual)". */
  sourceLabel: string | null;
  /**
   * Snapshot guidance copy. Always demo/manual-safe — never says "live".
   * Null when no snapshot context exists.
   */
  snapshotLabel: string | null;
  /**
   * Photo guidance copy. Used when the upstream HyperLog draft has
   * locally previewed photos that the existing Quick Log editor cannot
   * accept as drafts — surfaces the "Photo preview only" copy.
   */
  photoLabel: string | null;
  /** True if this draft originated from a HyperLog handoff. */
  isHyperLog: boolean;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  observation: "Note",
  watering: "Watering",
  feeding: "Feeding",
  training: "Training",
  photo: "Photo",
  environment: "Environment check",
  harvest: "Harvest",
};

export const QUICK_LOG_DRAFT_PHOTO_BLOCKED_COPY =
  "Photo preview only — attach/save through Quick Log.";

export const QUICK_LOG_DRAFT_DEMO_SNAPSHOT_COPY =
  "Demo snapshot only — not saved as live sensor data.";

export const QUICK_LOG_DRAFT_ENVIRONMENT_COPY =
  "Environment Check is a Quick Log note, not a live sensor reading.";

function trimToNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function firstLine(text: string, max = 140): string {
  const line = text.split(/\r?\n/)[0]?.trim() ?? "";
  if (line.length <= max) return line;
  return `${line.slice(0, max - 1).trimEnd()}…`;
}

function eventTypeLabelFor(raw: unknown): string | null {
  const t = trimToNull(raw);
  if (!t) return null;
  return EVENT_TYPE_LABELS[t] ?? null;
}

/**
 * Build the Quick Log draft preview view model.
 *
 * Safe against null/undefined inputs.
 */
export function buildQuickLogDraftPreview(
  input: QuickLogDraftPreviewInput,
): QuickLogDraftPreviewViewModel {
  const empty: QuickLogDraftPreviewViewModel = {
    show: false,
    eventTypeLabel: null,
    noteSummary: null,
    sourceLabel: null,
    snapshotLabel: null,
    photoLabel: null,
    isHyperLog: false,
  };
  try {
    const prefill = input?.prefill ?? null;
    if (!prefill) return empty;

    const eventTypeLabel = eventTypeLabelFor(prefill.eventType);
    const note = trimToNull(prefill.note);
    const noteSummary = note ? firstLine(note) : null;
    const isHyperLog = prefill.source === "hyperlog";

    const sourceLabel = isHyperLog
      ? "From HyperLog draft (manual)"
      : prefill.source
      ? `From ${prefill.source} draft`
      : null;

    // Snapshot guidance — never call HyperLog data "live".
    let snapshotLabel: string | null = null;
    if (isHyperLog) {
      snapshotLabel = QUICK_LOG_DRAFT_DEMO_SNAPSHOT_COPY;
    } else if (prefill.suggestSnapshot && prefill.tentId) {
      snapshotLabel =
        "Sensor snapshot suggested — confirm in Quick Log before saving.";
    }

    const photoCount = Number(prefill.photoCount ?? 0);
    const photoLabel =
      Number.isFinite(photoCount) && photoCount > 0
        ? QUICK_LOG_DRAFT_PHOTO_BLOCKED_COPY
        : null;

    const show =
      Boolean(eventTypeLabel) ||
      Boolean(noteSummary) ||
      Boolean(sourceLabel) ||
      Boolean(snapshotLabel) ||
      Boolean(photoLabel);

    if (!show) return empty;

    return {
      show,
      eventTypeLabel,
      noteSummary,
      sourceLabel,
      snapshotLabel,
      photoLabel,
      isHyperLog,
    };
  } catch {
    return empty;
  }
}
