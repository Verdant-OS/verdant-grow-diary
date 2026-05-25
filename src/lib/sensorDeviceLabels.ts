/**
 * Single source of truth for device-specific sensor labels.
 *
 * Augments — never duplicates — the `SOURCE_LABEL` map in
 * `sensorSnapshot.ts`. UI surfaces call `formatSensorDeviceDetail`
 * to attach a device-detail badge next to the canonical source label
 * (e.g. "Live sensor" + "Shelly H&T Gen4").
 *
 * Pure. No I/O. No React. No Supabase.
 */
export { formatSensorDeviceDetail } from "@/lib/shellyHtWebhookRules";
