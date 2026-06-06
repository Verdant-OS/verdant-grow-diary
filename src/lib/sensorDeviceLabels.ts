/**
 * Single source of truth for device-specific sensor labels.
 *
 * Augments — never duplicates — the `SOURCE_LABEL` map in
 * `sensorSnapshot.ts`. UI surfaces call `formatSensorDeviceDetail`
 * to attach a device-detail badge next to the canonical source label
 * (e.g. "Manual" + the grower-entered device note).
 *
 * Pure. No I/O. No React. No Supabase.
 *
 * Recognized `device_id` shapes:
 *  - `manual:<note>` — grower-entered sanitized device/source note. The
 *    row's `source` stays `manual`; the device note never upgrades it.
 *  - anything else — returns null (caller falls back to source label).
 */
import { extractManualDeviceNote } from "@/lib/manualSensorSourceLabel";

export function formatSensorDeviceDetail(
  deviceId: string | null | undefined,
): string | null {
  const manualNote = extractManualDeviceNote(deviceId);
  if (manualNote) return manualNote;
  return null;
}
