/**
 * aiDoctorReadinessGateViewModel — pure mapping from
 * `AiDoctorContextReadiness` → gate copy + primary action descriptor.
 *
 * Hard constraints:
 *  - Pure: no React, no Supabase, no I/O.
 *  - Never claims a diagnosis. Banned words: confirmed, certain, cured,
 *    guaranteed, live, synced, connected, imported.
 *  - "Add missing context" never submits, writes, or opens a new route —
 *    it always focuses an in-page anchor.
 */

import type { AiDoctorContextReadiness } from "@/lib/aiDoctorContextRules";

/** Exact, non-negotiable gate copy. Source of truth for the panel. */
export const AI_DOCTOR_READINESS_GATE_COPY: Record<
  AiDoctorContextReadiness,
  string
> = Object.freeze({
  insufficient:
    "More context needed before AI Doctor should give confident guidance.",
  partial: "AI Doctor can review this, but confidence may be limited.",
  strong: "Ready for a cautious AI Doctor review.",
});

export const AI_DOCTOR_READINESS_GATE_ADD_CONTEXT_LABEL = "Add missing context";
export const AI_DOCTOR_READINESS_GATE_REVIEW_LABEL =
  "Open cautious AI Doctor review";

/**
 * Primary action descriptor. UI decides how to render; logic stays here.
 *  - `focus_anchor` → scroll/focus an in-page anchor (no writes, no routing).
 *  - `open_ai_doctor` → invoke an existing AI Doctor flow if a safe one is wired.
 */
export type AiDoctorReadinessGatePrimaryActionKind =
  | "focus_anchor"
  | "open_ai_doctor";

export interface AiDoctorReadinessGatePrimaryAction {
  kind: AiDoctorReadinessGatePrimaryActionKind;
  label: string;
  /** In-page anchor id used when kind === "focus_anchor". */
  anchorId?: string;
  testId: string;
}

export interface AiDoctorReadinessGateView {
  readiness: AiDoctorContextReadiness;
  message: string;
  primary: AiDoctorReadinessGatePrimaryAction;
  showQuickActions: boolean;
}

export interface BuildAiDoctorReadinessGateArgs {
  readiness: AiDoctorContextReadiness;
  /**
   * True when a safe, already-existing AI Doctor flow is available in the
   * host screen (e.g. PlantAiDoctorSessionsPanel). Never invent a new flow.
   */
  hasSafeAiDoctorFlow?: boolean;
  /** Anchor id the "Add missing context" CTA focuses/scrolls to. */
  quickActionsAnchorId?: string;
  /** Anchor id for the existing AI Doctor flow, when available. */
  aiDoctorAnchorId?: string;
}

const DEFAULT_QUICK_ACTIONS_ANCHOR = "plant-ai-doctor-context-panel";
const DEFAULT_AI_DOCTOR_ANCHOR = "plant-doctor";

export function buildAiDoctorReadinessGate(
  args: BuildAiDoctorReadinessGateArgs,
): AiDoctorReadinessGateView {
  const readiness = args.readiness;
  const message = AI_DOCTOR_READINESS_GATE_COPY[readiness];
  const quickAnchor = args.quickActionsAnchorId ?? DEFAULT_QUICK_ACTIONS_ANCHOR;
  const aiAnchor = args.aiDoctorAnchorId ?? DEFAULT_AI_DOCTOR_ANCHOR;
  const safeFlow = args.hasSafeAiDoctorFlow === true;

  const addContext: AiDoctorReadinessGatePrimaryAction = {
    kind: "focus_anchor",
    label: AI_DOCTOR_READINESS_GATE_ADD_CONTEXT_LABEL,
    anchorId: quickAnchor,
    testId: "ai-doctor-readiness-gate-primary-add-context",
  };

  const openReview: AiDoctorReadinessGatePrimaryAction = {
    kind: "open_ai_doctor",
    label: AI_DOCTOR_READINESS_GATE_REVIEW_LABEL,
    anchorId: aiAnchor,
    testId: "ai-doctor-readiness-gate-primary-open-review",
  };

  switch (readiness) {
    case "insufficient":
      return {
        readiness,
        message,
        primary: addContext,
        showQuickActions: true,
      };
    case "partial":
      return {
        readiness,
        message,
        primary: safeFlow ? openReview : addContext,
        showQuickActions: true,
      };
    case "strong":
      return {
        readiness,
        message,
        primary: safeFlow ? openReview : addContext,
        showQuickActions: false,
      };
  }
}

