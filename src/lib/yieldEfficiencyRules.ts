/**
 * yieldEfficiencyRules — pure, deterministic derivation of harvest yield
 * efficiency from data Verdant ALREADY stores.
 *
 * Pure. No React, no I/O, no Supabase, no writes, no schema coupling
 * beyond the existing harvest Quick Log detail shapes and the existing
 * `tents` row (free-text `size`, `light.wattage`).
 *
 * Hard safety rules (these are fences, not preferences):
 *  - NEVER substitute a default for a missing operand. No assumed
 *    wattage, no assumed footprint, no assumed unit. A missing operand
 *    returns an explicit `not_measured` result with a reason.
 *  - NEVER emit Infinity / NaN. Division is guarded on a strictly
 *    positive, finite denominator.
 *  - NEVER invent a footprint unit. A unitless tent size such as "4x4"
 *    is ambiguous (feet? cm?) and is reported as ambiguous rather than
 *    guessed — a fabricated g/ft² is fake data about a real harvest.
 *  - This module makes no quality, potency, or recommendation claims.
 */

/** Which display system the grower is already using elsewhere in the app. */
export type YieldMeasurementSystem = "imperial" | "metric";

export type YieldMetricReason =
  | "missing_dry_weight"
  | "missing_wet_weight"
  | "non_positive_dry_weight"
  | "non_positive_wet_weight"
  | "missing_wattage"
  | "non_positive_wattage"
  | "missing_footprint"
  | "ambiguous_footprint_unit"
  | "invalid_footprint"
  | "non_positive_footprint";

export const YIELD_METRIC_REASON_COPY: Readonly<Record<YieldMetricReason, string>> = Object.freeze({
  missing_dry_weight: "No dry weight logged for this grow.",
  missing_wet_weight: "No wet weight logged for this grow.",
  non_positive_dry_weight: "Logged dry weight is zero or negative.",
  non_positive_wet_weight: "Logged wet weight is zero or negative.",
  missing_wattage: "This tent has no light wattage saved.",
  non_positive_wattage: "Saved light wattage is zero or negative.",
  missing_footprint: "This tent has no size saved.",
  ambiguous_footprint_unit:
    'Tent size has no unit, so the footprint is ambiguous. Add a unit (e.g. "4x4 ft" or "120x120 cm").',
  invalid_footprint: "Tent size could not be read as a width × depth footprint.",
  non_positive_footprint: "Tent footprint resolves to zero area.",
});

export type YieldMetric =
  | {
      status: "ok";
      /** Numeric value in `unit`. Always finite. */
      value: number;
      /** Value rounded for display. */
      display: string;
      unit: string;
    }
  | { status: "not_measured"; reason: YieldMetricReason; message: string };

export interface YieldEfficiencyReport {
  system: YieldMeasurementSystem;
  totals: {
    dryWeightGrams: number | null;
    wetWeightGrams: number | null;
    /** Number of harvest entries that contributed a weight. */
    harvestEntryCount: number;
    wattage: number | null;
    /** Footprint in the report's display area unit, when resolvable. */
    footprintArea: number | null;
    footprintUnit: string;
  };
  gramsPerWatt: YieldMetric;
  gramsPerArea: YieldMetric;
  wetToDryRatioPct: YieldMetric;
  /** True when at least one of the three metrics resolved. */
  hasAnyMetric: boolean;
}

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

export interface YieldEfficiencyTentLike {
  /** Free-text tent size as edited in EditTentDialog, e.g. "4x4 ft". */
  size?: string | null;
  light?: { wattage?: number | null } | null;
}

/** A diary / grow event row carrying harvest details. */
export interface YieldEfficiencyHarvestEntryLike {
  details?: unknown;
}

export interface YieldEfficiencyInput {
  harvestEntries?: ReadonlyArray<YieldEfficiencyHarvestEntryLike> | null;
  tents?: ReadonlyArray<YieldEfficiencyTentLike> | null;
  system?: YieldMeasurementSystem;
}

/* ------------------------------------------------------------------ */
/* Weight extraction                                                   */
/* ------------------------------------------------------------------ */

const GRAMS_PER_UNIT: Readonly<Record<string, number>> = Object.freeze({
  g: 1,
  oz: 28.349523125,
  lb: 453.59237,
  kg: 1000,
});

function finitePositiveOrNull(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.trim()) : NaN;
  if (!Number.isFinite(n)) return null;
  return n;
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

export interface ExtractedHarvestWeights {
  wetGrams: number | null;
  dryGrams: number | null;
}

