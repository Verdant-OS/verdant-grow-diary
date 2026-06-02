/**
 * EcoWitt Payload Adapter v1 — pure mapper.
 *
 * Maps raw EcoWitt custom-upload payloads (query/form-style flat objects or
 * JSON objects, with string OR numeric values) into a `BridgeIntakePayload`
 * compatible with `sensorBridgeIntakeRules`.
 *
 * Boundaries (stop-ship if violated):
 *  - Pure function: no fetch, no DB client, no localStorage, no timers, no
 *    wall-clock reads unless an explicit `serverReceivedAt` is injected.
 *  - Never performs auth checks, never trusts caller-supplied user_id, never
 *    trusts a submitted source label as "live", never marks readings as live.
 *  - Never persists, never raises notifications, never queues workflow
 *    items, never calls diagnostic assistants, never controls devices, never
 *    produces device-control output.
 *  - Never returns vendor passkeys, MAC addresses, or other identifying
 *    secrets in user-visible output. Final validation, source classification,
 *    and suspicion checks remain delegated to `sensorBridgeIntakeRules`.
 *  - Does NOT duplicate validation tables (range checks, stuck-at-extreme,
 *    Celsius-as-Fahrenheit suspicion, µS/cm suspicion, pH ranges, freshness):
 *    those stay in the intake rules and are exercised in adapter tests via
 *    handoff, not redefined here.
 */

import type {
  BridgeIntakePayload,
  BridgeMetricKey,
  BridgeReadingInput,
} from "@/lib/sensorBridgeIntakeRules";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type EcoWittAdapterWarningCode =
  | "gateway_indoor_used_without_explicit_selection"
  | "multiple_temperature_channels_no_mapping"
  | "multiple_humidity_channels_no_mapping"
  | "multiple_soil_moisture_channels_no_mapping"
  | "configured_channel_missing"
  | "captured_at_missing"
  | "server_received_at_used_as_fallback"
  | "co2_value_implausible"
  | "device_state_field_ignored"
  | "vendor_credential_field_suppressed";

export type EcoWittAdapterReasonCode =
  | "payload_not_object"
  | "no_readings_mapped";

export interface EcoWittAdapterMetadata {
  vendor: "ecowitt";
  device_family: "ecowitt_custom_upload";
  /** Safe, non-PII station identifier when present (e.g. "GW2000A"). */
  station_type?: string | null;
  /** True if captured_at came from server_received_at rather than payload. */
  server_received_at_used: boolean;
  /** Count of suppressed credential-like fields; values are never returned. */
  suppressed_credential_fields: number;
  /** Count of recognized device-state fields skipped (battery, signal, ...). */
  ignored_device_state_fields: number;
}

export interface EcoWittChannelMapping {
  /** Channel index ("1".."8") to use as canopy/air temperature. */
  air_temp?: string;
  /** Channel index ("1".."8") to use as canopy humidity. */
  humidity?: string;
  /** Channel index ("1".."8") to use as soil moisture. */
  soil_moisture?: string;
}

export interface EcoWittAdapterOptions {
  /** Server-resolved tent id. Never read from the payload. */
  tentId?: string | null;
  /** Server-resolved plant id. Never read from the payload. */
  plantId?: string | null;
  /** Explicit per-vendor channel selection. */
  channelMapping?: EcoWittChannelMapping;
  /**
   * When true, gateway/indoor (`tempinf` / `humidityin` / `co2in`) may be
   * mapped without an outdoor/canopy channel — still emits a warning.
   */
  allowGatewayIndoor?: boolean;
  /**
   * Optional fallback for `captured_at` when the payload has no parseable
   * date. Only used when `allowServerReceivedAtFallback` is true.
   */
  serverReceivedAt?: string;
  /** Opt-in to using `serverReceivedAt` when payload date is missing. */
  allowServerReceivedAtFallback?: boolean;
}

