/**
 * actionOutcomeAnalysisTypes — Post-Action Outcome Analysis Engine V1.
 *
 * Shared types for the deterministic engine that compares evidence
 * before and after a completed Action Queue item and produces a
 * cautious learning receipt.
 *
 * Doctrine (see docs/action-outcome-analysis-v1.md):
 *  - The grower-reported outcome is never rewritten; the system's
 *    evidence comparison is a SEPARATE concept that can only agree,
 *    partially agree, conflict, or be not comparable.
 *  - Demo / stale / invalid / unknown telemetry never counts as
 *    healthy evidence. Manual stays Manual; CSV stays CSV.
 *  - Missing evidence reduces confidence. One reading never proves
 *    causation.
 *
 * Pure types only. No React, no I/O, no Supabase imports.
 */

import type { SensorSource } from "@/lib/sensor/sensorSourceRules";

export type ActionOutcomeClassification =
  "improved" | "unchanged" | "declined" | "mixed" | "insufficient_evidence";

export type OutcomeAgreement =
  "agrees" | "partially_agrees" | "conflicts" | "not_comparable" | "no_grower_outcome";

export type EvidenceQuality = "high" | "medium" | "low" | "unusable";

export type OutcomeRiskLevel = "low" | "watch" | "high";

export type MetricDirection = "improved" | "declined" | "unchanged" | "not_comparable";

/**
 * Engine metric slots. Mapping from repo sensor metrics (long-format
 * sensor_readings.metric) is fixed in actionOutcomeEvidenceRules:
 *   temperature_c → temperature_f (converted via temperatureUnits)
 *   humidity_pct  → humidity_pct
 *   vpd_kpa       → vpd_kpa
 *   soil_moisture_pct → soil_moisture_pct
 *   ec            → soil_ec (canonical mS/cm)
 *   co2_ppm       → co2_ppm
 *   ppfd          → ppfd
 *   ph            → reservoir_ph
 * reservoir_ec has no repo sensor metric in V1 — the slot exists for
 * forward compatibility and is never fabricated.
 */
export type OutcomeMetricName =
  | "temperature_f"
  | "humidity_pct"
  | "vpd_kpa"
  | "soil_moisture_pct"
  | "soil_ec"
  | "co2_ppm"
  | "ppfd"
  | "reservoir_ph"
  | "reservoir_ec";

export type NormalizedOutcomeMetric = {
  metric: OutcomeMetricName;
  value: number;
  /** ISO timestamp (sensor_readings.captured_at). */
  capturedAt: string;
  source: SensorSource;
  /** sensor_readings.quality ("ok" | "degraded" | "stale" | "invalid") or null. */
  confidence: string | null;
  tentId: string;
  plantId: string | null;
};

export type NormalizedDiaryEvidence = {
  eventType: string;
  occurredAt: string;
  note: string;
  plantId: string | null;
  tentId: string | null;
  actionQueueId: string | null;
};

export type NormalizedGrowTargets = {
  growId: string;
  /** All bands in ENGINE units (temperature converted to °F). */
  bands: Partial<Record<OutcomeMetricName, { min: number | null; max: number | null }>>;
};

/** Minimal verified-action shape the engine needs. Never raw DB rows. */
export type VerifiedCompletedAction = {
  actionQueueId: string;
  status: "completed";
  completedAt: string;
  growId: string;
  tentId: string | null;
  plantId: string | null;
  actionType: string | null;
  targetMetric: string | null;
  suggestedChange: string | null;
  reason: string;
};

export type GrowerActionFollowUpOutcome =
  "improved" | "unchanged" | "declined" | "too_soon" | "unclear";

export type GrowerActionFollowUp = {
  actionQueueId: string;
  outcome: GrowerActionFollowUpOutcome | null;
  observedAt: string | null;
  note: string | null;
};

export type OutcomeEvidenceWindow = {
  start: string;
  end: string;
  elapsedHours: number;
  metrics: NormalizedOutcomeMetric[];
  diaryEvidence: NormalizedDiaryEvidence[];
  quality: EvidenceQuality;
};

export type ActionOutcomeEvidenceBundle = {
  action: VerifiedCompletedAction;
  followUp: GrowerActionFollowUp | null;
  preAction: OutcomeEvidenceWindow;
  postAction: OutcomeEvidenceWindow;
  growTargets: NormalizedGrowTargets | null;
  recentDiaryEvidence: NormalizedDiaryEvidence[];
  missingInformation: string[];
};

export type MetricOutcomeComparison = {
  metric: OutcomeMetricName;
  preValue: number | null;
  postValue: number | null;
  preTargetDistance: number | null;
  postTargetDistance: number | null;
  direction: MetricDirection;
  evidenceQuality: EvidenceQuality;
  sampleCounts: {
    pre: number;
    post: number;
  };
  explanation: string;
};

export type ActionOutcomeAnalysisReceipt = {
  schemaVersion: "1";
  actionQueueId: string;
  classification: ActionOutcomeClassification;
  confidenceScore: number;
  confidenceLevel: "low" | "medium" | "high";
  riskLevel: OutcomeRiskLevel;
  growerReportedOutcome: GrowerActionFollowUpOutcome | null;
  evidenceAgreement: OutcomeAgreement;
  summary: string;
  metricComparisons: MetricOutcomeComparison[];
  supportingEvidence: string[];
  conflictingEvidence: string[];
  missingInformation: string[];
  cautions: string[];
  repeatNextRun: string[];
  avoidNextRun: string[];
  evidenceWindow: {
    actionCompletedAt: string;
    preWindowStart: string;
    preWindowEnd: string;
    postWindowStart: string;
    postWindowEnd: string;
  };
};