/**
 * Read canonical grams from one harvest details payload. Supports both
 * persisted vocabularies:
 *   A) { wetWeight, dryWeight, weightUnit }        (grower value + unit)
 *   B) { wet_weight_grams, dry_weight_grams }      (canonical grams)
 * and the nested `details.harvest` envelope. Unknown units are dropped,
 * never coerced.
 */
export function extractHarvestWeightsGrams(details: unknown): ExtractedHarvestWeights {
  const root = asRecord(details);
  if (!root) return { wetGrams: null, dryGrams: null };
  const scope = asRecord(root.harvest) ?? root;

  let wetGrams = finitePositiveOrNull(scope.wet_weight_grams);
  let dryGrams = finitePositiveOrNull(scope.dry_weight_grams);

  if (wetGrams === null || dryGrams === null) {
    const unitRaw = typeof scope.weightUnit === "string" ? scope.weightUnit.trim() : null;
    const factor = unitRaw && unitRaw in GRAMS_PER_UNIT ? GRAMS_PER_UNIT[unitRaw] : null;
    if (factor !== null) {
      if (wetGrams === null) {
        const v = finitePositiveOrNull(scope.wetWeight);
        if (v !== null) wetGrams = v * factor;
      }
      if (dryGrams === null) {
        const v = finitePositiveOrNull(scope.dryWeight);
        if (v !== null) dryGrams = v * factor;
      }
    }
  }
  return { wetGrams, dryGrams };
}

/* ------------------------------------------------------------------ */
/* Footprint parsing                                                   */
/* ------------------------------------------------------------------ */

export type FootprintParse =
  | { status: "ok"; squareFeet: number; squareMeters: number }
  | { status: "error"; reason: YieldMetricReason };

const LENGTH_TO_METRES: Readonly<Record<string, number>> = Object.freeze({
  ft: 0.3048,
  in: 0.0254,
  cm: 0.01,
  mm: 0.001,
  m: 1,
});

function normalizeLengthUnitToken(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const t = raw.trim().toLowerCase().replace(/\./g, "");
  if (t === "ft" || t === "feet" || t === "foot" || t === "'") return "ft";
  if (t === "in" || t === "inch" || t === "inches" || t === '"') return "in";
  if (t === "cm" || t === "centimeter" || t === "centimeters") return "cm";
  if (t === "mm") return "mm";
  if (t === "m" || t === "meter" || t === "meters" || t === "metre" || t === "metres") return "m";
  return null;
}

/**
 * Parse a free-text tent size into a footprint. Only `width x depth`
 * shapes with an explicit unit are accepted. Unitless values are
 * reported as ambiguous — never assumed to be feet.
 */
