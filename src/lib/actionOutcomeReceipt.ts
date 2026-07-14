/**
 * actionOutcomeReceipt — stable machine-readable serialization for the
 * Post-Action Outcome Analysis receipt.
 *
 * House style (matches oneTentProofRecordExportRules):
 *   JSON.stringify(record, null, 2) + "\n"
 * Key order is fixed by object-literal construction; arrays that carry
 * prose are sorted lexically upstream; metricComparisons keep the
 * stable METRIC_ORDER. No undefined values survive serialization.
 *
 * Privacy: no user IDs, tokens, signed URLs, raw sensor payloads, or
 * provider errors — the only ID present is actionQueueId, which the
 * existing product follow-up contract already exposes.
 */

import type {
  ActionOutcomeAnalysisReceipt,
  MetricOutcomeComparison,
} from "@/lib/actionOutcomeAnalysisTypes";

export const ACTION_OUTCOME_SUMMARY_JSON_PREFIX = "ACTION_OUTCOME_SUMMARY_JSON=";

function serializeComparison(c: MetricOutcomeComparison): MetricOutcomeComparison {
  return {
    metric: c.metric,
    preValue: c.preValue,
    postValue: c.postValue,
    preTargetDistance: c.preTargetDistance,
    postTargetDistance: c.postTargetDistance,
    direction: c.direction,
    evidenceQuality: c.evidenceQuality,
    sampleCounts: { pre: c.sampleCounts.pre, post: c.sampleCounts.post },
    explanation: c.explanation,
  };
}

/**
 * Full receipt: 2-space JSON with trailing newline, stable key order.
 */
export function serializeActionOutcomeReceipt(receipt: ActionOutcomeAnalysisReceipt): string {
  const ordered = {
    schemaVersion: receipt.schemaVersion,
    actionQueueId: receipt.actionQueueId,
    classification: receipt.classification,
    confidenceScore: receipt.confidenceScore,
    confidenceLevel: receipt.confidenceLevel,
    riskLevel: receipt.riskLevel,
    growerReportedOutcome: receipt.growerReportedOutcome,
    evidenceAgreement: receipt.evidenceAgreement,
    summary: receipt.summary,
    metricComparisons: receipt.metricComparisons.map(serializeComparison),
    supportingEvidence: [...receipt.supportingEvidence].sort(),
    conflictingEvidence: [...receipt.conflictingEvidence].sort(),
    missingInformation: [...receipt.missingInformation].sort(),
    cautions: [...receipt.cautions].sort(),
    repeatNextRun: [...receipt.repeatNextRun],
    avoidNextRun: [...receipt.avoidNextRun],
    evidenceWindow: {
      actionCompletedAt: receipt.evidenceWindow.actionCompletedAt,
      preWindowStart: receipt.evidenceWindow.preWindowStart,
      preWindowEnd: receipt.evidenceWindow.preWindowEnd,
      postWindowStart: receipt.evidenceWindow.postWindowStart,
      postWindowEnd: receipt.evidenceWindow.postWindowEnd,
    },
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

export type ActionOutcomeCompactSummary = {
  schema_version: "1";
  classification: ActionOutcomeAnalysisReceipt["classification"];
  confidence_score: number;
  confidence_level: string;
  evidence_agreement: ActionOutcomeAnalysisReceipt["evidenceAgreement"];
  metric_counts: {
    improved: number;
    declined: number;
    unchanged: number;
    not_comparable: number;
  };
  missing_information_count: number;
};

export function buildActionOutcomeCompactSummary(
  receipt: ActionOutcomeAnalysisReceipt,
): ActionOutcomeCompactSummary {
  const counts = { improved: 0, declined: 0, unchanged: 0, not_comparable: 0 };
  for (const c of receipt.metricComparisons) counts[c.direction] += 1;
  return {
    schema_version: "1",
    classification: receipt.classification,
    confidence_score: receipt.confidenceScore,
    confidence_level: receipt.confidenceLevel,
    evidence_agreement: receipt.evidenceAgreement,
    metric_counts: counts,
    missing_information_count: receipt.missingInformation.length,
  };
}

/** One compact operator line: ACTION_OUTCOME_SUMMARY_JSON={...}. */
export function renderActionOutcomeSummaryLine(receipt: ActionOutcomeAnalysisReceipt): string {
  return `${ACTION_OUTCOME_SUMMARY_JSON_PREFIX}${JSON.stringify(
    buildActionOutcomeCompactSummary(receipt),
  )}`;
}
