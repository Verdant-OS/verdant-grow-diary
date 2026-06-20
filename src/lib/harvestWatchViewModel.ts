/**
 * harvestWatchViewModel — pure presenter helper for Harvest Watch comparison
 * rows. Consumes `harvestWatchRules` outputs and shapes a deterministic
 * row view-model. No React, no Supabase, no I/O, no AI.
 */

import {
  calculateReadinessScore,
  deriveDrybackVisibility,
  deriveTrichomePlaceholder,
  evaluateHarvestWatchEvidenceGate,
  evaluatePhotoPrompt,
  HARVEST_WATCH_CONFIDENCE_LABEL,
  predictHarvestWindow,
  type DrybackVisibility,
  type HarvestWatchConfidence,
  type HarvestWatchInput,
  type HarvestWindowPrediction,
  type PhotoPromptState,
  type ReadinessScore,
  type TrichomePlaceholderResult,
} from "@/lib/harvestWatchRules";

export type HarvestWatchTrend = "approaching" | "holding" | "early" | "unknown";

export interface HarvestWatchRowViewModel {
  plantId: string;
  plantLabel: string;
  phenotypeLabel: string;
  daysInFlower: number | null;

  readiness: ReadinessScore;
  readinessDisplay: string;

  daysVsHistory: {
    delta: number | null;
    label: string;
  };

  dryback: DrybackVisibility;
  harvestWindow: HarvestWindowPrediction;
  harvestWindowLabel: string;
  confidenceLabel: string;

  lastPhotoAgeDays: number | null;
  lastPhotoLabel: string;
  photoPrompt: PhotoPromptState;

  trend: HarvestWatchTrend;
  trichome: TrichomePlaceholderResult;
}

const UNKNOWN_PHENOTYPE = "Unknown phenotype";

function formatReadiness(r: ReadinessScore): string {
  if (r.score == null) return r.gatedReason ?? "Not available";
  return `${Math.round(r.score * 100)} / 100`;
}

function computeDaysVsHistory(
  daysInFlower: number | null,
  expected: number | null,
): { delta: number | null; label: string } {
  if (
    typeof daysInFlower !== "number" ||
    !Number.isFinite(daysInFlower) ||
    typeof expected !== "number" ||
    !Number.isFinite(expected) ||
    expected <= 0
  ) {
    return { delta: null, label: "No phenotype history yet" };
  }
  const delta = Math.round(daysInFlower - expected);
  if (delta === 0) return { delta, label: "On historical average" };
  if (delta > 0) return { delta, label: `${delta}d past historical average` };
  return { delta, label: `${Math.abs(delta)}d before historical average` };
}

function deriveTrend(
  readiness: ReadinessScore,
  window: HarvestWindowPrediction,
  daysInFlower: number | null,
): HarvestWatchTrend {
  if (readiness.score == null) return "unknown";
  if (typeof daysInFlower !== "number" || !Number.isFinite(daysInFlower)) {
    return "unknown";
  }
  if (daysInFlower >= window.startDay) {
    return readiness.score >= 0.75 ? "approaching" : "holding";
  }
  return "early";
}

function lastPhotoAge(now: Date, lastPhotoAt: string | null): number | null {
  if (typeof lastPhotoAt !== "string" || lastPhotoAt.length === 0) return null;
  const t = Date.parse(lastPhotoAt);
  if (!Number.isFinite(t)) return null;
  const ms = now.getTime() - t;
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export function buildHarvestWatchRowViewModel(
  input: HarvestWatchInput,
): HarvestWatchRowViewModel {
  const readiness = calculateReadinessScore(input);
  const dryback = deriveDrybackVisibility(input);
  const harvestWindow = predictHarvestWindow(input);
  const photoPrompt = evaluatePhotoPrompt(input.lastPhotoAt, input.now);
  const trichome = deriveTrichomePlaceholder(input.trichome ?? null);
  const daysVsHistory = computeDaysVsHistory(
    input.daysInFlower,
    input.expectedHarvestDay,
  );
  const ageDays = lastPhotoAge(input.now, input.lastPhotoAt);

  // Confidence label reflects the weakest of the row's primary signals.
  const confidenceRank: Record<HarvestWatchConfidence, number> = {
    low: 0,
    medium: 1,
    high: 2,
  };
  const candidates: HarvestWatchConfidence[] = [
    dryback.confidence,
    harvestWindow.confidence,
  ];
  const weakest = candidates.reduce<HarvestWatchConfidence>(
    (acc, c) => (confidenceRank[c] < confidenceRank[acc] ? c : acc),
    "high",
  );

  // Apply photo-prompt confidence penalty by downgrading the label, not the
  // raw component scores (which are owned by upstream helpers).
  const penalty = photoPrompt.confidencePenalty;
  const downgraded: HarvestWatchConfidence =
    penalty >= 0.25 ? "low" : penalty >= 0.1 && weakest === "high" ? "medium" : weakest;

  return {
    plantId: input.plantId,
    plantLabel: input.plantLabel,
    phenotypeLabel: input.phenotypeLabel?.trim() || UNKNOWN_PHENOTYPE,
    daysInFlower:
      typeof input.daysInFlower === "number" && Number.isFinite(input.daysInFlower)
        ? input.daysInFlower
        : null,
    readiness,
    readinessDisplay: formatReadiness(readiness),
    daysVsHistory,
    dryback,
    harvestWindow,
    harvestWindowLabel: `Day ${harvestWindow.startDay}–${harvestWindow.endDay}`,
    confidenceLabel: HARVEST_WATCH_CONFIDENCE_LABEL[downgraded],
    lastPhotoAgeDays: ageDays,
    lastPhotoLabel:
      ageDays == null
        ? "No photos yet"
        : ageDays === 0
          ? "Photo today"
          : `${ageDays}d since last photo`,
    photoPrompt,
    trend: deriveTrend(readiness, harvestWindow, input.daysInFlower),
    trichome,
  };
}

// Re-export the evidence gate for downstream consumers who only need the gate.
export { evaluateHarvestWatchEvidenceGate };
