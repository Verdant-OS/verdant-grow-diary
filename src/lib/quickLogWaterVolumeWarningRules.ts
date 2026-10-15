/**
 * Warn when one Water entry is above 10,000 ml. The 1,000,000 ml ceiling
 * stays a hard validation failure in the watering payload builder.
 * The warning names the entered amount. It is not a watering recommendation.
 */

export const LARGE_WATER_AMOUNT_THRESHOLD_ML = 10_000;
export const LARGE_WATER_AMOUNT_HARD_MAX_ML = 1_000_000;

export const LARGE_WATER_AMOUNT_EDIT_LABEL = "Edit amount";
export const LARGE_WATER_AMOUNT_CONFIRM_LABEL = "Confirm amount";

export const WATER_VOLUME_UNITS = ["ml", "L", "fl oz", "gal"] as const;
export type WaterVolumeUnit = (typeof WATER_VOLUME_UNITS)[number];

const UNIT_TO_ML: Record<WaterVolumeUnit, { numerator: bigint; denominator: bigint }> = {
  ml: { numerator: 1n, denominator: 1n },
  L: { numerator: 1000n, denominator: 1n },
  "fl oz": { numerator: 295735295625n, denominator: 10_000_000_000n },
  gal: { numerator: 3_785_411_784n, denominator: 1_000_000n },
};

const PLAIN_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

interface ParsedDecimal {
  negative: boolean;
  digits: bigint;
  scale: bigint;
}

function parseDecimal(raw: string): ParsedDecimal | null {
  const trimmed = raw.trim();
  if (!PLAIN_NUMBER.test(trimmed)) return null;
  const negative = trimmed.startsWith("-");
  const body = trimmed.replace(/^[+-]/, "");
  const [whole, fraction = ""] = body.split(".");
  const digits = BigInt(`${whole === "" ? "0" : whole}${fraction}`);
  const scale = 10n ** BigInt(fraction.length);
  return { negative, digits, scale };
}

export function isWaterVolumeUnit(value: string | null | undefined): value is WaterVolumeUnit {
  return (WATER_VOLUME_UNITS as readonly string[]).includes(value ?? "");
}

export function readWaterVolumeUnit(value: string | null | undefined): WaterVolumeUnit {
  return isWaterVolumeUnit(value) ? value : "ml";
}

function milliliterRational(
  raw: string,
  unit: WaterVolumeUnit,
): { numerator: bigint; denominator: bigint; negative: boolean } | null {
  const parsed = parseDecimal(raw);
  if (!parsed) return null;
  const factor = UNIT_TO_ML[unit];
  return {
    negative: parsed.negative,
    numerator: parsed.digits * factor.numerator,
    denominator: parsed.scale * factor.denominator,
  };
}

function rationalToNumber(numerator: bigint, denominator: bigint): number {
  if (denominator === 0n) return Number.NaN;
  if (numerator % denominator === 0n) return Number(numerator / denominator);
  return Number(numerator) / Number(denominator);
}

/** Canonical milliliters for a finite non-negative entry, or null when unparsable. */
export function waterEntryToMilliliters(raw: string, unit: WaterVolumeUnit): number | null {
  const rational = milliliterRational(raw, unit);
  if (!rational || rational.negative) return null;
  const value = rationalToNumber(rational.numerator, rational.denominator);
  return Number.isFinite(value) ? value : null;
}

function compareMilliliters(raw: string, unit: WaterVolumeUnit, limitMl: number): number | null {
  const rational = milliliterRational(raw, unit);
  if (!rational || rational.negative) return null;
  const limit = BigInt(limitMl) * rational.denominator;
  if (rational.numerator > limit) return 1;
  if (rational.numerator < limit) return -1;
  return 0;
}

export function largeWaterConfirmationKey(amount: string, unit: WaterVolumeUnit): string | null {
  const comparison = compareMilliliters(amount, unit, LARGE_WATER_AMOUNT_THRESHOLD_ML);
  const hard = compareMilliliters(amount, unit, LARGE_WATER_AMOUNT_HARD_MAX_ML);
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
  const volumeMl = waterEntryToMilliliters(input.amount, input.unit);
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
