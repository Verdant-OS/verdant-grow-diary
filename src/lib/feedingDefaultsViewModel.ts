/**
 * feedingDefaultsViewModel — pure helper that derives a last-feeding
 * recipe prefill for the QuickLogV2 Feed surface from recent diary rows.
 *
 * Hard rules:
 *   - Pure. No I/O. No React. No Supabase. No randomness. Deterministic.
 *   - READ-ONLY default derivation. Never writes, never submits a log.
 *   - Prefills ONLY the last same-plant feeding recipe: `lineId` + `products`
 *     (name / amount string / unit). Never invents a recipe, manufacturer
 *     chart, or Advanced Nutrients schedule.
 *   - Measured outcome fields (pH, EC in/out, runoff *, water temp) stay blank.
 *   - Plant scope only. Tent/grow fallbacks are banned — another plant's
 *     recipe must not leak into this form (fail closed).
 *   - Demo / stale / invalid provenance is skipped when present.
 *   - Missing / malformed recipes are ignored. Watering rows are ignored.
 */

import {
  normalizeDiaryEntries,
  sortDiaryEntriesNewestFirst,
  type NormalizedDiaryEntry,
} from "./diaryEntryRules";
import {
  EMPTY_QUICKLOG_FEEDING_FORM,
  FEEDING_FORM_DEFAULT_UNIT,
  type QuickLogFeedingFormProductRow,
  type QuickLogFeedingFormState,
} from "./quickLogFeedingFormViewModel";

export const FEEDING_DEFAULTS_LABEL = "Prefilled from last feeding" as const;

const UNTRUSTED_PROVENANCE = new Set(["demo", "stale", "invalid", "fixture", "mock"]);

export type FeedingDefaultsScope = "plant";

export interface FeedingDefaultsInput {
  rawEntries: readonly unknown[];
  plantId?: string | null;
}

export interface FeedingDefaultsResult {
  /**
   * Partial Quick Log Feeding form state. Only `lineId` + `products` are
   * populated. Caller merges with `EMPTY_QUICKLOG_FEEDING_FORM` to render.
   * `null` when no safe plant-scoped prior recipe exists.
   */
  defaults: Pick<QuickLogFeedingFormState, "lineId" | "products"> | null;
  scope: FeedingDefaultsScope | null;
  sourceEntryId: string | null;
  label: typeof FEEDING_DEFAULTS_LABEL | null;
}

const EMPTY_RESULT: FeedingDefaultsResult = {
  defaults: null,
  scope: null,
  sourceEntryId: null,
  label: null,
};

function isFeedingEntry(entry: NormalizedDiaryEntry): boolean {
  if (entry.eventType === "feeding" || entry.eventType === "feed") return true;
  // Legacy untyped feeding: had nutrients but wasn't tagged as watering.
  if (
    entry.eventType !== "watering" &&
    entry.details.nutrients &&
    entry.details.nutrients.length > 0
  ) {
    return true;
  }
  return false;
}

function pickString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function resolveLineId(entry: NormalizedDiaryEntry): string | null {
  const extras = entry.details.extras;
  if (!extras) return null;
  return (
    pickString(extras.nutrient_line_id) ??
    pickString(extras.nutrientLineId) ??
    pickString(extras.line_id) ??
    pickString(extras.lineId) ??
    null
  );
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

function toProductRows(entry: NormalizedDiaryEntry): QuickLogFeedingFormProductRow[] {
  const src = entry.details.nutrients ?? [];
  const rows: QuickLogFeedingFormProductRow[] = [];
  for (const n of src) {
    const name = pickString(n.name);
    if (!name) continue;
    const amount =
      typeof n.amount === "number" && Number.isFinite(n.amount) ? String(n.amount) : "";
    const unit = pickString(n.unit) ?? FEEDING_FORM_DEFAULT_UNIT;
    rows.push({ name, amount, unit });
  }
  return rows;
}

function buildFromEntry(entry: NormalizedDiaryEntry): FeedingDefaultsResult | null {
  const lineId = resolveLineId(entry);
  if (!lineId) return null;
  const products = toProductRows(entry);
  if (products.length === 0) return null;
  return {
    defaults: { lineId, products },
    scope: "plant",
    sourceEntryId: entry.id,
    label: FEEDING_DEFAULTS_LABEL,
  };
}

export function buildFeedingDefaults(input: FeedingDefaultsInput): FeedingDefaultsResult {
  if (!input || !Array.isArray(input.rawEntries) || input.rawEntries.length === 0) {
    return EMPTY_RESULT;
  }

  const plantId = pickString(input.plantId ?? null);
  // Fail closed without an explicit plant — tent/grow recipes are not safe
  // defaults for a feeding log that may target a different plant.
  if (!plantId) return EMPTY_RESULT;

  const normalized = normalizeDiaryEntries({ rawEntries: input.rawEntries });
  if (normalized.length === 0) return EMPTY_RESULT;

  const sorted = sortDiaryEntriesNewestFirst(normalized);
  for (const entry of sorted) {
    if (entry.plantId !== plantId) continue;
    if (!isFeedingEntry(entry)) continue;
    if (isUntrusted(entry)) continue;
    const result = buildFromEntry(entry);
    if (result) return result;
  }

  return EMPTY_RESULT;
}

/**
 * Merge derived defaults into the empty Quick Log feeding form. Always
 * returns a fresh state object — never mutates `EMPTY_QUICKLOG_FEEDING_FORM`.
 */
export function applyFeedingDefaultsToForm(
  result: FeedingDefaultsResult,
): QuickLogFeedingFormState {
  if (!result.defaults) {
    return {
      ...EMPTY_QUICKLOG_FEEDING_FORM,
      products: EMPTY_QUICKLOG_FEEDING_FORM.products.map((r) => ({ ...r })),
    };
  }
  return {
    ...EMPTY_QUICKLOG_FEEDING_FORM,
    lineId: result.defaults.lineId,
    products: result.defaults.products.map((r) => ({ ...r })),
  };
}
