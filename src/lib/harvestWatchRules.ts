/**
 * harvestWatchRules — pure, deterministic helpers for the v1.5 Harvest Watch
 * advisor (phenotype-aware late-flower harvest readiness).
 *
 * No React. No Supabase. No I/O. No AI calls. No Action Queue writes. No
 * automation. No device control. No trichome image analysis — v1.5 only
 * exposes a confidence-gated placeholder for an optional trichome signal.
 *
 * Harvest Watch is ADVISORY ONLY. Outputs should never be presented with
 * false precision when evidence is weak, and unknown/invalid inputs must
 * never resolve to a "healthy / high confidence" classification.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HarvestWatchConfidence = "low" | "medium" | "high";

export const HARVEST_WATCH_CONFIDENCE_LABEL: Record<
  HarvestWatchConfidence,
  string
> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

/** Quality of plant selection in irrigation/dryback logs. */
export type IrrigationPlantSelectionQuality =
  | "explicit" // plant_id captured per log
  | "weak" // ambiguous / inferred
  | "skipped"; // plant selection skipped entirely

/** Optional trichome signal placeholder (no image analysis in v1.5). */
export interface HarvestWatchTrichomeSignal {
  /** Confidence supplied by an upstream pipeline that does not exist yet. */
  confidence: HarvestWatchConfidence;
  /** Short, advisory caption. Never a diagnosis. */
  insight?: string | null;
}

export interface HarvestWatchInput {
  plantId: string;
  plantLabel: string;
  phenotypeLabel: string | null;

  /** Days since flip to flower. */
  daysInFlower: number | null;
  /** Expected/historical average harvest day for the phenotype, when known. */
  expectedHarvestDay: number | null;
  /** Number of prior completed grows for this phenotype. */
  priorGrowCount: number;

  /** Count of qualifying photos (1 evidence point each). */
  photoEvidenceCount: number;
  /** Count of usable dryback windows (1 evidence point each). */
  usableDrybackWindowCount: number;

  irrigationPlantSelectionQuality: IrrigationPlantSelectionQuality;

  /** Pre-computed component confidences supplied by upstream helpers. */
  drybackConfidence: HarvestWatchConfidence | null;
  daysVsHistoryConfidence: HarvestWatchConfidence | null;

  /** Optional v1.5 trichome placeholder. */
  trichome?: HarvestWatchTrichomeSignal | null;

  /** Last qualifying photo timestamp (ISO). */
  lastPhotoAt: string | null;

  /** Injected "now" for deterministic tests. */
  now: Date;
}

// ---------------------------------------------------------------------------
// Evidence gate
// ---------------------------------------------------------------------------

export const HARVEST_WATCH_EVIDENCE_THRESHOLD = 4;

export interface EvidenceGateResult {
  totalPoints: number;
  threshold: number;
  passes: boolean;
}

