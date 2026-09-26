/**
 * quickLogHardwareReadingsRules — pure helpers for formatting handheld
 * grow-tool readings (Spider Farmer pH/EC combo pen, PAR/PPFD meter, etc.)
 * into a deterministic note suffix that gets appended to the QuickLog
 * `note` field.
 *
 * These readings are MANUAL HANDHELD readings. They must never be written
 * to `sensor_readings`, never generate alerts or action_queue items, and
 * never be classified as live sensor data.
 *
 * Pure & deterministic. No React. No Supabase.
 */

export interface QuickLogHardwareReadings {
  inputPh?: string;
  inputEc?: string;
  runoffPh?: string;
  runoffEc?: string;
  ppfdCanopy?: string;
  lightDistance?: string;
}

export const HARDWARE_READINGS_HEADER = "Hardware readings (manual handheld):";

const FIELD_ORDER: Array<{ key: keyof QuickLogHardwareReadings; label: string }> = [
  { key: "inputPh", label: "Feed/Input pH" },
  { key: "inputEc", label: "Feed/Input EC (mS/cm)" },
  { key: "runoffPh", label: "Runoff pH" },
  { key: "runoffEc", label: "Runoff EC (mS/cm)" },
  { key: "ppfdCanopy", label: "PPFD canopy" },
  { key: "lightDistance", label: "Light distance" },
];

function clean(v: string | undefined | null): string {
  return (v ?? "").toString().trim();
}

export function hasAnyHardwareReading(
  readings: QuickLogHardwareReadings | null | undefined,
): boolean {
  if (!readings) return false;
  return FIELD_ORDER.some(({ key }) => clean(readings[key]).length > 0);
}

/**
 * Default open/collapsed state for the QuickLog Hardware readings section.
 * Pure & deterministic. Expanded only when at least one hardware/sensor
 * field already has a value. Used by QuickLog.tsx on open/reset so the
 * default is reproducible and keeps presenter logic out of JSX.
 */
export function computeQuickLogHardwareDefaultOpen(
  readings: QuickLogHardwareReadings | null | undefined,
): boolean {
  return hasAnyHardwareReading(readings);
}

/**
 * Returns the deterministic, multi-line formatted block, or an empty
 * string if nothing was entered.
 */
export function formatHardwareReadingsBlock(
  readings: QuickLogHardwareReadings | null | undefined,
): string {
  if (!hasAnyHardwareReading(readings)) return "";
  const lines = [HARDWARE_READINGS_HEADER];
  for (const { key, label } of FIELD_ORDER) {
    const v = clean(readings![key]);
    if (v) lines.push(`- ${label}: ${v}`);
  }
  return lines.join("\n");
}

/**
 * Appends the formatted block to an existing note. Deterministic: same
 * input always produces the same output. If there are no hardware
 * readings, returns the note unchanged.
 */
export function appendHardwareReadingsToNote(
  note: string,
  readings: QuickLogHardwareReadings | null | undefined,
): string {
  const block = formatHardwareReadingsBlock(readings);
  const base = (note ?? "").trim();
  if (!block) return base;
  if (!base) return block;
  return `${base}\n\n${block}`;
}

// ---------------------------------------------------------------------------
// Validation (QA 2026-09-24, BUG-007)
// ---------------------------------------------------------------------------
//
// These readings are saved as note text through the frozen manual write path
// (no typed pH/EC parameters may be added to that RPC), so they must be
// checked here, before the note is built. pH 15, EC 1200 mS/cm, runoff pH -3
// and "1,8" were all saved and later shown as "Manual readings" with no flag.
// Bounds match the typed Feed path (`quicklog_save_event` p_feed): pH 0-14,
// EC 0-10 mS/cm.

export const HARDWARE_READING_BOUNDS: Record<
  keyof QuickLogHardwareReadings,
  { min: number; max: number; label: string; unit: string }
> = {
  inputPh: { min: 0, max: 14, label: "Feed/Input pH", unit: "" },
  inputEc: { min: 0, max: 10, label: "Feed/Input EC", unit: " mS/cm" },
  runoffPh: { min: 0, max: 14, label: "Runoff pH", unit: "" },
  runoffEc: { min: 0, max: 10, label: "Runoff EC", unit: " mS/cm" },
  ppfdCanopy: { min: 0, max: 3000, label: "PPFD canopy", unit: " µmol/m²/s" },
  lightDistance: { min: 0, max: 1000, label: "Light distance", unit: "" },
};

