/**
 * coachContextAdapter — pure helper that converts raw `diary_entries` rows
 * into AI-context-sufficiency-ready inputs by routing them through the
 * normalized diary entry rules.
 *
 * Pure & deterministic. No React. No Supabase. Used by the Coach UI so that
 * malformed details safely reduce sufficiency instead of silently disappearing,
 * and valid normalized pH/EC/watering/feeding/photo context can improve it.
 */

import {
  normalizeDiaryEntries,
  type NormalizedDiaryEntry,
} from "./diaryEntryRules";
import type {
  AiContextDiaryEntryInput,
  AiContextSensorReadingInput,
} from "./aiContextSufficiencyRules";

export interface CoachContextAdapterInput {
  rawDiaryEntries: readonly unknown[];
  growStartedAt?: string | number | Date | null;
  plantStartedAt?: string | number | Date | null;
  now?: number;
}

export interface CoachContextAdapterResult {
  recentDiaryEntries: AiContextDiaryEntryInput[];
  recentWateringOrFeeding: AiContextDiaryEntryInput[];
  /** Synthetic sensor readings derived from diary pH/EC/snapshot — safe and
   * complementary to live sensor readings. */
  diaryDerivedSensors: AiContextSensorReadingInput[];
  /** True when at least one normalized, valid diary entry carries a photo. */
  hasDiaryPhoto: boolean;
  /** Count of raw rows that failed normalization or contained malformed details. */
  malformedDiaryCount: number;
  normalizedEntries: NormalizedDiaryEntry[];
}

function isWaterOrFeedType(t: string | null | undefined): boolean {
  const s = (t ?? "").toLowerCase();
  return s.includes("water") || s.includes("feed") || s.includes("irrig");
}

export function adaptDiaryForAiContext(
  input: CoachContextAdapterInput,
): CoachContextAdapterResult {
  const normalized = normalizeDiaryEntries({
    rawEntries: Array.isArray(input?.rawDiaryEntries)
      ? input.rawDiaryEntries
      : [],
    growStartedAt: input?.growStartedAt,
    plantStartedAt: input?.plantStartedAt,
    now: input?.now,
  });

  const rawCount = Array.isArray(input?.rawDiaryEntries)
    ? input.rawDiaryEntries.length
    : 0;

  const recentDiaryEntries: AiContextDiaryEntryInput[] = [];
  const recentWateringOrFeeding: AiContextDiaryEntryInput[] = [];
  const diaryDerivedSensors: AiContextSensorReadingInput[] = [];
  let hasDiaryPhoto = false;
  let invalidNormalized = 0;

  for (const e of normalized) {
    if (!e.isValidForAiContext) {
      invalidNormalized += 1;
      continue;
    }

    recentDiaryEntries.push({ at: e.createdAt, type: e.eventType });

    const hasWaterFeed =
      isWaterOrFeedType(e.eventType) ||
      typeof e.details.wateringAmountMl === "number" ||
      (Array.isArray(e.details.nutrients) && e.details.nutrients.length > 0);
    if (hasWaterFeed) {
      recentWateringOrFeeding.push({
        at: e.createdAt,
        type: e.eventType || "water",
      });
    }

    if (e.photoUrl) hasDiaryPhoto = true;

    const ph = e.details.ph ?? e.details.sensorSnapshot?.ph;
    const ec = e.details.ec ?? e.details.sensorSnapshot?.ec;
    const snap = e.details.sensorSnapshot;
    if (ph != null || ec != null || snap) {
      diaryDerivedSensors.push({
        at: snap?.at ?? e.createdAt,
        temp: snap?.temp ?? null,
        rh: snap?.rh ?? null,
        vpd: snap?.vpd ?? null,
        ph: ph ?? null,
        ec: ec ?? null,
      });
    }
  }

  // Dropped rows (failed even to normalize) + entries flagged invalid
  // both indicate malformed diary data.
  const malformedDiaryCount =
    Math.max(0, rawCount - normalized.length) + invalidNormalized;

  return {
    recentDiaryEntries,
    recentWateringOrFeeding,
    diaryDerivedSensors,
    hasDiaryPhoto,
    malformedDiaryCount,
    normalizedEntries: normalized,
  };
}
