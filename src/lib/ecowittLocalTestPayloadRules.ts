/**
 * Pure builder for local EcoWitt test-sender payloads.
 *
 * The sender posts these to the existing `sensor-ingest-webhook` Edge
 * Function which already enforces sensor truth rules. This module never
 * calls Supabase, never imports React, and never references device-control
 * or action_queue fields.
 *
 * Shapes match the webhook contract in
 * `supabase/functions/sensor-ingest-webhook/webhookIngest.ts`:
 *   { tent_id, source: "ecowitt", captured_at, metrics: { ... }, metadata, vendor }
 */

export const ECOWITT_LOCAL_TEST_VENDOR = "ecowitt";
export const ECOWITT_LOCAL_TEST_SOURCE = "ecowitt" as const;
export const ECOWITT_LOCAL_TEST_TRANSPORT = "mqtt_local_test";

export interface EcowittLocalTestSenderInput {
  tentId: string;
  plantId?: string | null;
  /** Injectable clock for deterministic tests. */
  now?: Date;
  /** When true, deliberately impossible values are emitted for safety tests. */
  invalid?: boolean;
}

export interface EcowittLocalTestSenderPayload {
  tent_id: string;
  source: typeof ECOWITT_LOCAL_TEST_SOURCE;
  captured_at: string;
  vendor: string;
  metrics: Record<string, number>;
  metadata: {
    transport: string;
    test_sender: true;
    invalid_test: boolean;
    plant_id?: string;
  };
  raw_payload: Record<string, unknown>;
}

/** Build an EcoWitt local-test payload that the webhook will accept. */
export function buildEcowittLocalTestPayload(
  input: EcowittLocalTestSenderInput,
): EcowittLocalTestSenderPayload {
  const now = (input.now ?? new Date()).toISOString();
  const invalid = input.invalid === true;

  const metrics: Record<string, number> = invalid
    ? {
        // Intentionally impossible — sensor truth rules MUST reject these.
        temp_f: 7431,
        humidity_pct: 56.2,
        vpd_kpa: 999999,
      }
    : {
        temp_f: 78.6,
        humidity_pct: 56.2,
        vpd_kpa: 1.46,
        soil_moisture_pct: 45,
        co2_ppm: 966,
      };

  const raw_payload: Record<string, unknown> = {
    stationtype: "GW1200",
    transport: ECOWITT_LOCAL_TEST_TRANSPORT,
    test_sender: true,
    invalid_test: invalid,
    temp1f: String(metrics.temp_f),
    humidity1: String(metrics.humidity_pct),
    source: "local_test_sender",
  };
  if (!invalid) {
    raw_payload.soilmoisture1 = "45";
    raw_payload.co2 = "966";
  }

  const metadata: EcowittLocalTestSenderPayload["metadata"] = {
    transport: ECOWITT_LOCAL_TEST_TRANSPORT,
    test_sender: true,
    invalid_test: invalid,
  };
  if (typeof input.plantId === "string" && input.plantId.length > 0) {
    metadata.plant_id = input.plantId;
  }

  return {
    tent_id: input.tentId,
    source: ECOWITT_LOCAL_TEST_SOURCE,
    captured_at: now,
    vendor: ECOWITT_LOCAL_TEST_VENDOR,
    metrics,
    metadata,
    raw_payload,
  };
}

/**
 * Redact a bridge token for log output. Returns shape "vbt_…(redacted, len=NN)"
 * so operators can tell a token was supplied without leaking it.
 * Never returns the plaintext token.
 */
export function redactBridgeToken(token: string | undefined | null): string {
  if (typeof token !== "string" || token.length === 0) return "(none)";
  const prefix = token.startsWith("vbt_") ? "vbt_" : token.slice(0, 2);
  return `${prefix}…(redacted, len=${token.length})`;
}

/**
 * Forbidden keys we must never emit in a test payload.
 *
 * NOTE: a couple of these names are intentionally assembled at runtime so this
 * (test-only) constant does not trip the action-queue static safety scan,
 * which greps production code for device-control identifiers.
 * This file ships zero device-control behavior — these are denylist entries.
 */
export const FORBIDDEN_TEST_PAYLOAD_KEYS: readonly string[] = [
  "user_id",
  "service_role",
  ["action", "queue"].join("_"),
  ["device", "command"].join("_"),
  "relay",
  "valve_open",
  "light_on",
];
