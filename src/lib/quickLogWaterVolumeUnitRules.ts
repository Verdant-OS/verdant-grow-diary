/**
 * Quick Log Water: typed volume in ml, L or gal → canonical millilitre text.
 * Spec: docs/specs/quick-log-water-volume-units.md (R1, R3, R4, R6, R8, R14).
 *
 * Pure. No React, no I/O, no clock. The result feeds the existing ml gates
 * (assessWaterVolumeText, the large-water warning, both payload builders),
 * which stay the only validators. Conversion happens once, on the decimal
 * text as an exact rational, then rounds once to whole millilitres.
 */
import {
  assessWaterVolumeText,
  MAX_WATER_VOLUME_TEXT_LENGTH,
} from "./quickLogWaterVolumeWarningRules";

export type WaterEntryUnit = "ml" | "L" | "gal";
export const WATER_ENTRY_UNITS: readonly WaterEntryUnit[] = Object.freeze(["ml", "L", "gal"]);
export const DEFAULT_WATER_ENTRY_UNIT: WaterEntryUnit = "ml";

/** 1 US liquid gallon = 3,785.411784 ml exactly; held as a ratio of integers. */
const ML_PER_GAL_NUMERATOR = 3_785_411_784n;
const ML_PER_GAL_DENOMINATOR = 1_000_000n;
const ML_PER_GAL = 3785.411784;

const PLAIN_UNSIGNED_DECIMAL = /^\+?(?:\d+(?:\.\d*)?|\.\d+)$/;

export function isWaterEntryUnit(value: unknown): value is WaterEntryUnit {
  return value === "ml" || value === "L" || value === "gal";
}

/**
 * Canonical ml text for the existing gates.
 * - `ml` returns the text unchanged (today's behaviour, decimals included).
 * - `L` / `gal` convert exactly and round once to whole ml, half away from zero.
 * - Blank stays blank. Text the grammar rejects (negative, exponent, over-long,
 *   non-numeric) is returned unchanged so assessWaterVolumeText still reports
 *   it as invalid. A unit is never inferred from the number.
 */
export function waterEntryToCanonicalMlText(text: string, unit: WaterEntryUnit): string {
  if (unit === "ml") return text;
  const trimmed = text.trim();
  if (trimmed === "") return "";
  if (trimmed.length > MAX_WATER_VOLUME_TEXT_LENGTH) return text;
  if (!PLAIN_UNSIGNED_DECIMAL.test(trimmed)) return text;
  const body = trimmed.replace(/^\+/, "");
  const [whole, fraction = ""] = body.split(".");
  const digits = BigInt(`${whole === "" ? "0" : whole}${fraction}`);
  const scale = 10n ** BigInt(fraction.length);
  const numerator = unit === "L" ? digits * 1000n : digits * ML_PER_GAL_NUMERATOR;
  const denominator = unit === "L" ? scale : scale * ML_PER_GAL_DENOMINATOR;
  const rounded = (2n * numerator + denominator) / (2n * denominator);
  return rounded.toString();
}

function trimZeros(fixed: string): string {
  return fixed.includes(".") ? fixed.replace(/0+$/, "").replace(/\.$/, "") : fixed;
}

/**
 * Display text in `unit` for a stored ml amount (prefill, restored drafts).
 * Display only: never used to compute what is saved. L to 3 decimals, gal to
 * 2, trailing zeros dropped. Non-finite or negative input returns "".
 */
export function mlToWaterEntryDisplay(ml: number, unit: WaterEntryUnit): string {
  if (!Number.isFinite(ml) || ml < 0) return "";
  if (unit === "ml") return String(ml);
  if (unit === "L") return trimZeros((ml / 1000).toFixed(3));
  return trimZeros((ml / ML_PER_GAL).toFixed(2));
}

/** The text a field shows: the grower's typed text, else the canonical ml in `unit`. */
export function waterEntryDisplayText(
  enteredText: string | undefined,
  canonicalMlText: string,
  unit: WaterEntryUnit,
): string {
  if (enteredText !== undefined) return enteredText;
  if (unit === "ml") return canonicalMlText;
  const trimmed = canonicalMlText.trim();
  if (trimmed === "") return "";
  const ml = Number(trimmed);
  return Number.isFinite(ml) ? mlToWaterEntryDisplay(ml, unit) : canonicalMlText;
}

/** "3,785" for a valid canonical volume, else null (blank, invalid or above the ceiling). */
export function savesAsMlAmount(canonicalMlText: string): string | null {
  const assessed = assessWaterVolumeText(canonicalMlText);
  if (assessed.status !== "valid") return null;
  return assessed.volumeMl.toLocaleString("en-US", { maximumFractionDigits: 3 });
}

/** A ceiling in ml expressed in `unit`, rounded down so it never overstates the limit. */
export function maxInWaterEntryUnit(maxMl: number, unit: WaterEntryUnit): string {
  if (unit === "ml") return maxMl.toLocaleString("en-US");
  const value = unit === "L" ? maxMl / 1000 : maxMl / ML_PER_GAL;
  return trimZeros((Math.floor(value * 10) / 10).toFixed(1));
}

/** "946" style amount for a converted Runoff (whole ml within its 0–1,000,000 band), else null. */
export function runoffSavesAsMlAmount(canonicalMlText: string): string | null {
  const trimmed = canonicalMlText.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const ml = Number(trimmed);
  if (ml <= 0 || ml > 1_000_000) return null;
  return ml.toLocaleString("en-US");
}
