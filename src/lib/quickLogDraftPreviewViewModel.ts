/**
 * quickLogDraftPreviewViewModel — pure helper that derives a compact
 * draft preview header shown at the top of the existing Quick Log sheet
 * when it was opened with a prefill (HyperLog handoff, plant-detail
 * deep-link, pheno evidence goal, etc).
 *
 * Hard constraints:
 *   - No I/O. No JSX. Deterministic.
 *   - Never labels HyperLog / demo / manual data as live.
 *   - Never claims a note was prefilled when the note is empty.
 *   - Never throws on malformed input.
 *   - Returns a `show: false` result when there is nothing meaningful
 *     to surface (no prefill at all).
 */

export type QuickLogDraftSource =
  | "hyperlog"
  | "plant-detail"
  | "fast-add"
  | "pheno-evidence-goal"
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
        /** Pheno evidence goal id when source is pheno-evidence-goal. */
        phenoEvidenceGoal?: string | null;
      }
    | null
    | undefined;
}

export interface QuickLogDraftPreviewViewModel {
  show: boolean;
  /**
   * Honest headline. Never says "Note prefilled" when the note field was
   * empty on open. Examples: "Note prefilled", "Activity set", "Evidence goal handoff".
   */
  headline: string | null;
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
  /** Goal label line when a pheno evidence goal was handed off. */
  goalLabel: string | null;
  /**
   * Honest empty-note guidance. Only when a note-like handoff opened without
   * a note — never for HyperLog water/feed drafts that intentionally omit notes.
   */
  emptyNoteHint: string | null;
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

/** Human labels for known pheno evidence goal ids (display only). */
const PHENO_GOAL_LABELS: Record<string, string> = {
  structure: "Structure",
  vigor: "Vigor",
  aroma: "Aroma",
  resin: "Resin",
  stretch: "Stretch",
  stress_resistance: "Stress resistance",
  disease_pest_resistance: "Disease / pest resistance",
  yield: "Yield",
  post_cure: "Post-cure",
};

export const QUICK_LOG_DRAFT_PHOTO_BLOCKED_COPY =
  "Photo preview only — attach/save through Quick Log.";

export const QUICK_LOG_DRAFT_DEMO_SNAPSHOT_COPY =
  "Demo snapshot only — not saved as live sensor data.";

export const QUICK_LOG_DRAFT_ENVIRONMENT_COPY =
  "Environment Check is a Quick Log note, not a live sensor reading.";

export const QUICK_LOG_DRAFT_PHENO_SOURCE_LABEL = "From pheno evidence goal";

export const QUICK_LOG_DRAFT_REVIEW_HINT = "Review before saving.";

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

function goalDisplayLabel(raw: unknown): string | null {
  const id = trimToNull(raw);
  if (!id) return null;
  const known = PHENO_GOAL_LABELS[id];
  if (known) return known;
  // Unknown ids: humanize snake_case without inventing product meaning.
  return id
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function sourceLabelFor(source: QuickLogDraftSource, isHyperLog: boolean): string | null {
  if (isHyperLog) return "From HyperLog draft (manual)";
  if (source === "pheno-evidence-goal") return QUICK_LOG_DRAFT_PHENO_SOURCE_LABEL;
  if (typeof source === "string" && source.trim().length > 0) {
    return `From ${source.trim()} draft`;
  }
  return null;
}

/**
 * Build an honest headline. Never claims a note was prefilled when empty.
 */
export function buildQuickLogDraftHeadline(input: {
  noteSummary: string | null;
  eventTypeLabel: string | null;
  source: QuickLogDraftSource;
  goalLabel: string | null;
}): string | null {
  const { noteSummary, eventTypeLabel, source, goalLabel } = input;

  if (noteSummary) {
    return eventTypeLabel ? `${eventTypeLabel} prefilled` : "Note prefilled";
  }

  if (source === "pheno-evidence-goal" || goalLabel) {
    return goalLabel ? "Evidence goal selected" : "Evidence goal handoff";
  }

  if (eventTypeLabel) {
    return `${eventTypeLabel} activity set`;
  }

  if (source) {
    return "Draft handoff";
  }

  return null;
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
    headline: null,
    eventTypeLabel: null,
    noteSummary: null,
    sourceLabel: null,
    snapshotLabel: null,
    photoLabel: null,
    isHyperLog: false,
    goalLabel: null,
    emptyNoteHint: null,
  };
  try {
    const prefill = input?.prefill ?? null;
    if (!prefill) return empty;

    const eventTypeLabel = eventTypeLabelFor(prefill.eventType);
    const note = trimToNull(prefill.note);
    const noteSummary = note ? firstLine(note) : null;
    const isHyperLog = prefill.source === "hyperlog";
    const sourceLabel = sourceLabelFor(prefill.source, isHyperLog);
    const goalLabel =
      prefill.source === "pheno-evidence-goal" || prefill.phenoEvidenceGoal
        ? goalDisplayLabel(prefill.phenoEvidenceGoal)
        : null;

    // Snapshot guidance — never call HyperLog data "live".
    let snapshotLabel: string | null = null;
    if (isHyperLog) {
      snapshotLabel = QUICK_LOG_DRAFT_DEMO_SNAPSHOT_COPY;
    } else if (prefill.suggestSnapshot && prefill.tentId) {
      snapshotLabel = "Sensor snapshot suggested — confirm in Quick Log before saving.";
    }

    const photoCount = Number(prefill.photoCount ?? 0);
    const photoLabel =
      Number.isFinite(photoCount) && photoCount > 0 ? QUICK_LOG_DRAFT_PHOTO_BLOCKED_COPY : null;

    const headline = buildQuickLogDraftHeadline({
      noteSummary,
      eventTypeLabel,
      source: prefill.source,
      goalLabel,
    });

    const emptyNoteHint =
      !noteSummary &&
      (prefill.source === "pheno-evidence-goal" ||
        prefill.eventType === "observation" ||
        (!prefill.eventType && Boolean(prefill.source)))
        ? "Note field is empty — add what you observed before saving."
        : null;

    const show =
      Boolean(headline) ||
      Boolean(noteSummary) ||
      Boolean(sourceLabel) ||
      Boolean(snapshotLabel) ||
      Boolean(photoLabel) ||
      Boolean(goalLabel);

    if (!show) return empty;

    return {
      show,
      headline,
      eventTypeLabel,
      noteSummary,
      sourceLabel,
      snapshotLabel,
      photoLabel,
      isHyperLog,
      goalLabel: goalLabel ? `Goal: ${goalLabel}` : null,
      emptyNoteHint,
    };
  } catch {
    return empty;
  }
}
