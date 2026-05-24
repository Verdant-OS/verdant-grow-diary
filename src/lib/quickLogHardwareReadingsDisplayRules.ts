/**
 * quickLogHardwareReadingsDisplayRules — pure helpers for splitting a
 * diary note into its prose body and the deterministic "manual handheld
 * readings" block written by QuickLog.
 *
 * Display-only. No I/O. No React. No interpretation of values. No alerts,
 * no action_queue, no sensor_readings.
 */
import { HARDWARE_READINGS_HEADER } from "@/lib/quickLogHardwareReadingsRules";

export interface SplitHardwareReadingsResult {
  /** Note text with the hardware block removed, trimmed. */
  body: string;
  /** Header line, when present. */
  hardwareHeader: string | null;
  /** Raw lines inside the hardware block (without the header), trimmed. */
  hardwareLines: string[];
  /** True when a hardware block was detected. */
  hasHardwareBlock: boolean;
}

/**
 * Split a diary note into body + hardware-readings block. Deterministic.
 * Notes without the header are returned unchanged as `body`.
 */
export function splitHardwareReadingsFromNote(
  note: string | null | undefined,
): SplitHardwareReadingsResult {
  const safe = (note ?? "").toString();
  const idx = safe.indexOf(HARDWARE_READINGS_HEADER);
  if (idx < 0) {
    return {
      body: safe.trim(),
      hardwareHeader: null,
      hardwareLines: [],
      hasHardwareBlock: false,
    };
  }
  const before = safe.slice(0, idx).trim();
  const after = safe.slice(idx + HARDWARE_READINGS_HEADER.length);
  // Hardware block continues until a blank line or end-of-note.
  const rawLines = after.split(/\r?\n/);
  const collected: string[] = [];
  for (const line of rawLines) {
    if (line.trim() === "") {
      if (collected.length === 0) continue; // skip leading blank after header
      break;
    }
    collected.push(line.trim());
  }
  return {
    body: before,
    hardwareHeader: HARDWARE_READINGS_HEADER,
    hardwareLines: collected,
    hasHardwareBlock: true,
  };
}
