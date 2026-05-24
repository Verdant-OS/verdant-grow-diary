/**
 * relativeStageTimelineRules — pure stage presets + plant-relative timeline
 * helpers for Verdant's future cultivation timeline.
 *
 * Pure & deterministic. No React. No data layer. No persistence. No device
 * control. No automation. No auto stage mutation. Stage shift drafts are
 * always approval-required.
 *
 * See docs/relative-cultivation-timeline.md for the architectural contract.
 */

// ---------------------------------------------------------------------------
// Stage presets
// ---------------------------------------------------------------------------

export type RelativeStageKey =
  | "seedling"
  | "clone"
  | "vegetation"
  | "flower"
  | "dry"
  | "cure";

export interface RelativeStagePreset {
  /** Stable machine key. Never change once shipped. */
  key: RelativeStageKey;
  /** Grower-facing label. */
  label: string;
  /** Short grower-friendly description. */
  description: string;
  /**
   * Stable Tailwind color token / class for dark-mode-friendly UI.
   * UI may map this token to a semantic theme color. Never inline hex.
   */
  colorToken: string;
  /** Human color direction, for design reference and tests. */
  colorDirection: string;
  /**
   * Advisory only. Suggested relative day range for the stage.
   * Never used to auto-shift stages.
   */
  suggestedDurationDays: { min: number; max: number } | null;
  /** Deterministic sort order across the cultivation lifecycle. */
  sortOrder: number;
}

const PRESETS: ReadonlyArray<RelativeStagePreset> = Object.freeze([
  {
    key: "seedling",
    label: "Seedling",
    description: "Early life from sprout to first true leaves.",
    colorToken: "stage-seedling",
    colorDirection: "Soft Mint Green",
    suggestedDurationDays: { min: 7, max: 21 },
    sortOrder: 10,
  },
  {
    key: "clone",
    label: "Clone",
    description: "Cutting taking root before vegetative growth.",
    colorToken: "stage-clone",
    colorDirection: "Vibrant Teal",
    suggestedDurationDays: { min: 7, max: 21 },
    sortOrder: 20,
  },
  {
    key: "vegetation",
    label: "Vegetation",
    description: "Leaf and structure growth before flowering.",
    colorToken: "stage-vegetation",
    colorDirection: "Lush Emerald Green",
    suggestedDurationDays: { min: 14, max: 60 },
    sortOrder: 30,
  },
  {
    key: "flower",
    label: "Flower",
    description: "Bud development through harvest readiness.",
    colorToken: "stage-flower",
    colorDirection: "Deep Ultraviolet / Magenta",
    suggestedDurationDays: { min: 45, max: 75 },
    sortOrder: 40,
  },
  {
    key: "dry",
    label: "Dry",
    description: "Post-harvest drying before cure.",
    colorToken: "stage-dry",
    colorDirection: "Amber / Gold",
    suggestedDurationDays: { min: 7, max: 14 },
    sortOrder: 50,
  },
  {
    key: "cure",
    label: "Cure",
    description: "Slow cure in jars to refine aroma and smoothness.",
    colorToken: "stage-cure",
    colorDirection: "Rich Earthy Brown",
    suggestedDurationDays: { min: 14, max: 60 },
    sortOrder: 60,
  },
]);

const PRESET_BY_KEY: ReadonlyMap<string, RelativeStagePreset> = new Map(
  PRESETS.map((p) => [p.key, p]),
);

