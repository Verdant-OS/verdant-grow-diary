/**
 * earlyStageTimelineViewModel — pure, read-only helper that extracts a
 * grower-safe early-stage view model from a raw diary entry `details`
 * object (or any object plausibly carrying an `early_stage` envelope).
 *
 * Used by the diary/timeline UI to render saved Quick Log germination
 * and seedling milestone, vigor, and stage context without echoing raw
 * payload keys, unknown enum values, or arbitrary objects.
 *
 * Pure & deterministic. No React. No Supabase. No I/O. No mutation.
 */

import {
  EARLY_STAGE_MILESTONES,
  EARLY_STAGE_VIGOR_OPTIONS,
  isMilestoneValue,
  isVigorValue,
} from "./earlyStageQuickLogRules";

export interface EarlyStageTimelineViewModel {
  /** Resolved milestone display label, or null when no milestone was saved. */
  milestoneLabel: string | null;
  /** True when a milestone value was present but did not match a known enum. */
  milestoneUnknown: boolean;
  /** Resolved vigor display label, or null when no vigor was saved. */
  vigorLabel: string | null;
  /** True when a vigor value was present but did not match a known enum. */
  vigorUnknown: boolean;
  /** Short grower observation (trimmed, length-capped), or null. */
  note: string | null;
  /** Resolved stage context label (Title-cased), or null. */
  stageContextLabel: string | null;
}

const NOTE_MAX = 200;

const KNOWN_STAGE_CONTEXTS: Record<string, string> = {
  germination: "Germination",
  germ: "Germination",
  seedling: "Seedling",
};

function readEarlyStageEnvelope(details: unknown): Record<string, unknown> | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const d = details as Record<string, unknown>;
  // Accept either the wrapping `details` object or a pre-extracted envelope.
  const inner =
    d.early_stage && typeof d.early_stage === "object" && !Array.isArray(d.early_stage)
      ? (d.early_stage as Record<string, unknown>)
      : null;
  if (inner) return inner;
  // If the caller passed the envelope itself (has milestone/vigor/etc).
  if (
    "early_stage_milestone" in d ||
    "vigor" in d ||
    "stage_context" in d ||
    (typeof (d as { notes?: unknown }).notes === "string" && "stage_context" in d)
  ) {
    return d;
  }
  return null;
}

function clipNote(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const flat = value.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  if (flat.length <= NOTE_MAX) return flat;
  return flat.slice(0, NOTE_MAX - 1).trimEnd() + "…";
}

function resolveStageContextLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  return KNOWN_STAGE_CONTEXTS[trimmed] ?? null;
}

/**
 * Build a safe view model from a raw `details` object. Returns null
 * when the entry carries no early-stage envelope, or when the envelope
 * has no meaningful values (milestone, vigor, note, or stage context).
 */
export function buildEarlyStageTimelineViewModel(
  details: unknown,
): EarlyStageTimelineViewModel | null {
  const env = readEarlyStageEnvelope(details);
  if (!env) return null;

  const milestoneRaw = env.early_stage_milestone ?? env.milestone ?? null;
  const milestonePresent = milestoneRaw != null && milestoneRaw !== "";
  let milestoneLabel: string | null = null;
  let milestoneUnknown = false;
  if (milestonePresent) {
    if (isMilestoneValue(milestoneRaw)) {
      const opt = EARLY_STAGE_MILESTONES.find((m) => m.value === milestoneRaw);
      milestoneLabel = opt ? opt.label : null;
    } else {
      milestoneUnknown = true;
    }
  }

  const vigorRaw = env.vigor ?? null;
  const vigorPresent = vigorRaw != null && vigorRaw !== "";
  let vigorLabel: string | null = null;
  let vigorUnknown = false;
  if (vigorPresent) {
    if (isVigorValue(vigorRaw)) {
      const opt = EARLY_STAGE_VIGOR_OPTIONS.find((v) => v.value === vigorRaw);
      vigorLabel = opt ? opt.label : null;
    } else {
      vigorUnknown = true;
    }
  }

  const note = clipNote(env.notes ?? env.note);
  const stageContextLabel = resolveStageContextLabel(env.stage_context);

  // Suppress fully empty envelopes so callers can render conditionally.
  if (
    !milestoneLabel &&
    !milestoneUnknown &&
    !vigorLabel &&
    !vigorUnknown &&
    !note &&
    !stageContextLabel
  ) {
    return null;
  }

  return {
    milestoneLabel,
    milestoneUnknown,
    vigorLabel,
    vigorUnknown,
    note,
    stageContextLabel,
  };
}

/** Safe fallback copy when milestone/vigor were present but unknown. */
export const EARLY_STAGE_MILESTONE_UNKNOWN_LABEL = "Milestone logged";
export const EARLY_STAGE_VIGOR_UNKNOWN_LABEL = "Vigor noted";
