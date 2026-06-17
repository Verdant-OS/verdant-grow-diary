/**
 * sensorIngestProvenance — constants for provenance-safe sensor ingest.
 *
 * Source truth:
 *   `sensor_readings.source` is a small trust/state label, not a vendor,
 *   transport, protocol, bridge, app, or integration name.
 *
 * Provenance truth:
 *   Vendor/transport/bridge/app details belong in `raw_payload` or a
 *   future provenance registry, never as new canonical source labels.
 *
 * No I/O. No React. No schema assumptions. No source-label expansion.
 */

export const CANONICAL_SENSOR_SOURCES = [
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
] as const;

export type CanonicalSensorSource = (typeof CANONICAL_SENSOR_SOURCES)[number];

export const SENSOR_PROVENANCE_TRANSPORTS = [
  "api",
  "mqtt",
  "webhook",
  "csv_export",
  "file_import",
  "manual_entry",
  "ble",
  "local_bridge",
] as const;

export type SensorProvenanceTransport =
  (typeof SENSOR_PROVENANCE_TRANSPORTS)[number];

export const SENSOR_PROVENANCE_APPS = [
  "spider_farmer_ggs",
  "home_assistant",
  "raspberry_pi_bridge",
  "esp32_bridge",
  "ecowitt",
  "manual_quick_log",
  "unknown_app",
] as const;

export type SensorProvenanceApp = (typeof SENSOR_PROVENANCE_APPS)[number];

export const NON_CANONICAL_SOURCE_ALIASES = [
  "api",
  "mqtt",
  "mqtt_esp32",
  "home_assistant",
  "pi_bridge",
  "raspberry_pi_bridge",
  "esp32_bridge",
  "webhook",
  "ble",
  "cron",
  "import",
  "csv_import",
  "file_import",
  "spider_farmer_ggs",
  "ggs_api",
  "ggs_export",
  "ecowitt",
  "unknown",
] as const;

export type NonCanonicalSourceAlias =
  (typeof NON_CANONICAL_SOURCE_ALIASES)[number];

export interface SensorIngestProvenanceExample {
  source: CanonicalSensorSource;
  raw_payload: {
    source_app: SensorProvenanceApp;
    transport: SensorProvenanceTransport;
    vendor?: string;
    bridge?: string;
    external_device_id?: string;
  };
}

export const SENSOR_PROVENANCE_EXAMPLES: readonly SensorIngestProvenanceExample[] = [
  {
    source: "live",
    raw_payload: {
      source_app: "spider_farmer_ggs",
      transport: "api",
      vendor: "spider_farmer",
      external_device_id: "redacted-device-id",
    },
  },
  {
    source: "live",
    raw_payload: {
      source_app: "raspberry_pi_bridge",
      transport: "mqtt",
      bridge: "tent_bridge_01",
    },
  },
  {
    source: "csv",
    raw_payload: {
      source_app: "spider_farmer_ggs",
      transport: "csv_export",
      vendor: "spider_farmer",
    },
  },
  {
    source: "manual",
    raw_payload: {
      source_app: "manual_quick_log",
      transport: "manual_entry",
    },
  },
] as const;

const CANONICAL_SET = new Set<string>(CANONICAL_SENSOR_SOURCES);

export function isCanonicalSensorSource(
  value: unknown,
): value is CanonicalSensorSource {
  return typeof value === "string" && CANONICAL_SET.has(value);
}

export function assertCanonicalSensorSource(
  value: unknown,
): CanonicalSensorSource | null {
  return isCanonicalSensorSource(value) ? value : null;
}

export function isNonCanonicalSourceAlias(value: unknown): boolean {
  return (
    typeof value === "string" &&
    (NON_CANONICAL_SOURCE_ALIASES as readonly string[]).includes(value)
  );
}
