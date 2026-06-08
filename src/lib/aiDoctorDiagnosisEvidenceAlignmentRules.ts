/**
 * aiDoctorDiagnosisEvidenceAlignmentRules — pure, deterministic logic that
 * aligns the AI Doctor diagnosis/result card with the same source-evidence
 * model surfaced in the "Evidence used" panel.
 *
 * Hard constraints:
 *  - Pure: no React, no Supabase, no I/O, no model calls.
 *  - Local/test Environment Check evidence MUST NEVER produce "strong" posture.
 *  - Recommendation wording stays cautious / approval-only. No automation,
 *    no device control verbs.
 *  - Visible copy must not echo tokens, user_id, service_role, bridge
 *    tokens, auth headers, or raw internal IDs.
 */

export type RecommendationPosture =
  | "strong_context"
  | "moderate_context"
  | "weak_context"
  | "insufficient_context";

export interface DiagnosisEvidenceAlignmentInput {
  /** True when there is any live sensor evidence slot. */
  hasLiveSensor: boolean;
  /** True when live sensor has at least one usable metric (not stale/invalid). */
  liveSensorUsable: boolean;
  /** True when an Environment Check (local EcoWitt validation) is present. */
  envCheckPresent: boolean;
  envCheckAcceptedCount: number;
  envCheckRejectedCount: number;
  envCheckNotCheckedCount: number;
  /** True when VPD (or any derived metric) is used as context. */
  envCheckHasDerivedVpd: boolean;
  /** True when at least one recent diary/log entry exists. */
  hasRecentDiary: boolean;
  /** True when at least one recent photo exists. */
  hasRecentPhotos: boolean;
  /** Count of remaining "needed" items on the more-data-needed checklist. */
  moreDataNeededCount: number;
}

export interface DiagnosisEvidenceAlignmentVM {
  posture: RecommendationPosture;
  postureLabel: string;
  postureCopy: string;
  /** Plain-language bullets explaining the evidence basis. */
  basisCopy: string[];
  /** Aggressive-changes guardrail, null when posture is strong. */
  guardrailWarning: string | null;
  /** Reminder pointing operator at the Evidence Used checklist. */
  moreDataReminder: string | null;
  /** Cautious verbs presenters should prefer in recommendation phrasing. */
  preferredVerbs: readonly string[];
}

export const POSTURE_LABELS: Record<RecommendationPosture, string> = {
  strong_context: "Strong context",
  moderate_context: "Moderate context",
  weak_context: "Weak context",
  insufficient_context: "Insufficient context",
};

export const POSTURE_COPY: Record<RecommendationPosture, string> = {
  strong_context: "AI Doctor has multiple supporting evidence sources.",
  moderate_context:
    "AI Doctor has useful context, but live telemetry is limited or missing.",
  weak_context:
    "AI Doctor has limited or mixed evidence. Avoid aggressive changes.",
  insufficient_context:
    "More data is needed before giving strong guidance.",
};

export const AGGRESSIVE_CHANGES_GUARDRAIL =
  "Do not make aggressive nutrient, irrigation, or equipment changes from this evidence alone.";

const CAUTIOUS_VERBS_WEAK = [
  "review",
  "monitor",
  "capture more data",
  "confirm",
  "wait 24 hours",
  "check trend",
] as const;

const CAUTIOUS_VERBS_MODERATE = ["review", "monitor", "confirm"] as const;

const CAUTIOUS_VERBS_STRONG: readonly string[] = [];

/**
 * Map evidence quality to a recommendation posture.
 *
 * Rules:
 *  - Live sensor (usable) + accepted Environment Check + recent diary/photo
 *    → strong_context
 *  - Accepted Environment Check, no live sensor → max moderate_context
 *  - Mixed / rejected / not_checked Environment Check → max weak_context
 *  - No usable sensor/env-check/diary/photo → insufficient_context
 *  - Local/test-only evidence NEVER produces strong_context.
 */