export interface EcoWittAdapterResult {
  ok: boolean;
  input: BridgeIntakePayload;
  warnings: EcoWittAdapterWarningCode[];
  reasons: EcoWittAdapterReasonCode[];
  metadata: EcoWittAdapterMetadata;
}

// ---------------------------------------------------------------------------
// Internal — safe key sets (never duplicate intake validation here)
// ---------------------------------------------------------------------------

/** Field name prefixes we never accept as caller-supplied trust signals. */
const CREDENTIAL_LIKE_KEYS = new Set<string>([
  "passkey",
  "password",
  "pass",
  "apikey",
  "api_key",
  "token",
  "secret",
  "mac",
  "imei",
  "device_id_private",
]);

/** Device-state / metadata fields we explicitly ignore as readings. */
const DEVICE_STATE_KEYS = new Set<string>([
  "wh65batt",
  "wh25batt",
  "wh40batt",
  "wh57batt",
  "soilbatt1",
  "soilbatt2",
  "soilbatt3",
  "soilbatt4",
  "batt1",
  "batt2",
  "batt3",
  "batt4",
  "signal",
  "rssi",
  "freq",
  "model",
  "interval",
  "switch",
  "fan",
  "fanstate",
  "lightstate",
  "relay",
  "relay1",
  "relay2",
]);

const TEMP_F_CHANNEL_RE = /^temp([1-8])f$/i;
const HUMIDITY_CHANNEL_RE = /^humidity([1-8])$/i;
const SOIL_MOISTURE_CHANNEL_RE = /^soilmoisture([1-8])$/i;

// CO2 is broadly "ppm in Earth atmosphere": ambient ~400, indoor common <2000,
// hard cap well below industrial sensor max. Anything outside is flagged.
const CO2_PLAUSIBLE_MIN = 200;
const CO2_PLAUSIBLE_MAX = 10000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function coerceFiniteNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function nonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/**
 * EcoWitt's `dateutc` is typically `YYYY-MM-DD HH:MM:SS` (UTC, no zone). Some
 * gateways send ISO 8601. We accept both and reject anything else by
 * returning null — `sensorBridgeIntakeRules` then handles the missing-date
 * branch and labels invalid intake honestly.
 */
