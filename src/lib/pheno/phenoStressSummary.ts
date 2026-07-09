/**
 * Pure aggregation for the per-candidate PHENOHUNT stress summary card.
 *
 * Takes owner-scoped rows already loaded via the API and produces a compact
 * summary per candidate: planned vs observed counts, most-recent factor and
 * intensity, current recommendation label, key notes preview, and a linked
 * diary evidence indicator.
 */
import type { PhenoStressObservationRow } from "./phenoStressObservationsApi";

export interface PhenoStressSummary {
  readonly plantId: string;
  readonly plannedCount: number;
  readonly observedCount: number;
  readonly mostRecentFactor: string | null;
  readonly mostRecentIntensity: string | null;
  readonly currentRecommendation: string | null;
  readonly keyNotesPreview: string;
  readonly hasDiaryEvidence: boolean;
}

const KEY_NOTES_MAX = 120;

function truncate(raw: string, max = KEY_NOTES_MAX): string {
  const trimmed = raw.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

/** Empty summary shell for candidates with no observations yet. */
export function emptyStressSummary(plantId: string): PhenoStressSummary {
  return {
    plantId,
    plannedCount: 0,
    observedCount: 0,
    mostRecentFactor: null,
    mostRecentIntensity: null,
    currentRecommendation: null,
    keyNotesPreview: "",
    hasDiaryEvidence: false,
  };
}

export function summarizeStressForCandidate(
  plantId: string,
  rows: readonly PhenoStressObservationRow[],
): PhenoStressSummary {
  const own = rows.filter((r) => r.plantId === plantId);
  if (own.length === 0) return emptyStressSummary(plantId);

  const sorted = [...own].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const latest = sorted[0];
  const plannedCount = own.filter((r) => r.status === "planned").length;
  const observedCount = own.filter((r) => r.status === "observed").length;
  const notesSource = [latest.plantResponse, latest.notes, latest.recoveryNotes]
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .join(" · ");

  return {
    plantId,
    plannedCount,
    observedCount,
    mostRecentFactor: latest.stressFactor,
    mostRecentIntensity: latest.intensity,
    currentRecommendation: latest.recommendation,
    keyNotesPreview: truncate(notesSource),
    hasDiaryEvidence: own.some((r) => r.linkedDiaryEntryId != null),
  };
}
