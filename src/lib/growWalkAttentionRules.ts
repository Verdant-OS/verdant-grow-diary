import type {
  GrowWalkAttentionBand,
  GrowWalkEvidenceDerivation,
  GrowWalkTarget,
} from "./growWalkContracts";

const ATTENTION_RANK: Readonly<Record<GrowWalkAttentionBand, number>> = {
  immediate_physical_verification: 0,
  watch_today: 1,
  routine_observation: 2,
  insufficient_evidence: 3,
};

const ALERT_SEVERITY_RANK: Readonly<Record<"high" | "medium" | "low", number>> = {
  high: 0,
  medium: 1,
  low: 2,
};

function hasReason(
  input: GrowWalkEvidenceDerivation,
  reason: GrowWalkEvidenceDerivation["reasonCodes"][number],
): boolean {
  return input.reasonCodes.includes(reason);
}

/**
 * Convert evidence reason codes into a scouting priority. The result controls
 * inspection order only; it is not a diagnosis or authorization to change the grow.
 */
export function deriveGrowWalkAttentionBand(
  input: GrowWalkEvidenceDerivation,
): GrowWalkAttentionBand {
  if (input.contradictionCodes.includes("scope_relationship_invalid")) {
    return "insufficient_evidence";
  }

  const corroboratedAdverse = hasReason(input, "multiple_adverse_evidence_lanes");
  const highAlert = hasReason(input, "active_high_alert_needs_confirmation");
  const worsening = hasReason(input, "worsening_observation");

  if (corroboratedAdverse && (highAlert || worsening)) {
    return "immediate_physical_verification";
  }

  if (input.reasonCodes.length > 0) {
    return "watch_today";
  }

  if (input.evidenceConfidence === "low") {
    return "insufficient_evidence";
  }

  return "routine_observation";
}

function alertRank(severity: GrowWalkTarget["highestAlertSeverity"]): number {
  return severity === null ? 3 : ALERT_SEVERITY_RANK[severity];
}

function timestampMs(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compareAdverseRecency(left: string | null, right: string | null): number {
  const leftMs = timestampMs(left);
  const rightMs = timestampMs(right);
  if (leftMs === null && rightMs === null) return 0;
  if (leftMs === null) return 1;
  if (rightMs === null) return -1;
  return rightMs - leftMs;
}

/** Stable, non-mutating target ordering for the grower's physical walk. */
export function sortGrowWalkTargets(
  targets: readonly GrowWalkTarget[],
): readonly GrowWalkTarget[] {
  return Object.freeze(
    [...targets].sort((left, right) => {
      const attention = ATTENTION_RANK[left.attentionBand] - ATTENTION_RANK[right.attentionBand];
      if (attention !== 0) return attention;

      const severity = alertRank(left.highestAlertSeverity) - alertRank(right.highestAlertSeverity);
      if (severity !== 0) return severity;

      const recency = compareAdverseRecency(
        left.latestAdverseEvidenceAt,
        right.latestAdverseEvidenceAt,
      );
      if (recency !== 0) return recency;

      const name = left.displayName.localeCompare(right.displayName, "en", {
        sensitivity: "base",
      });
      if (name !== 0) return name;

      return left.targetId.localeCompare(right.targetId, "en", { sensitivity: "base" });
    }),
  );
}
