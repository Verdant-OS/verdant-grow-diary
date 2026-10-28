/**
 * Warn when one Water entry is above 10,000 ml. The 50,000 ml single-watering
 * ceiling (owner decision 2026-10-14, reaffirmed 2026-10-19 over the earlier
 * 1,000,000 ml bound) stays a hard validation failure in the payload builder.
 * The warning names the entered amount. It is not a watering recommendation.
 */

export const LARGE_WATER_AMOUNT_THRESHOLD_ML = 10_000;
/** Single-watering ceiling; QUICK_LOG_WATER_VOLUME_MAX_ML is derived from this. */
export const LARGE_WATER_AMOUNT_HARD_MAX_ML = 50_000;

export const LARGE_WATER_AMOUNT_EDIT_LABEL = "Edit amount";
export const LARGE_WATER_AMOUNT_CONFIRM_LABEL = "Confirm amount";

export const WATER_VOLUME_UNIT = "ml" as const;
export type WaterVolumeUnit = typeof WATER_VOLUME_UNIT;

const PLAIN_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
/** Stops a pasted numeric string from building an unbounded BigInt on each render. */
export const MAX_WATER_VOLUME_TEXT_LENGTH = 32;

interface ParsedDecimal {
  negative: boolean;
  digits: bigint;
  scale: bigint;
}

function parseDecimal(raw: string): ParsedDecimal | null {
  const trimmed = raw.trim();
  if (trimmed.length > MAX_WATER_VOLUME_TEXT_LENGTH) return null;
  if (!PLAIN_NUMBER.test(trimmed)) return null;
  const negative = trimmed.startsWith("-");
  const body = trimmed.replace(/^[+-]/, "");
  const [whole, fraction = ""] = body.split(".");
  const digits = BigInt(`${whole === "" ? "0" : whole}${fraction}`);
  const scale = 10n ** BigInt(fraction.length);
  return { negative, digits, scale };
}

function milliliterRational(
  raw: string,
): { numerator: bigint; denominator: bigint; negative: boolean } | null {
  const parsed = parseDecimal(raw);
  if (!parsed) return null;
  return {
    negative: parsed.negative,
    numerator: parsed.digits,
    denominator: parsed.scale,
  };
}

function rationalToNumber(numerator: bigint, denominator: bigint): number {
  if (denominator === 0n) return Number.NaN;
  if (numerator % denominator === 0n) return Number(numerator / denominator);
  return Number(numerator) / Number(denominator);
}

/** Canonical milliliters for a finite non-negative entry, or null when unparsable. */
export function waterEntryToMilliliters(raw: string): number | null {
  const rational = milliliterRational(raw);
  if (!rational || rational.negative) return null;
  const value = rationalToNumber(rational.numerator, rational.denominator);
  return Number.isFinite(value) ? value : null;
}

function compareMilliliters(raw: string, limitMl: number): number | null {
  const rational = milliliterRational(raw);
  if (!rational || rational.negative) return null;
  const limit = BigInt(limitMl) * rational.denominator;
  if (rational.numerator > limit) return 1;
  if (rational.numerator < limit) return -1;
  return 0;
}

export type WaterVolumeTextAssessment =
  | { status: "missing" }
  | { status: "invalid" }
  | { status: "too_large" }
  | { status: "valid"; volumeMl: number };

/**
 * Save-path classification of the Volume text, shared with the warning so both
 * read every entry the same way: text longer than the input cap is invalid, and
 * the 50,000 ml hard maximum is compared exactly, before any Number()
 * rounding can turn an entry above it into an accepted value. An entry above
 * the maximum is reported as too_large so callers can name the ceiling.
 */
export function assessWaterVolumeText(raw: string | null | undefined): WaterVolumeTextAssessment {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return { status: "missing" };
  const rational = milliliterRational(trimmed);
  if (!rational || rational.negative || rational.numerator === 0n) return { status: "invalid" };
  if (compareMilliliters(trimmed, LARGE_WATER_AMOUNT_HARD_MAX_ML) === 1) {
    return { status: "too_large" };
  }
  const volumeMl = Number(trimmed);
  if (!Number.isFinite(volumeMl) || volumeMl <= 0) return { status: "invalid" };
  return { status: "valid", volumeMl };
}

export function largeWaterConfirmationKey(amount: string, unit: WaterVolumeUnit): string | null {
  const comparison = compareMilliliters(amount, LARGE_WATER_AMOUNT_THRESHOLD_ML);
  const hard = compareMilliliters(amount, LARGE_WATER_AMOUNT_HARD_MAX_ML);
  if (comparison === null || hard === null) return null;
  if (comparison <= 0 || hard > 0) return null;
  return `${unit}\u0000${amount.trim()}`;
}

export interface LargeWaterAmountAssessment {
  warns: boolean;
  needsConfirmation: boolean;
  volumeMl: number | null;
  enteredLabel: string;
  message: string | null;
  confirmationKey: string | null;
  editLabel: typeof LARGE_WATER_AMOUNT_EDIT_LABEL;
  confirmLabel: typeof LARGE_WATER_AMOUNT_CONFIRM_LABEL;
}

export function assessLargeWaterAmount(input: {
  amount: string;
  unit: WaterVolumeUnit;
  confirmedKey: string | null;
}): LargeWaterAmountAssessment {
  const enteredLabel = `${input.amount.trim()} ${input.unit}`;
  const volumeMl = waterEntryToMilliliters(input.amount);
  const confirmationKey = largeWaterConfirmationKey(input.amount, input.unit);
  const warns = confirmationKey !== null;
  const needsConfirmation = warns && input.confirmedKey !== confirmationKey;
  return {
    warns,
    needsConfirmation,
    volumeMl,
    enteredLabel,
    message: warns ? `${enteredLabel} is above 10,000 ml. Edit amount or Confirm amount.` : null,
    confirmationKey,
    editLabel: LARGE_WATER_AMOUNT_EDIT_LABEL,
    confirmLabel: LARGE_WATER_AMOUNT_CONFIRM_LABEL,
  };
}

export interface LargeWaterConfirmSession {
  inFlight: boolean;
  confirmedKey: string | null;
}

/** Confirming an amount starts one save. A second confirm does not save again. */
export function confirmLargeWaterAmount(
  session: LargeWaterConfirmSession,
  confirmationKey: string,
): LargeWaterConfirmSession & { save: boolean } {
  if (session.inFlight || session.confirmedKey === confirmationKey) {
    return { ...session, save: false };
  }
  return { inFlight: true, confirmedKey: confirmationKey, save: true };
}
