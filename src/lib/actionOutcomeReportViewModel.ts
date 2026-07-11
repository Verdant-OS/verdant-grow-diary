/**
 * actionOutcomeReportViewModel — read-only projection of the analysis
 * receipt for later UI/report integration.
 *
 * No React. Not wired into ActionDetail (Lovable's active surface).
 * Pure string labeling only — every judgment already lives in the
 * receipt; this module never re-decides anything.
 */

import type {
  ActionOutcomeAnalysisReceipt,
  MetricOutcomeComparison,
} from "@/lib/actionOutcomeAnalysisTypes";

export type MetricOutcomeReportRow = {
  metricLabel: string;
  directionLabel: string;
  preValue: string;
  postValue: string;
  qualityLabel: string;
  explanation: string;
};

export type ActionOutcomeReportViewModel = {
  title: string;
  classificationLabel: string;
  confidenceLabel: string;
  growerOutcomeLabel: string | null;
  agreementLabel: string;
  summary: string;
  metrics: MetricOutcomeReportRow[];
  evidenceItems: string[];
  conflicts: string[];
  missingInformation: string[];
  repeatNextRun: string[];
  avoidNextRun: string[];
  cautions: string[];
};

const CLASSIFICATION_LABELS: Record<ActionOutcomeAnalysisReceipt["classification"], string> = {
  improved: "Evidence improved",
  unchanged: "No clear change",
  declined: "Evidence declined",
  mixed: "Mixed evidence",
  insufficient_evidence: "Not enough evidence",
};

const AGREEMENT_LABELS: Record<ActionOutcomeAnalysisReceipt["evidenceAgreement"], string> = {
  agrees: "Grower and evidence agree",
  partially_agrees: "Grower and evidence partially agree",
  conflicts: "Grower and evidence disagree — more evidence needed",
  not_comparable: "Not directly comparable",
  no_grower_outcome: "No grower outcome recorded yet",
};

const GROWER_OUTCOME_LABELS: Record<string, string> = {
  improved: "Improved",
  unchanged: "No clear change",
  declined: "Declined",
  too_soon: "Too soon to tell",
  unclear: "Unclear",
};

const METRIC_LABELS: Record<string, string> = {
  temperature_f: "Temperature (°F)",
  humidity_pct: "Humidity (%)",
  vpd_kpa: "VPD (kPa)",
  soil_moisture_pct: "Soil moisture (%)",
  soil_ec: "Soil EC (mS/cm)",
  co2_ppm: "CO₂ (ppm)",
  ppfd: "PPFD (µmol/m²/s)",
  reservoir_ph: "pH",
  reservoir_ec: "Reservoir EC (mS/cm)",
};

const DIRECTION_LABELS: Record<MetricOutcomeComparison["direction"], string> = {
  improved: "Improved",
  declined: "Declined",
  unchanged: "Unchanged",
  not_comparable: "Not comparable",
};

const QUALITY_LABELS: Record<MetricOutcomeComparison["evidenceQuality"], string> = {
  high: "High-quality evidence",
  medium: "Moderate evidence",
  low: "Limited evidence",
  unusable: "Unusable evidence",
};

function formatValue(value: number | null): string {
  if (value === null) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function buildActionOutcomeReportViewModel(
  receipt: ActionOutcomeAnalysisReceipt,
): ActionOutcomeReportViewModel {
  return {
    title: "Post-action outcome analysis",
    classificationLabel: CLASSIFICATION_LABELS[receipt.classification],
    confidenceLabel: `${receipt.confidenceLevel[0].toUpperCase()}${receipt.confidenceLevel.slice(1)} confidence (${receipt.confidenceScore}/100)`,
    growerOutcomeLabel: receipt.growerReportedOutcome
      ? (GROWER_OUTCOME_LABELS[receipt.growerReportedOutcome] ?? null)
      : null,
    agreementLabel: AGREEMENT_LABELS[receipt.evidenceAgreement],
    summary: receipt.summary,
    metrics: receipt.metricComparisons.map((c) => ({
      metricLabel: METRIC_LABELS[c.metric] ?? c.metric,
      directionLabel: DIRECTION_LABELS[c.direction],
      preValue: formatValue(c.preValue),
      postValue: formatValue(c.postValue),
      qualityLabel: QUALITY_LABELS[c.evidenceQuality],
      explanation: c.explanation,
    })),
    evidenceItems: [...receipt.supportingEvidence],
    conflicts: [...receipt.conflictingEvidence],
    missingInformation: [...receipt.missingInformation],
    repeatNextRun: [...receipt.repeatNextRun],
    avoidNextRun: [...receipt.avoidNextRun],
    cautions: [...receipt.cautions],
  };
}
