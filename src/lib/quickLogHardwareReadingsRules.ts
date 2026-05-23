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
  { key: "inputPh", label: "Input pH" },
  { key: "inputEc", label: "Input EC/PPM" },
  { key: "runoffPh", label: "Runoff pH" },
  { key: "runoffEc", label: "Runoff EC/PPM" },
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