function safeCount(n: number | null | undefined): number {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/**
 * Evidence gate: at least 4 TOTAL usable evidence points (photos +
 * dryback windows combined). Photos and dryback windows are NOT each
 * required to hit 4 individually.
 */
export function evaluateHarvestWatchEvidenceGate(
  input: Pick<
    HarvestWatchInput,
    "photoEvidenceCount" | "usableDrybackWindowCount"
  >,
): EvidenceGateResult {
  const photos = safeCount(input.photoEvidenceCount);
  const dryback = safeCount(input.usableDrybackWindowCount);
  const totalPoints = photos + dryback;
  return {
    totalPoints,
    threshold: HARVEST_WATCH_EVIDENCE_THRESHOLD,
    passes: totalPoints >= HARVEST_WATCH_EVIDENCE_THRESHOLD,
  };
}

// ---------------------------------------------------------------------------
// Component sub-scores (deterministic, 0..1)
// ---------------------------------------------------------------------------

const CONFIDENCE_TO_SCORE: Record<HarvestWatchConfidence, number> = {
  low: 0.3,
  medium: 0.6,
  high: 0.9,
};

function confidenceToScore(c: HarvestWatchConfidence | null | undefined): number | null {
  if (c == null) return null;
  if (c !== "low" && c !== "medium" && c !== "high") return null;
  return CONFIDENCE_TO_SCORE[c];
}

// ---------------------------------------------------------------------------
// Readiness Score (50/50 dryback + days-vs-history)
// ---------------------------------------------------------------------------

export interface ReadinessScore {
  /** 0..1 advisory score, or null when gated/unavailable. */
  score: number | null;
  /** Reason copy when null. */
  gatedReason: string | null;
  /** Component breakdown for transparency. */
  components: {
    drybackScore: number | null;
    daysVsHistoryScore: number | null;
    drybackWeight: 0.5;
    daysVsHistoryWeight: 0.5;
  };
}

export const READINESS_GATED_COPY =
  "Not enough evidence yet — add more photos or dryback windows.";
export const READINESS_MISSING_COMPONENT_COPY =
  "Missing dryback or days-vs-history confidence.";

/**
 * 50/50 weighted readiness. Trichome is NEVER folded in — it is only an
 * optional supporting placeholder in v1.5.
 */
export function calculateReadinessScore(input: HarvestWatchInput): ReadinessScore {
  const gate = evaluateHarvestWatchEvidenceGate(input);
  const components = {
    drybackScore: confidenceToScore(input.drybackConfidence),
    daysVsHistoryScore: confidenceToScore(input.daysVsHistoryConfidence),
    drybackWeight: 0.5 as const,
    daysVsHistoryWeight: 0.5 as const,
  };

  if (!gate.passes) {
    return { score: null, gatedReason: READINESS_GATED_COPY, components };
  }

  if (components.drybackScore == null || components.daysVsHistoryScore == null) {
    return {
      score: null,
      gatedReason: READINESS_MISSING_COMPONENT_COPY,
      components,
    };
  }

  const score =
    components.drybackScore * 0.5 + components.daysVsHistoryScore * 0.5;
  // Deterministic 3-decimal rounding to avoid float jitter.
  const rounded = Math.round(score * 1000) / 1000;
  return { score: rounded, gatedReason: null, components };
}

// ---------------------------------------------------------------------------
// Harvest window prediction
// ---------------------------------------------------------------------------

export interface HarvestWindowPrediction {
  /** Earliest day (days-in-flower) of the predicted window. */
  startDay: number;
  /** Latest day of the predicted window. */
  endDay: number;
  confidence: HarvestWatchConfidence;
  /** "history" when anchored to phenotype history, otherwise "broad". */
  anchor: "history" | "broad";
  caption: string;
}

const BROAD_FALLBACK_START = 56;
const BROAD_FALLBACK_END = 77;

/**
 * Harvest window appears immediately when Harvest Watch is enabled.
 * - History present: narrow ±5d window around expected day.
 * - No usable history: low-confidence broad window (8–11 weeks).
 */
export function predictHarvestWindow(
  input: Pick<
    HarvestWatchInput,
    "daysInFlower" | "expectedHarvestDay" | "priorGrowCount"
  >,
): HarvestWindowPrediction {
  const expected =
    typeof input.expectedHarvestDay === "number" &&
    Number.isFinite(input.expectedHarvestDay) &&
    input.expectedHarvestDay > 0
      ? Math.round(input.expectedHarvestDay)
      : null;
  const priors = safeCount(input.priorGrowCount);

  if (expected != null && priors >= 1) {
    const confidence: HarvestWatchConfidence =
      priors >= 3 ? "high" : priors >= 2 ? "medium" : "low";
    return {
      startDay: expected - 5,
      endDay: expected + 5,
      confidence,
      anchor: "history",
      caption: `Anchored to phenotype average (${priors} prior grow${priors === 1 ? "" : "s"}).`,
    };
  }

  return {
    startDay: BROAD_FALLBACK_START,
    endDay: BROAD_FALLBACK_END,
    confidence: "low",
    anchor: "broad",
    caption: "No phenotype history yet — showing a broad 8–11 week window.",
  };
}

// ---------------------------------------------------------------------------
// Dryback visibility / muting
// ---------------------------------------------------------------------------

export interface DrybackVisibility {
  visible: true; // Always visible — never hidden.
  muted: boolean;
  confidence: HarvestWatchConfidence;
  label: string;
}

export const DRYBACK_LOWER_CONFIDENCE_LABEL = "Lower Confidence";

export function deriveDrybackVisibility(
  input: Pick<
    HarvestWatchInput,
    "irrigationPlantSelectionQuality" | "drybackConfidence"
  >,
): DrybackVisibility {
  const weak =
    input.irrigationPlantSelectionQuality === "skipped" ||
    input.irrigationPlantSelectionQuality === "weak";

  if (weak) {
    return {
      visible: true,
      muted: true,
      confidence: "low",
      label: DRYBACK_LOWER_CONFIDENCE_LABEL,
    };
  }

  const confidence: HarvestWatchConfidence =
    input.drybackConfidence === "high" || input.drybackConfidence === "medium"
      ? input.drybackConfidence
      : "low";

  return {
    visible: true,
    muted: false,
    confidence,
    label: HARVEST_WATCH_CONFIDENCE_LABEL[confidence],
  };
}

// ---------------------------------------------------------------------------
// Photo prompt forgiveness
// ---------------------------------------------------------------------------

export type PhotoPromptTone = "normal" | "gentle" | "stronger";

export interface PhotoPromptState {
  missedDays: number;
  tone: PhotoPromptTone;
  message: string;
  /** Multiplicative confidence penalty applied to dryback/days components. */
  confidencePenalty: 0 | 0.1 | 0.25;
}

export function evaluatePhotoPrompt(
  lastPhotoAt: string | null,
  now: Date,
): PhotoPromptState {
  const nowMs = now instanceof Date && !Number.isNaN(now.getTime()) ? now.getTime() : NaN;
  let missedDays = 0;
  if (typeof lastPhotoAt === "string" && lastPhotoAt.length > 0 && Number.isFinite(nowMs)) {
    const t = Date.parse(lastPhotoAt);
    if (Number.isFinite(t)) {
      const diff = Math.floor((nowMs - t) / (24 * 60 * 60 * 1000));
      missedDays = diff > 0 ? diff : 0;
    }
  }

  if (missedDays >= 2) {
    return {
      missedDays,
      tone: "stronger",
      message: `No photos for ${missedDays} days — add one to keep Harvest Watch accurate.`,
      confidencePenalty: 0.25,
    };
  }
  if (missedDays === 1) {
    return {
      missedDays,
      tone: "gentle",
      message: "A fresh photo today will sharpen Harvest Watch.",
      confidencePenalty: 0.1,
    };
  }
  return {
    missedDays,
    tone: "normal",
    message: "Photo cadence on track.",
    confidencePenalty: 0,
  };
}

// ---------------------------------------------------------------------------
// Trichome placeholder (v1.5 — no image analysis)
// ---------------------------------------------------------------------------

export interface TrichomePlaceholderResult {
  /** Surface only when confidence is high. */
  visible: boolean;
  insight: string | null;
  confidence: HarvestWatchConfidence | null;
}

export function deriveTrichomePlaceholder(
  signal: HarvestWatchTrichomeSignal | null | undefined,
): TrichomePlaceholderResult {
  if (!signal || signal.confidence !== "high") {
    return { visible: false, insight: null, confidence: signal?.confidence ?? null };
  }
  const insight =
    typeof signal.insight === "string" && signal.insight.trim().length > 0
      ? signal.insight.trim()
      : "Trichome signal suggests harvest window is near.";
  return { visible: true, insight, confidence: "high" };
}