// ---------------------------------------------------------------------------
// Blocked-explanation helper
// ---------------------------------------------------------------------------

/**
 * The three evidence categories that can actually BLOCK diagnosis
 * (readiness = "insufficient") per `aiDoctorContextRules`:
 *   - `plant-profile`               → no plant profile at all
 *   - `recent-timeline-activity`    → no recent notes/watering/feeding/photos
 *   - `recent-manual-sensor-snapshot` → no recent manual sensor snapshot
 * Soft misses (strain/stage/medium/plant-photo) never block on their own.
 */
export const AI_DOCTOR_READINESS_BLOCKING_CODES = Object.freeze([
  "plant-profile",
  "recent-timeline-activity",
  "recent-manual-sensor-snapshot",
] as const);

export type AiDoctorReadinessBlockingCode =
  (typeof AI_DOCTOR_READINESS_BLOCKING_CODES)[number];

const BLOCKING_LABEL: Record<AiDoctorReadinessBlockingCode, string> =
  Object.freeze({
    "plant-profile": "a plant profile",
    "recent-timeline-activity":
      "a recent note, watering, feeding, or photo (last 7 days)",
    "recent-manual-sensor-snapshot":
      "a recent manual sensor snapshot (last 7 days)",
  });

export interface AiDoctorReadinessBlockedExplanation {
  /** Ordered blocking category codes that are actually missing. */
  blockingCodes: AiDoctorReadinessBlockingCode[];
  /** Short labels — safe for lists and inline sentences. */
  blockingLabels: string[];
  /** Full user-facing sentence naming the miss + the exact next button. */
  sentence: string;
}

export interface BuildAiDoctorReadinessBlockedExplanationArgs {
  readiness: AiDoctorContextReadiness;
  missing: readonly string[];
  /** Exact label of the CTA the grower should press next. */
  nextActionLabel: string;
}

/**
 * Deterministic, presenter-free copy for the blocked state that names
 * the exact missing evidence category AND the exact button to press.
 * Returns an empty result when readiness is not "insufficient".
 */
export function buildAiDoctorReadinessBlockedExplanation(
  args: BuildAiDoctorReadinessBlockedExplanationArgs,
): AiDoctorReadinessBlockedExplanation {
  if (args.readiness !== "insufficient") {
    return { blockingCodes: [], blockingLabels: [], sentence: "" };
  }
  const missingSet = new Set(args.missing);
  const codes: AiDoctorReadinessBlockingCode[] =
    AI_DOCTOR_READINESS_BLOCKING_CODES.filter((c) => missingSet.has(c));
  const labels = codes.map((c) => BLOCKING_LABEL[c]);

  const label = args.nextActionLabel.trim();
  const cta = label.length > 0 ? label : AI_DOCTOR_READINESS_GATE_ADD_CONTEXT_LABEL;

  let joined: string;
  if (labels.length === 0) {
    // Defensive: insufficient without any recognized blocking code.
    joined = "more context";
  } else if (labels.length === 1) {
    joined = labels[0];
  } else if (labels.length === 2) {
    joined = `${labels[0]} and ${labels[1]}`;
  } else {
    joined = `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
  }

  return {
    blockingCodes: codes,
    blockingLabels: labels,
    sentence: `AI Doctor is blocked until you add ${joined}. Tap "${cta}" to add it now.`,
  };
}