// A leading-decimal value (".8") is a number too: JavaScript and growers read it as 0.8.
const PLAIN_NUMBER_RE = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;
const COMMA_DECIMAL_RE = /^-?\d*,\d+$/;
/** "1,200" / "12,000": a thousands separator, not a decimal comma. */
const THOUSANDS_GROUP_RE = /^-?\d{1,3}(?:,\d{3})+$/;
/** Light distance may carry a unit ("18 in", "45cm"); the number must still be sane. */
const NUMBER_WITH_UNIT_RE = /^(-?(?:\d+(?:\.\d+)?|\.\d+))\s*(in|inch|inches|"|cm|mm|ft|')?$/i;

/**
 * A light distance with a unit is bounded in centimetres, so "1000 ft" is
 * rejected and "1001 mm" is not (Codex review on #1683). A bare number keeps
 * the unit-agnostic bound.
 */
const LIGHT_DISTANCE_MAX_CM = 1000;
const LIGHT_DISTANCE_UNITS: Record<string, { label: string; cm: number }> = {
  in: { label: "in", cm: 2.54 },
  inch: { label: "in", cm: 2.54 },
  inches: { label: "in", cm: 2.54 },
  '"': { label: "in", cm: 2.54 },
  ft: { label: "ft", cm: 30.48 },
  "'": { label: "ft", cm: 30.48 },
  cm: { label: "cm", cm: 1 },
  mm: { label: "mm", cm: 0.1 },
};

export type HardwareReadingsValidation = { ok: true } | { ok: false; message: string };

/**
 * Single-field check for display of already-saved readings: entries saved
 * before validation existed (e.g. "pH 15") must be flagged, never shown as a
 * plausible manual reading.
 */
export function isHardwareReadingValueValid(
  key: keyof QuickLogHardwareReadings,
  value: string | null | undefined,
): boolean {
  return validateHardwareReadings({ [key]: value ?? "" }).ok;
}

export function validateHardwareReadings(
  readings: QuickLogHardwareReadings | null | undefined,
): HardwareReadingsValidation {
  if (!readings) return { ok: true };
  for (const { key } of FIELD_ORDER) {
    const raw = clean(readings[key]);
    if (!raw) continue;
    const bounds = HARDWARE_READING_BOUNDS[key];
    // Where values reach the thousands (PPFD, light distance), "1,200" is a
    // grouped 1200; "use a period" would turn it into 1.2.
    if (bounds.max >= 1000 && THOUSANDS_GROUP_RE.test(raw)) {
      return {
        ok: false,
        message: `${bounds.label}: enter the number without commas (for example ${raw.replace(/,/g, "")}).`,
      };
    }
    if (COMMA_DECIMAL_RE.test(raw)) {
      return {
        ok: false,
        message: `${bounds.label}: use a period for decimals (for example ${raw.replace(",", ".")}).`,
      };
    }
    const match =
      key === "lightDistance"
        ? NUMBER_WITH_UNIT_RE.exec(raw)
        : PLAIN_NUMBER_RE.test(raw)
          ? [raw, raw]
          : null;
    const value = match ? Number(match[1]) : NaN;
    if (!Number.isFinite(value)) {
      return { ok: false, message: `${bounds.label} must be a number.` };
    }
    const unit =
      key === "lightDistance" && match?.[2] ? LIGHT_DISTANCE_UNITS[match[2].toLowerCase()] : null;
    if (unit) {
      const max = Math.round((LIGHT_DISTANCE_MAX_CM / unit.cm) * 10) / 10;
      if (value < 0 || value > max) {
        return {
          ok: false,
          message: `${bounds.label} must be between 0 and ${max} ${unit.label}.`,
        };
      }
      continue;
    }
    if (value < bounds.min || value > bounds.max) {
      return {
        ok: false,
        message: `${bounds.label} must be between ${bounds.min} and ${bounds.max}${bounds.unit}.`,
      };
    }
  }
  return { ok: true };
}