export function listRelativeStagePresets(): ReadonlyArray<RelativeStagePreset> {
  // Already sorted by sortOrder at definition; re-sort defensively.
  return [...PRESETS].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getRelativeStagePreset(
  stageKey: string | null | undefined,
): RelativeStagePreset | null {
  if (!stageKey || typeof stageKey !== "string") return null;
  return PRESET_BY_KEY.get(stageKey.toLowerCase().trim()) ?? null;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function toEpoch(v: string | number | Date | null | undefined): number | null {
  if (v == null) return null;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

const MS_PER_DAY = 86_400_000;

function relativeDay(
  anchor: string | number | Date | null | undefined,
  event: string | number | Date | null | undefined,
): number | null {
  const a = toEpoch(anchor);
  const e = toEpoch(event);
  if (a == null || e == null) return null;
  if (e < a) return null;
  return Math.floor((e - a) / MS_PER_DAY);
}

export function calculatePlantRelativeDay(input: {
  plantStartedAt: string | number | Date | null | undefined;
  eventAt: string | number | Date | null | undefined;
}): number | null {
  if (!input) return null;
  return relativeDay(input.plantStartedAt, input.eventAt);
}

export function calculateStageRelativeDay(input: {
  stageStartedAt: string | number | Date | null | undefined;
  eventAt: string | number | Date | null | undefined;
}): number | null {
  if (!input) return null;
  return relativeDay(input.stageStartedAt, input.eventAt);
}

// ---------------------------------------------------------------------------
// Timeline item sorting
// ---------------------------------------------------------------------------

export interface RelativeTimelineItem {
  id: string;
  eventAt: string | number | Date | null | undefined;
  [k: string]: unknown;
}

/**
 * Newest-first sort. Items with invalid timestamps sort last. Stable
 * lexical id tie-break for determinism across runs.
 */
export function sortStageTimelineItems<T extends RelativeTimelineItem>(
  items: ReadonlyArray<T>,
): T[] {
  if (!Array.isArray(items)) return [];
  return [...items].sort((a, b) => {
    const at = toEpoch(a?.eventAt) ?? -Infinity;
    const bt = toEpoch(b?.eventAt) ?? -Infinity;
    if (at !== bt) return bt - at;
    const aid = a?.id ?? "";
    const bid = b?.id ?? "";
    return aid < bid ? -1 : aid > bid ? 1 : 0;
  });
}

// ---------------------------------------------------------------------------
// Stage shift recommendation draft (approval-required, advisory only)
// ---------------------------------------------------------------------------

export type StageShiftTrigger =
  | "early_preflower_observed"
  | "ahead_of_expected_autoflower_timing"
  | "grower_stage_observation"
  | "photo_logged"
  | "symptom_logged";

export interface StageShiftRecommendationDraftInput {
  plantId: string;
  currentStage: RelativeStageKey | string | null | undefined;
  suggestedStage: RelativeStageKey;
  trigger: StageShiftTrigger;
  observedAt?: string | number | Date | null;
  evidence?: ReadonlyArray<string>;
}

export interface StageShiftRecommendationDraft {
  kind: "stage_shift_recommendation_draft";
  plantId: string;
  currentStage: string | null;
  suggestedStage: RelativeStageKey;
  trigger: StageShiftTrigger;
  observedAt: string | null;
  evidence: ReadonlyArray<string>;
  message: string;
  /** Always true. Stage shifts must be grower-approved. */
  requiresApproval: true;
  /** Always false. This draft must never mutate plant.stage directly. */
  mutatesStageDirectly: false;
  /** Always empty. No device commands are ever attached. */
  deviceCommands: ReadonlyArray<never>;
  /** Always false. Never implies nutrient/feed/environment changes. */
  suggestsFeedingChange: false;
  suggestsEnvironmentChange: false;
}

const SHIFT_MESSAGES: Record<RelativeStageKey, string> = {
  seedling: "Review whether this plant should move into Seedling.",
  clone: "Review whether this plant should move into Clone.",
  vegetation: "Review whether this plant should move into Vegetation.",
  flower: "Review whether this plant should move into Flower.",
  dry: "Review whether this plant should move into Dry.",
  cure: "Review whether this plant should move into Cure.",
};

export function buildStageShiftRecommendationDraft(
  input: StageShiftRecommendationDraftInput,
): StageShiftRecommendationDraft | null {
  if (!input || typeof input.plantId !== "string" || !input.plantId) {
    return null;
  }
  const preset = getRelativeStagePreset(input.suggestedStage);
  if (!preset) return null;

  const observedEpoch = toEpoch(input.observedAt ?? null);
  const observedAt =
    observedEpoch != null ? new Date(observedEpoch).toISOString() : null;

  const evidence = Array.isArray(input.evidence)
    ? input.evidence.filter((e): e is string => typeof e === "string" && !!e)
    : [];

  const current =
    typeof input.currentStage === "string" && input.currentStage
      ? input.currentStage.toLowerCase().trim()
      : null;

  return {
    kind: "stage_shift_recommendation_draft",
    plantId: input.plantId,
    currentStage: current,
    suggestedStage: preset.key,
    trigger: input.trigger,
    observedAt,
    evidence,
    message: SHIFT_MESSAGES[preset.key],
    requiresApproval: true,
    mutatesStageDirectly: false,
    deviceCommands: Object.freeze([]) as ReadonlyArray<never>,
    suggestsFeedingChange: false,
    suggestsEnvironmentChange: false,
  };
}
