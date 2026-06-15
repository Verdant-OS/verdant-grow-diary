/**
 * earlyStageQuickLogRules — pure rules for the Quick Log germination /
 * seedling milestone section.
 *
 * No I/O, no React, no Supabase, no Action Queue, no AI calls, no device
 * control. Deterministic. Time is injectable. Used by Quick Log UI to
 * decide whether to surface early-stage chips and to build the
 * `p_details.early_stage` envelope persisted through the EXISTING
 * quicklog_save_manual RPC path — no schema change required.
 */

export type EarlyStageMilestone =
  | "seed_started"
  | "taproot_visible"
  | "planted_in_medium"
  | "cotyledons_open"
  | "first_true_leaves";

export interface EarlyStageMilestoneOption {
  value: EarlyStageMilestone;
  label: string;
  /** Short human-readable phrase appended to the diary note. */
  notePhrase: string;
}

export const EARLY_STAGE_MILESTONES: readonly EarlyStageMilestoneOption[] = [
  { value: "seed_started", label: "Seed started", notePhrase: "Seed started (soak/start)" },
  { value: "taproot_visible", label: "Taproot visible", notePhrase: "Taproot visible" },
  { value: "planted_in_medium", label: "Planted in medium", notePhrase: "Planted in medium" },
  { value: "cotyledons_open", label: "Cotyledons open", notePhrase: "Cotyledons open" },
  { value: "first_true_leaves", label: "First true leaves", notePhrase: "First true leaves" },
] as const;

export type EarlyStageVigor = "strong" | "medium" | "weak" | "stressed";

export interface EarlyStageVigorOption {
  value: EarlyStageVigor;
  label: string;
}

export const EARLY_STAGE_VIGOR_OPTIONS: readonly EarlyStageVigorOption[] = [
  { value: "strong", label: "Strong" },
  { value: "medium", label: "Medium" },
  { value: "weak", label: "Weak" },
  { value: "stressed", label: "Stressed" },
] as const;

export const EARLY_STAGE_PHOTO_HINT =
  "Photo recommended for early-stage memory — not required to save.";

export const EARLY_STAGE_NOTE_PLACEHOLDER = "What changed?";

/** Days from plant creation considered "early stage" when stage is unknown. */
export const EARLY_STAGE_AGE_WINDOW_DAYS = 21;

export interface EarlyStageContextInput {
  /** Grow or plant stage string. May be null/undefined. */
  stage?: string | null;
  /** Plant created_at ISO string. May be null/undefined. */
  plantCreatedAt?: string | null;
  /** Injectable "now" for deterministic tests. */
  now?: Date;
}

function isEarlyStageString(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === "seedling" || v === "germination" || v === "germ";
}

function isWithinEarlyAgeWindow(
  plantCreatedAt: string | null | undefined,
  now: Date,
): boolean {
  if (!plantCreatedAt) return false;
  const created = new Date(plantCreatedAt);
  if (Number.isNaN(created.getTime())) return false;
  const ms = now.getTime() - created.getTime();
  if (ms < 0) return false;
  const days = ms / (1000 * 60 * 60 * 24);
  return days <= EARLY_STAGE_AGE_WINDOW_DAYS;
}

/**
 * Decide whether the early-stage section should appear by default.
 *
 * Returns:
 *  - "visible"   — stage is explicitly germination/seedling
 *  - "suggested" — stage is unknown but plant is young (still optional)
 *  - "hidden"    — context is clearly past early stage
 */
export type EarlyStageVisibility = "visible" | "suggested" | "hidden";

export function evaluateEarlyStageVisibility(
  input: EarlyStageContextInput,
): EarlyStageVisibility {
  const now = input.now ?? new Date();
  if (isEarlyStageString(input.stage)) return "visible";
  // Past-early stages explicitly hide the section.
  const stage = (input.stage ?? "").trim().toLowerCase();
  if (
    stage === "veg" ||
    stage === "vegetative" ||
    stage === "flower" ||
    stage === "flowering" ||
    stage === "flush" ||
    stage === "flushing" ||
    stage === "harvest" ||
    stage === "drying" ||
    stage === "curing"
  ) {
    return "hidden";
  }
  if (isWithinEarlyAgeWindow(input.plantCreatedAt, now)) return "suggested";
  return "hidden";
}

export function isMilestoneValue(value: unknown): value is EarlyStageMilestone {
  return (
    typeof value === "string" &&
    EARLY_STAGE_MILESTONES.some((m) => m.value === value)
  );
}

export function isVigorValue(value: unknown): value is EarlyStageVigor {
  return (
    typeof value === "string" &&
    EARLY_STAGE_VIGOR_OPTIONS.some((v) => v.value === value)
  );
}

export interface EarlyStageDetailsInput {
  milestone?: EarlyStageMilestone | null;
  vigor?: EarlyStageVigor | null;
  notes?: string | null;
  /** Stage string that drove visibility, for traceability. */
  stage?: string | null;
}

export interface EarlyStageDetailsEnvelope {
  early_stage_milestone: EarlyStageMilestone | null;
  vigor: EarlyStageVigor | null;
  notes: string | null;
  stage_context: string | null;
}

/**
 * Build the structured early-stage envelope persisted under
 * `p_details.early_stage` through the existing RPC. Returns null when
 * the grower made no early-stage selection — callers should then omit
 * the envelope entirely to avoid noisy empty payloads.
 */
export function buildEarlyStageDetails(
  input: EarlyStageDetailsInput,
): EarlyStageDetailsEnvelope | null {
  const milestone = isMilestoneValue(input.milestone) ? input.milestone : null;
  const vigor = isVigorValue(input.vigor) ? input.vigor : null;
  const notes =
    typeof input.notes === "string" && input.notes.trim().length > 0
      ? input.notes.trim()
      : null;
  if (!milestone && !vigor && !notes) return null;
  const stageRaw = typeof input.stage === "string" ? input.stage.trim() : "";
  return {
    early_stage_milestone: milestone,
    vigor,
    notes,
    stage_context: stageRaw.length > 0 ? stageRaw.toLowerCase() : null,
  };
}

/**
 * Human-readable suffix appended to the diary note so the milestone is
 * visible in timelines that read the note column.
 */
export function buildEarlyStageNoteSuffix(
  input: EarlyStageDetailsInput,
): string {
  const envelope = buildEarlyStageDetails(input);
  if (!envelope) return "";
  const parts: string[] = [];
  if (envelope.early_stage_milestone) {
    const opt = EARLY_STAGE_MILESTONES.find(
      (m) => m.value === envelope.early_stage_milestone,
    );
    if (opt) parts.push(`Milestone: ${opt.notePhrase}`);
  }
  if (envelope.vigor) {
    const opt = EARLY_STAGE_VIGOR_OPTIONS.find((v) => v.value === envelope.vigor);
    if (opt) parts.push(`Vigor: ${opt.label}`);
  }
  if (envelope.notes) parts.push(`Early note: ${envelope.notes}`);
  return parts.join(" · ");
}