export function computeRecommendationPosture(
  i: DiagnosisEvidenceAlignmentInput,
): RecommendationPosture {
  const envAcceptedClean =
    i.envCheckPresent &&
    i.envCheckAcceptedCount > 0 &&
    i.envCheckRejectedCount === 0 &&
    i.envCheckNotCheckedCount === 0;
  const envMixedOrBad =
    i.envCheckPresent &&
    (i.envCheckRejectedCount > 0 || i.envCheckNotCheckedCount > 0);

  // Insufficient: nothing usable at all.
  if (
    !i.liveSensorUsable &&
    !i.envCheckPresent &&
    !i.hasRecentDiary &&
    !i.hasRecentPhotos
  ) {
    return "insufficient_context";
  }

  // Weak: mixed/rejected/not_checked env check caps posture at weak.
  if (envMixedOrBad) return "weak_context";

  // Strong: live + clean env check + at least one diary or photo signal.
  if (
    i.liveSensorUsable &&
    envAcceptedClean &&
    (i.hasRecentDiary || i.hasRecentPhotos)
  ) {
    return "strong_context";
  }

  // Accepted env check, no live → moderate cap.
  if (envAcceptedClean && !i.liveSensorUsable) return "moderate_context";

  // Live usable but missing env check or supporting logs → moderate.
  if (i.liveSensorUsable) return "moderate_context";

  // Diary/photos only, no sensor/env-check signals → weak.
  return "weak_context";
}

function buildBasisCopy(i: DiagnosisEvidenceAlignmentInput): string[] {
  const out: string[] = [];
  if (!i.liveSensorUsable) {
    out.push("No recent live sensor readings were available.");
  }
  if (i.envCheckPresent && !i.liveSensorUsable) {
    out.push(
      "This guidance is based on a local EcoWitt Environment Check, not live telemetry.",
    );
  }
  if (
    i.envCheckPresent &&
    (i.envCheckRejectedCount > 0 || i.envCheckNotCheckedCount > 0)
  ) {
    out.push(
      "Some metrics were rejected or not checked, so recommendations should stay conservative.",
    );
  }
  if (i.envCheckPresent && i.envCheckHasDerivedVpd) {
    out.push("VPD was used as derived context, not as a raw sensor reading.");
  }
  if (!i.hasRecentDiary && !i.hasRecentPhotos) {
    out.push("No recent diary or photo evidence was available.");
  }
  if (!i.envCheckPresent && !i.liveSensorUsable) {
    out.push("More data is needed before giving high-confidence guidance.");
  }
  return out;
}

function preferredVerbsFor(p: RecommendationPosture): readonly string[] {
  if (p === "strong_context") return CAUTIOUS_VERBS_STRONG;
  if (p === "moderate_context") return CAUTIOUS_VERBS_MODERATE;
  return CAUTIOUS_VERBS_WEAK;
}

export function buildDiagnosisEvidenceAlignmentVM(
  input: DiagnosisEvidenceAlignmentInput,
): DiagnosisEvidenceAlignmentVM {
  const posture = computeRecommendationPosture(input);
  const basisCopy = buildBasisCopy(input);
  const guardrailWarning =
    posture === "weak_context" || posture === "insufficient_context"
      ? AGGRESSIVE_CHANGES_GUARDRAIL
      : null;
  const moreDataReminder =
    input.moreDataNeededCount > 0
      ? `Before acting, capture the missing Environment Check metrics listed below (${input.moreDataNeededCount} item${input.moreDataNeededCount === 1 ? "" : "s"}).`
      : null;
  return {
    posture,
    postureLabel: POSTURE_LABELS[posture],
    postureCopy: POSTURE_COPY[posture],
    basisCopy,
    guardrailWarning,
    moreDataReminder,
    preferredVerbs: preferredVerbsFor(posture),
  };
}