export function parseTentFootprint(size: string | null | undefined): FootprintParse {
  if (typeof size !== "string" || size.trim().length === 0) {
    return { status: "error", reason: "missing_footprint" };
  }
  const text = size.trim().toLowerCase().replace(/×/g, "x");
  const pattern =
    /(\d+(?:\.\d+)?)\s*([a-z"']*)\s*x\s*(\d+(?:\.\d+)?)\s*([a-z"']*)/i;
  const m = pattern.exec(text);
  if (!m) return { status: "error", reason: "invalid_footprint" };

  const w = Number(m[1]);
  const d = Number(m[3]);
  const unitA = normalizeLengthUnitToken(m[2]);
  const unitB = normalizeLengthUnitToken(m[4]);
  // A trailing token that is not a known unit (e.g. "4x4 tent") must not
  // be silently ignored as if a unit had been given.
  const unit = unitB ?? unitA;
  if (unit === null) {
    return { status: "error", reason: "ambiguous_footprint_unit" };
  }
  if (!Number.isFinite(w) || !Number.isFinite(d)) {
    return { status: "error", reason: "invalid_footprint" };
  }
  const factorW = LENGTH_TO_METRES[unitA ?? unit];
  const factorD = LENGTH_TO_METRES[unitB ?? unit];
  const metresW = w * factorW;
  const metresD = d * factorD;
  const squareMeters = metresW * metresD;
  if (!Number.isFinite(squareMeters) || squareMeters <= 0) {
    return { status: "error", reason: "non_positive_footprint" };
  }
  return { status: "ok", squareMeters, squareFeet: squareMeters / 0.09290304 };
}

/* ------------------------------------------------------------------ */
/* Computation                                                         */
/* ------------------------------------------------------------------ */

function notMeasured(reason: YieldMetricReason): YieldMetric {
  return { status: "not_measured", reason, message: YIELD_METRIC_REASON_COPY[reason] };
}

function ok(value: number, unit: string, digits: number): YieldMetric {
  return { status: "ok", value, unit, display: value.toFixed(digits) };
}

/**
 * Derive grams-per-watt, grams-per-area, and wet→dry conversion for a
 * completed grow. Every operand is read from stored data; nothing is
 * defaulted, estimated, or inferred.
 */
export function computeYieldEfficiency(input: YieldEfficiencyInput): YieldEfficiencyReport {
  const system: YieldMeasurementSystem = input.system ?? "imperial";
  const areaUnit = system === "metric" ? "g/m²" : "g/ft²";
  const footprintUnit = system === "metric" ? "m²" : "ft²";

  let dryTotal: number | null = null;
  let wetTotal: number | null = null;
  let harvestEntryCount = 0;
  for (const entry of input.harvestEntries ?? []) {
    const { wetGrams, dryGrams } = extractHarvestWeightsGrams(entry?.details);
    if (wetGrams === null && dryGrams === null) continue;
    harvestEntryCount += 1;
    if (dryGrams !== null) dryTotal = (dryTotal ?? 0) + dryGrams;
    if (wetGrams !== null) wetTotal = (wetTotal ?? 0) + wetGrams;
  }

  // Wattage: sum across tents that actually have a saved wattage. If no
  // tent has one, it stays null — never 0, never a "typical" value.
  let wattage: number | null = null;
  let hasTent = false;
  let footprintSqFt: number | null = null;
  let footprintSqM: number | null = null;
  let footprintReason: YieldMetricReason | null = null;
  for (const tent of input.tents ?? []) {
    if (!tent) continue;
    hasTent = true;
    const w = finitePositiveOrNull(tent.light?.wattage ?? null);
    if (w !== null) wattage = (wattage ?? 0) + w;
    const parsed = parseTentFootprint(tent.size ?? null);
    if (parsed.status === "ok") {
      footprintSqFt = (footprintSqFt ?? 0) + parsed.squareFeet;
      footprintSqM = (footprintSqM ?? 0) + parsed.squareMeters;
    } else if (footprintReason === null) {
      footprintReason = parsed.reason;
    }
  }
  if (!hasTent) footprintReason = footprintReason ?? "missing_footprint";

  const dryOk = dryTotal !== null && dryTotal > 0;

  // grams per watt
  let gramsPerWatt: YieldMetric;
  if (dryTotal === null) gramsPerWatt = notMeasured("missing_dry_weight");
  else if (!dryOk) gramsPerWatt = notMeasured("non_positive_dry_weight");
  else if (wattage === null) gramsPerWatt = notMeasured("missing_wattage");
  else if (!(wattage > 0)) gramsPerWatt = notMeasured("non_positive_wattage");
  else gramsPerWatt = ok(dryTotal / wattage, "g/W", 2);

  // grams per area
  const area = system === "metric" ? footprintSqM : footprintSqFt;
  let gramsPerArea: YieldMetric;
  if (dryTotal === null) gramsPerArea = notMeasured("missing_dry_weight");
  else if (!dryOk) gramsPerArea = notMeasured("non_positive_dry_weight");
  else if (area === null) gramsPerArea = notMeasured(footprintReason ?? "missing_footprint");
  else if (!(area > 0)) gramsPerArea = notMeasured("non_positive_footprint");
  else gramsPerArea = ok(dryTotal / area, areaUnit, 1);

  // wet → dry conversion
  let wetToDryRatioPct: YieldMetric;
  if (wetTotal === null) wetToDryRatioPct = notMeasured("missing_wet_weight");
  else if (!(wetTotal > 0)) wetToDryRatioPct = notMeasured("non_positive_wet_weight");
  else if (dryTotal === null) wetToDryRatioPct = notMeasured("missing_dry_weight");
  else if (!dryOk) wetToDryRatioPct = notMeasured("non_positive_dry_weight");
  else wetToDryRatioPct = ok((dryTotal / wetTotal) * 100, "%", 1);

  return {
    system,
    totals: {
      dryWeightGrams: dryTotal,
      wetWeightGrams: wetTotal,
      harvestEntryCount,
      wattage,
      footprintArea: area,
      footprintUnit,
    },
    gramsPerWatt,
    gramsPerArea,
    wetToDryRatioPct,
    hasAnyMetric:
      gramsPerWatt.status === "ok" ||
      gramsPerArea.status === "ok" ||
      wetToDryRatioPct.status === "ok",
  };
}

/** Copy shown under the card. Never a yield recommendation. */
export const YIELD_EFFICIENCY_MEMORY_NOTE =
  "Derived from what you logged. Efficiency compares runs — it does not grade this grow.";
