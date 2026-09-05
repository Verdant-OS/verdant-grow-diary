/**
 * Pure helpers for labeling a sensor reading's source — with special care
 * for manual snapshots so the grower can capture *where* the reading came
 * from (handheld meter, EcoWitt console, SensorPush, etc.) without
 * ever making a manual entry look live.
 *
 * Non-manual ingest tokens go through `resolveSensorSourceDisplayCanon`
 * so vendor/bridge/app names never render as the Source label.
 *
 * No I/O, no React, no Supabase. Deterministic.
 *
 * Storage contract:
 *  - Manual device notes are persisted in the existing
 *    `sensor_readings.device_id` column with a `manual:` prefix so they
 *    cannot be confused with live bridge device IDs (e.g.
 *    `ecowitt-gateway`). The `source` column stays `manual` — the
 *    presence of a device note never upgrades a row to live.
 */

import { formatSensorSourceDisplayLabel } from "@/lib/sensorSourceDisplayCanon";

export const MANUAL_DEVICE_ID_PREFIX = "manual:";

/** Visible label used everywhere a manual reading is shown. */
export const MANUAL_READING_LABEL = "Manual reading";

/** Hard cap on persisted device-note length (defense in depth). */
export const MAX_MANUAL_DEVICE_NOTE_LEN = 60;

export interface ManualDeviceOption {
  /** Stable id used as the select value. */
  id: string;
  /** Grower-visible label. */
  label: string;
}

/**
 * Curated safe examples shown in the optional "Reading source / device"
 * picker. The grower can also free-type a short custom note. None of
 * these imply any integration exists — they are just labels.
 */
const MANUAL_DEVICE_PRESETS: ManualDeviceOption[] = [
  { id: "ecowitt-wh45", label: "EcoWitt WH45 CO2/THP Monitor" },
  { id: "ecowitt-wh31", label: "EcoWitt WH31 Temp/RH Sensor" },
  { id: "ecowitt-wh51", label: "EcoWitt WH51 Soil Moisture Sensor" },
  { id: "ecowitt-gateway", label: "EcoWitt gateway" },
  { id: "sensorpush", label: "SensorPush" },
  { id: "pulse", label: "Pulse" },
  { id: "ac-infinity", label: "AC Infinity controller" },
  { id: "aroya-export", label: "AROYA export" },
  { id: "handheld-meter", label: "Handheld meter" },
  { id: "smart-home-copy", label: "Smart home dashboard copy" },
  { id: "memory", label: "Entered from memory" },
];

export function getManualSensorDeviceOptions(): ManualDeviceOption[] {
  return MANUAL_DEVICE_PRESETS.slice();
}

/**
 * Sanitize a grower-entered device/source note.
 *
 * - Trims and collapses whitespace.
 * - Strips control characters and anything that isn't a safe printable.
 * - Caps length at `MAX_MANUAL_DEVICE_NOTE_LEN`.
 * - Returns `null` for empty / unusable input so callers can omit the
 *   `device_id` field entirely.
 */
export function normalizeManualSourceNote(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  if (typeof input !== "string") return null;
  // Keep letters, digits, spaces, and a small set of safe punctuation.
  // Anything else (control chars, angle brackets, quotes, backticks, etc.)
  // is stripped.
  const safe = input
    .replace(/[^A-Za-z0-9 .,/\-_+&()°²³%]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!safe) return null;
  return safe.slice(0, MAX_MANUAL_DEVICE_NOTE_LEN);
}

/**
 * Wrap a normalized device note in the `manual:` device_id prefix for
 * safe storage. Returns `null` when the note is empty.
 */
export function buildManualDeviceId(note: string | null | undefined): string | null {
  const safe = normalizeManualSourceNote(note);
  if (!safe) return null;
  return `${MANUAL_DEVICE_ID_PREFIX}${safe}`;
}

/**
 * Extract the human-readable manual device note from a `device_id`
 * value previously written via `buildManualDeviceId`. Returns null when
 * the device_id is not a manual note.
 */
export function extractManualDeviceNote(deviceId: string | null | undefined): string | null {
  if (!deviceId || typeof deviceId !== "string") return null;
  if (!deviceId.startsWith(MANUAL_DEVICE_ID_PREFIX)) return null;
  const note = deviceId.slice(MANUAL_DEVICE_ID_PREFIX.length);
  return normalizeManualSourceNote(note);
}

export type SensorSourceForLabel = "live" | "manual" | "sim" | "diary" | "unavailable" | string;

/**
 * Snapshot-layer labels that are not ingest source tokens. Kept here so
 * Dashboard / chart presenters retain their historical wording for these
 * aggregate classifications without treating bridge/app names as Source.
 */
const SNAPSHOT_LAYER_LABELS: Readonly<Record<string, string>> = {
  sim: "Simulated",
  diary: "Diary snapshot",
  unavailable: "Unavailable",
  // Snapshot classification for rows whose source is not a recognized
  // trust value. Distinct from "Unavailable" and never a live claim.
  unverified: "Unverified source",
};

/**
 * Format the visible source label for a reading. For manual rows with a
 * safe device note, returns e.g. "Manual reading · EcoWitt WH45 CO2/THP Monitor".
 *
 * Never returns "Live" / "Synced" / "Connected" for a manual source.
 * Never returns vendor/bridge/app names (`pi_bridge`, `home_assistant`, …)
 * as the Source label — those belong in provenance via
 * `resolveSensorSourceDisplayCanon`.
 */
export function formatSensorSourceLabel(input: {
  source: SensorSourceForLabel | null | undefined;
  deviceNote?: string | null;
  deviceId?: string | null;
}): string {
  const src = (input.source ?? "unavailable") as string;

  if (src === "manual") {
    const note =
      normalizeManualSourceNote(input.deviceNote ?? null) ??
      extractManualDeviceNote(input.deviceId ?? null);
    if (!note) return MANUAL_READING_LABEL;
    return `${MANUAL_READING_LABEL} · ${note}`;
  }

  if (src in SNAPSHOT_LAYER_LABELS) {
    return SNAPSHOT_LAYER_LABELS[src]!;
  }

  // Display canon: normalize → one of six canonical Source labels.
  // Bridge/vendor/app tokens become provenance, not Source.
  return formatSensorSourceDisplayLabel(src);
}
