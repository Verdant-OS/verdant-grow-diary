/**
 * Single source of truth for device-specific sensor labels.
 *
 * Augments — never duplicates — the `SOURCE_LABEL` map in
 * `sensorSnapshot.ts`. UI surfaces call `formatSensorDeviceDetail`
 * to attach a device-detail badge next to the canonical source label
 * (e.g. "Live sensor" + "Shelly H&T Gen4", or "Manual" + "SwitchBot
 * CO2 Monitor").
 *
 * Pure. No I/O. No React. No Supabase.
 *
 * Recognized `device_id` shapes:
 *  - `manual:<note>` — grower-entered sanitized device/source note. The
 *    row's `source` stays `manual`; the device note never upgrades it.
 *  - `shelly-ht-gen4[:<sub>]` — Shelly H&T Gen4 live ingest.
 *  - anything else — returns null (caller falls back to source label).
 */
import { formatSensorDeviceDetail as formatShellyDeviceDetail } from "@/lib/shellyHtWebhookRules";
import { extractManualDeviceNote } from "@/lib/manualSensorSourceLabel";

export function formatSensorDeviceDetail(
  deviceId: string | null | undefined,
): string | null {
  const manualNote = extractManualDeviceNote(deviceId);
  if (manualNote) return manualNote;
  return formatShellyDeviceDetail(deviceId);
}
