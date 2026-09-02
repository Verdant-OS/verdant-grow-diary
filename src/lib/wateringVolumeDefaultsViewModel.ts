/**
 * wateringVolumeDefaultsViewModel — pure helper that derives a last-watering
 * volume prefill for the QuickLogV2 Water surface from recent diary rows.
 *
 * Hard rules:
 *   - Pure. No I/O. No React. No Supabase. No randomness. Deterministic.
 *   - READ-ONLY default derivation. Never writes, never submits a log.
 *   - Prefills ONLY applied volume (ml) from the plant's most recent watering
 *     that recorded a positive volume. Never invents 200 / 500 / pot-size
 *     guesses. Never reads medium or pot size.
 *   - Plant scope only. Tent/grow fallbacks are banned — another plant's
 *     volume must not leak into this form (fail closed).
 *   - Measured outcome fields beyond volume (pH, EC, runoff, water temp,
 *     manual observations) stay blank.
 *   - Demo / stale / invalid provenance is skipped when present.
 *   - Feeding rows are ignored even when they carry a solution volume.
 */

import {
  normalizeDiaryEntries,
  sortDiaryEntriesNewestFirst,
  type NormalizedDiaryEntry,
} from "./diaryEntryRules";
import {
  EMPTY_QUICKLOG_WATERING_FORM,
  type QuickLogWateringFormState,
} from "./quickLogWateringFormViewModel";

export const WATERING_VOLUME_DEFAULTS_LABEL = "Prefilled from last watering" as const;

const UNTRUSTED_PROVENANCE = new Set(["demo", "stale", "invalid", "fixture", "mock"]);

export interface WateringVolumeDefaultsInput {
  rawEntries: readonly unknown[];
  plantId?: string | null;
}

export interface WateringVolumeDefaultsResult {
  /**
   * Partial Water form state. Only `volumeMl` is populated when a safe prior
   * volume exists. Caller merges with `EMPTY_QUICKLOG_WATERING_FORM`.
   * `null` when no safe plant-scoped prior volume exists.
   */
  defaults: Pick<QuickLogWateringFormState, "volumeMl"> | null;
  sourceEntryId: string | null;
  label: typeof WATERING_VOLUME_DEFAULTS_LABEL | null;
}

const EMPTY_RESULT: WateringVolumeDefaultsResult = {
  defaults: null,
  sourceEntryId: null,
  label: null,
};

function pickString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function isWateringEntry(entry: NormalizedDiaryEntry): boolean {
  if (entry.eventType === "watering") return true;
  // Feeding rows can carry a shared solution volume — never treat them as
  // prior watering for this prefill.
  if (entry.eventType === "feeding" || entry.eventType === "feed") return false;
  // Legacy untyped watering: amount present, not tagged as feeding.
  if (entry.details.wateringAmountMl !== undefined) return true;
  return false;
}

function isUntrusted(entry: NormalizedDiaryEntry): boolean {
  const snapState = entry.details.sensorSnapshot?.state;
  if (snapState && UNTRUSTED_PROVENANCE.has(snapState.toLowerCase())) {
    return true;
  }
  const snapSource = entry.details.sensorSnapshot?.source;
  if (snapSource && UNTRUSTED_PROVENANCE.has(snapSource.toLowerCase())) {
    return true;
  }
  const extras = entry.details.extras;
  if (extras) {
    const src = pickString(extras.source);
    if (src && UNTRUSTED_PROVENANCE.has(src.toLowerCase())) return true;
    const prov = pickString(extras.provenance);
    if (prov && UNTRUSTED_PROVENANCE.has(prov.toLowerCase())) return true;
    const state = pickString(extras.state);
    if (state && UNTRUSTED_PROVENANCE.has(state.toLowerCase())) return true;
  }
  return false;
}

/**
 * Canonical volume field string: integers stay integer text ("200"), finite
 * non-integers keep a plain decimal string. Never invents a value.
 */
export function formatWateringVolumeMlForPrefill(volumeMl: number): string | null {
  if (!Number.isFinite(volumeMl) || volumeMl <= 0 || volumeMl > 1_000_000) {
    return null;
  }
  if (Number.isInteger(volumeMl)) return String(volumeMl);
  return String(volumeMl);
}

function buildFromEntry(entry: NormalizedDiaryEntry): WateringVolumeDefaultsResult | null {
  const volumeMl = entry.details.wateringAmountMl;
  if (typeof volumeMl !== "number") return null;
  const formatted = formatWateringVolumeMlForPrefill(volumeMl);
  if (formatted === null) return null;
  return {
    defaults: { volumeMl: formatted },
    sourceEntryId: entry.id,
    label: WATERING_VOLUME_DEFAULTS_LABEL,
  };
}

export function buildWateringVolumeDefaults(
  input: WateringVolumeDefaultsInput,
): WateringVolumeDefaultsResult {
  if (!input || !Array.isArray(input.rawEntries) || input.rawEntries.length === 0) {
    return EMPTY_RESULT;
  }

  const plantId = pickString(input.plantId ?? null);
  // Fail closed without an explicit plant — tent/grow volumes are not safe
  // defaults for a watering log that may target a different plant.
  if (!plantId) return EMPTY_RESULT;

  const normalized = normalizeDiaryEntries({ rawEntries: input.rawEntries });
  if (normalized.length === 0) return EMPTY_RESULT;

  const sorted = sortDiaryEntriesNewestFirst(normalized);
  for (const entry of sorted) {
    if (entry.plantId !== plantId) continue;
    if (!isWateringEntry(entry)) continue;
    if (isUntrusted(entry)) continue;
    const result = buildFromEntry(entry);
    if (result) return result;
  }

  return EMPTY_RESULT;
}

/**
 * Merge derived volume into the empty Quick Log watering form. Always returns
 * a fresh state object — never mutates `EMPTY_QUICKLOG_WATERING_FORM`.
 */
export function applyWateringVolumeDefaultsToForm(
  result: WateringVolumeDefaultsResult,
): QuickLogWateringFormState {
  if (!result.defaults) {
    return { ...EMPTY_QUICKLOG_WATERING_FORM };
  }
  return {
    ...EMPTY_QUICKLOG_WATERING_FORM,
    volumeMl: result.defaults.volumeMl,
  };
}
