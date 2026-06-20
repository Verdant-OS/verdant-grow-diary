/**
 * feedingDefaultsViewModel — pure helper that derives "last used" feeding
 * defaults for the QuickLogV2 Feed surface from recent diary rows.
 *
 * Hard rules:
 *   - Pure. No I/O. No React. No Supabase. No randomness. No time injection
 *     required (deterministic regardless of input order).
 *   - READ-ONLY default derivation. Never writes, never normalizes the save
 *     path, never invents products or doses.
 *   - Only prefills SAFE REPEAT fields: `lineId` + `products` (name / amount
 *     string / unit). Measured outcome fields (pH, EC in/out, runoff *,
 *     water temp) are ALWAYS left blank in the returned defaults.
 *   - Demo / stale / invalid rows are skipped when their provenance is
 *     present in `details.extras.source` / `details.sensorSnapshot.state`.
 *   - Malformed details / non-feeding events / amount-less products are
 *     ignored.
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

const UNTRUSTED_PROVENANCE = new Set([
  "demo",
  "stale",
  "invalid",
  "fixture",
  "mock",
]);

export type FeedingDefaultsScope = "plant" | "tent" | "grow";

export interface FeedingDefaultsInput {
  rawEntries: readonly unknown[];
  plantId?: string | null;
  tentId?: string | null;
  growId?: string | null;
}

export interface FeedingDefaultsResult {
  /**
   * Partial Quick Log Feeding form state. Only `lineId` + `products` are
   * populated. Caller merges with `EMPTY_QUICKLOG_FEEDING_FORM` to render.
   * `null` when no safe default exists.
   */
  defaults:
    | (Pick<QuickLogFeedingFormState, "lineId" | "products">)
    | null;
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

function toProductRows(
  entry: NormalizedDiaryEntry,
): QuickLogFeedingFormProductRow[] {
  const src = entry.details.nutrients ?? [];
  const rows: QuickLogFeedingFormProductRow[] = [];
  for (const n of src) {
    const name = pickString(n.name);
    if (!name) continue;
    const amount =
      typeof n.amount === "number" && Number.isFinite(n.amount)
        ? String(n.amount)
        : "";
    const unit = pickString(n.unit) ?? FEEDING_FORM_DEFAULT_UNIT;
    rows.push({ name, amount, unit });
  }
  return rows;
}

function buildFromEntry(
  entry: NormalizedDiaryEntry,
  scope: FeedingDefaultsScope,
): FeedingDefaultsResult | null {
  const lineId = resolveLineId(entry);
  if (!lineId) return null;
  const products = toProductRows(entry);
  if (products.length === 0) return null;
  return {
    defaults: { lineId, products },
    scope,
    sourceEntryId: entry.id,
    label: FEEDING_DEFAULTS_LABEL,
  };
}

export function buildFeedingDefaults(
  input: FeedingDefaultsInput,
): FeedingDefaultsResult {
  if (!input || !Array.isArray(input.rawEntries) || input.rawEntries.length === 0) {
    return EMPTY_RESULT;
  }
  const normalized = normalizeDiaryEntries({ rawEntries: input.rawEntries });
  if (normalized.length === 0) return EMPTY_RESULT;

  const sorted = sortDiaryEntriesNewestFirst(normalized);
  const feedingsAll = sorted.filter(isFeedingEntry).filter((e) => !isUntrusted(e));

  const plantId = pickString(input.plantId ?? null);
  const tentId = pickString(input.tentId ?? null);
  const growId = pickString(input.growId ?? null);

  if (plantId) {
    for (const e of feedingsAll) {
      if (e.plantId === plantId) {
        const r = buildFromEntry(e, "plant");
        if (r) return r;
      }
    }
  }
  if (tentId) {
    for (const e of feedingsAll) {
      if (e.tentId === tentId) {
        const r = buildFromEntry(e, "tent");
        if (r) return r;
      }
    }
  }
  if (growId) {
    for (const e of feedingsAll) {
      if (e.growId === growId) {
        const r = buildFromEntry(e, "grow");
        if (r) return r;
      }
    }
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