function parseEcoWittDate(v: unknown): string | null {
  const s = nonEmptyString(v);
  if (!s) return null;
  // Treat naked "YYYY-MM-DD HH:MM:SS" as UTC.
  const naive = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(s);
  const iso = naive ? s.replace(" ", "T") + (s.endsWith("Z") ? "" : "Z") : s;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

function lowerKeyed(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k.toLowerCase()] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main adapter
// ---------------------------------------------------------------------------

export function adaptEcoWittPayloadToBridgeInput(
  payload: unknown,
  options: EcoWittAdapterOptions = {},
): EcoWittAdapterResult {
  const warnings: EcoWittAdapterWarningCode[] = [];
  const reasons: EcoWittAdapterReasonCode[] = [];

  if (!isPlainObject(payload)) {
    return {
      ok: false,
      input: emptyIntakePayload(options),
      warnings,
      reasons: ["payload_not_object"],
      metadata: emptyMetadata(),
    };
  }

  const lower = lowerKeyed(payload);

  // 1. Suppress credential-like fields entirely from any returned output.
  let suppressedCreds = 0;
  for (const k of Object.keys(lower)) {
    if (CREDENTIAL_LIKE_KEYS.has(k)) {
      suppressedCreds += 1;
      delete lower[k];
    }
  }
  if (suppressedCreds > 0) {
    warnings.push("vendor_credential_field_suppressed");
  }

  // 2. Count device-state fields ignored (but don't include their values).
  let ignoredDeviceState = 0;
  for (const k of Object.keys(lower)) {
    if (DEVICE_STATE_KEYS.has(k)) {
      ignoredDeviceState += 1;
    }
  }
  if (ignoredDeviceState > 0) {
    warnings.push("device_state_field_ignored");
  }

  // 3. Map readings.
  const readings: BridgeReadingInput[] = [];

  // Temperature — Fahrenheit per EcoWitt convention. Pass unit hint so the
  // existing intake rules can apply Celsius-as-Fahrenheit suspicion when the
  // unit hint is missing on other sources; here unit is explicitly F.
  const tempChannels = collectNumericChannels(lower, TEMP_F_CHANNEL_RE);
  const tempSelected = pickChannel(
    tempChannels,
    options.channelMapping?.air_temp,
    "multiple_temperature_channels_no_mapping",
    warnings,
  );
  if (tempSelected) {
    readings.push({
      metric: "temperature_c",
      value: fahrenheitToCelsius(tempSelected.value),
      unit: "C",
    });
  } else if (
    options.channelMapping?.air_temp &&
    !tempChannels.has(options.channelMapping.air_temp)
  ) {
    warnings.push("configured_channel_missing");
  }

  // Gateway indoor temp — only when no outdoor channel exists OR explicitly
  // allowed. Always warns; never silently treated as canopy.
  const tempinF = coerceFiniteNumber(lower["tempinf"]);
  if (tempinF !== null && !tempSelected) {
    if (options.allowGatewayIndoor) {
      readings.push({
        metric: "temperature_c",
        value: fahrenheitToCelsius(tempinF),
        unit: "C",
      });
    }
    warnings.push("gateway_indoor_used_without_explicit_selection");
  }

  // Humidity — percent
  const humidityChannels = collectNumericChannels(lower, HUMIDITY_CHANNEL_RE);
  const humiditySelected = pickChannel(
    humidityChannels,
    options.channelMapping?.humidity,
    "multiple_humidity_channels_no_mapping",
    warnings,
  );
  if (humiditySelected) {
    readings.push({
      metric: "humidity_pct",
      value: humiditySelected.value,
      unit: "%",
    });
  } else if (
    options.channelMapping?.humidity &&
    !humidityChannels.has(options.channelMapping.humidity)
  ) {
    warnings.push("configured_channel_missing");
  }

  const humidityIn = coerceFiniteNumber(lower["humidityin"]);
  if (humidityIn !== null && !humiditySelected) {
    if (options.allowGatewayIndoor) {
      readings.push({
        metric: "humidity_pct",
        value: humidityIn,
        unit: "%",
      });
    }
    warnings.push("gateway_indoor_used_without_explicit_selection");
  }

  // Soil moisture — percent (EcoWitt soilmoistureN is already percent)
  const soilChannels = collectNumericChannels(lower, SOIL_MOISTURE_CHANNEL_RE);
  const soilSelected = pickChannel(
    soilChannels,
    options.channelMapping?.soil_moisture,
    "multiple_soil_moisture_channels_no_mapping",
    warnings,
  );
  if (soilSelected) {
    readings.push({
      metric: "soil_moisture_pct",
      value: soilSelected.value,
      unit: "%",
    });
  } else if (
    options.channelMapping?.soil_moisture &&
    !soilChannels.has(options.channelMapping.soil_moisture)
  ) {
    warnings.push("configured_channel_missing");
  }

  // CO2 — ppm. Only map when numeric AND plausible.
  const co2Raw =
    coerceFiniteNumber(lower["co2"]) ??
    coerceFiniteNumber(lower["co2_ppm"]) ??
    coerceFiniteNumber(lower["co2in"]);
  if (co2Raw !== null) {
    if (co2Raw >= CO2_PLAUSIBLE_MIN && co2Raw <= CO2_PLAUSIBLE_MAX) {
      readings.push({
        metric: "co2_ppm",
        value: co2Raw,
        unit: "ppm",
      });
    } else {
      warnings.push("co2_value_implausible");
    }
  }

  // 4. Timestamp.
  const payloadDate =
    parseEcoWittDate(lower["dateutc"]) ?? parseEcoWittDate(lower["date"]);
  let capturedAt: string | null = payloadDate;
  let serverFallbackUsed = false;
  if (!capturedAt) {
    if (
      options.allowServerReceivedAtFallback &&
      options.serverReceivedAt &&
      parseEcoWittDate(options.serverReceivedAt)
    ) {
      capturedAt = parseEcoWittDate(options.serverReceivedAt);
      serverFallbackUsed = true;
      warnings.push("server_received_at_used_as_fallback");
    } else {
      warnings.push("captured_at_missing");
    }
  }

  // 5. Station type (safe, non-PII vendor metadata).
  const stationType = nonEmptyString(lower["stationtype"]);

  // 6. Build BridgeIntakePayload. Never trust submitted source.
  //    Never echo back any unknown payload bag.
  const intake: BridgeIntakePayload = {
    tent_id: options.tentId ?? null,
    plant_id: options.plantId ?? null,
    submitted_source: "unknown",
    captured_at: capturedAt,
    confidence: 0.5,
    readings,
    authenticated: false,
  };

  if (readings.length === 0) {
    reasons.push("no_readings_mapped");
  }

  return {
    ok: readings.length > 0,
    input: intake,
    warnings: dedupeOrdered(warnings),
    reasons,
    metadata: {
      vendor: "ecowitt",
      device_family: "ecowitt_custom_upload",
      station_type: stationType,
      server_received_at_used: serverFallbackUsed,
      suppressed_credential_fields: suppressedCreds,
      ignored_device_state_fields: ignoredDeviceState,
    },
  };
}

// ---------------------------------------------------------------------------
// Channel helpers
// ---------------------------------------------------------------------------

interface ChannelEntry {
  channel: string;
  value: number;
}

function collectNumericChannels(
  lower: Record<string, unknown>,
  re: RegExp,
): Map<string, ChannelEntry> {
  const out = new Map<string, ChannelEntry>();
  for (const [k, v] of Object.entries(lower)) {
    const m = re.exec(k);
    if (!m) continue;
    const numeric = coerceFiniteNumber(v);
    if (numeric === null) continue;
    out.set(m[1], { channel: m[1], value: numeric });
  }
  return out;
}

function pickChannel(
  channels: Map<string, ChannelEntry>,
  configured: string | undefined,
  ambiguousWarning: EcoWittAdapterWarningCode,
  warnings: EcoWittAdapterWarningCode[],
): ChannelEntry | null {
  if (channels.size === 0) return null;
  if (configured) {
    return channels.get(configured) ?? null;
  }
  if (channels.size === 1) {
    return [...channels.values()][0];
  }
  warnings.push(ambiguousWarning);
  return null;
}

function fahrenheitToCelsius(f: number): number {
  return ((f - 32) * 5) / 9;
}

function emptyIntakePayload(opts: EcoWittAdapterOptions): BridgeIntakePayload {
  return {
    tent_id: opts.tentId ?? null,
    plant_id: opts.plantId ?? null,
    submitted_source: "unknown",
    captured_at: null,
    confidence: 0.5,
    readings: [],
    authenticated: false,
  };
}

function emptyMetadata(): EcoWittAdapterMetadata {
  return {
    vendor: "ecowitt",
    device_family: "ecowitt_custom_upload",
    station_type: null,
    server_received_at_used: false,
    suppressed_credential_fields: 0,
    ignored_device_state_fields: 0,
  };
}

function dedupeOrdered<T>(arr: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const item of arr) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

export const __ecowitt_internal = {
  TEMP_F_CHANNEL_RE,
  HUMIDITY_CHANNEL_RE,
  SOIL_MOISTURE_CHANNEL_RE,
  CO2_PLAUSIBLE_MIN,
  CO2_PLAUSIBLE_MAX,
};

/**
 * Helper type alias — the metric keys this adapter can emit. Kept narrow so
 * future fields (PPFD, soil EC, soil temp) require an intentional change to
 * both the adapter and the intake contract.
 */
export type EcoWittEmittedMetric = Extract<
  BridgeMetricKey,
  "temperature_c" | "humidity_pct" | "soil_moisture_pct" | "co2_ppm"
>;
