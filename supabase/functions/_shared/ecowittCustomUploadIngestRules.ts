/**
 * EcoWitt Customized-upload claim ingest.
 *
 * Pure: no React, no Supabase, no fetch, no clock except the injected `now`.
 * Date and percent handling follow `tools/ecowitt-testbench/ecowitt_listener.py`
 * (strict `YYYY-MM-DD HH:MM:SS` UTC, reject clocks more than five minutes
 * ahead, drop stuck 0/100 percent readings, ignore unknown keys). Air and
 * soil come from channels 1–8 through `routeEcoWittPayloadToTents` and the
 * tent's `air_channels` / `soil_channels`. Indoor `tempinf` / `humidityin`
 * are never tent air. Unmapped channels are dropped. Air temperature outside
 * −10..50 °C is dropped here even though the shared router allows 60 °C.
 * `sensor_readings_dedupe_uidx` is unique on (user, tent, source, metric,
 * captured_at), so this planner emits one row per metric: the mean of the
 * valid channels. Each channel's number and raw value stay on
 * `raw_payload.channels`. A suspect 0% relative-humidity channel stays on
 * that list and is left out of the mean, so 60 and 0 do not become 30.
 * Soil at 0 or 100, and humidity at 100, stay in the mean. The row quality
 * is `degraded` (the `validate_sensor_reading` allow-list is
 * ok/degraded/stale/invalid). The channel flag `suspect` records the rail
 * so the card can say the value is real and not healthy. `co2` stays on the
 * claim tent. A missing metric is not stored as a healthy zero.
 *
 * The claim token and PASSKEY never appear in stored rows or in the plan's
 * public fields. Callers hash them before planning.
 */

import { routeEcoWittPayloadToTents } from "./ecowittChannelTentRouter.ts";

export const ECOWITT_CUSTOM_UPLOAD_MAX_BODY_BYTES = 64 * 1024;
export const ECOWITT_CUSTOM_UPLOAD_FUTURE_SKEW_MS = 5 * 60 * 1000;
export const ECOWITT_CUSTOM_UPLOAD_MAX_AGE_MS = ECOWITT_CUSTOM_UPLOAD_FUTURE_SKEW_MS;
export const ECOWITT_CUSTOM_UPLOAD_DEFAULT_INTERVAL_SECONDS = 16;
export const ECOWITT_CUSTOM_UPLOAD_MIN_INTERVAL_SECONDS = 16;
export const ECOWITT_CUSTOM_UPLOAD_MAX_INTERVAL_SECONDS = 600;
/**
 * Stamped on every row this planner writes, so the station card can tell its
 * rows from the passkey bridge's live rows on the same tent (#2732 P3-1).
 */
export const ECOWITT_CUSTOM_UPLOAD_INGEST_PATH = "ecowitt_custom_upload";

/** Marker keys copied from the listener. PASSKEY is intentionally absent. */
export const ECOWITT_CUSTOM_UPLOAD_GATEWAY_MARKERS = [
  "stationtype",
  "model",
  "dateutc",
  "freq",
  "runtime",
  "wh65batt",
  "wh25batt",
] as const;

const GATEWAY_MARKER_SET = new Set<string>(ECOWITT_CUSTOM_UPLOAD_GATEWAY_MARKERS);

export type EcowittCustomUploadMetric =
  "temperature_c" | "humidity_pct" | "soil_moisture_pct" | "co2_ppm";

export type EcowittCustomUploadChannel = `air${number}` | `soil${number}` | "co2";

export interface EcowittCustomUploadClaim {
  readonly id: string;
  readonly userId: string;
  readonly tentId: string;
  readonly passkeySha256: string | null;
  readonly stationtype: string | null;
  readonly intervalSeconds: number;
  readonly revokedAt: string | null;
  readonly lastReceivedAt: string | null;
  readonly lastCapturedAt: string | null;
}

export interface EcowittCustomUploadStoredReading {
  readonly userId: string;
  readonly tentId: string;
  readonly source: "live";
  readonly metric: EcowittCustomUploadMetric;
  readonly value: number;
  readonly quality: "ok" | "degraded";
  readonly capturedAt: string;
  readonly receivedAt: string;
  readonly rawPayload: {
    readonly vendor: "ecowitt";
    readonly ingest_path: typeof ECOWITT_CUSTOM_UPLOAD_INGEST_PATH;
    /** The claim that wrote the row. The owner can already read claim ids. */
    readonly claim_id: string;
    readonly aggregation: "mean";
    readonly channels: readonly {
      readonly channel: number;
      readonly rawKey: string;
      readonly rawValue: string;
      readonly value: number;
      readonly suspect: boolean;
      readonly includedInMean: boolean;
    }[];
    readonly passkeyFingerprint: string;
    readonly timestampSource: "ecowitt_dateutc";
  };
}

export type EcowittCustomUploadRejection =
  | "method_not_allowed"
  | "missing_claim_token"
  | "payload_too_large"
  | "unsupported_body"
  | "unknown_claim"
  | "claim_revoked"
  | "upgrade_required"
  | "entitlement_lookup_failed"
  | "passkey_malformed"
  | "stationtype_missing"
  | "not_a_gateway_packet"
  | "passkey_mismatch"
  | "rate_limited"
  | "dateutc_invalid"
  | "dateutc_in_future"
  | "dateutc_too_old"
  | "duplicate_captured_at"
  | "no_storable_metrics"
  | "store_failed";

export type EcowittCustomUploadEntitlement = "allowed" | "upgrade_required" | "lookup_failed";

export interface EcowittCustomUploadIngestPlan {
  readonly httpStatus: 200;
  readonly accepted: boolean;
  readonly reason: EcowittCustomUploadRejection | "stored";
  readonly rows: readonly EcowittCustomUploadStoredReading[];
  readonly bind: { readonly passkeySha256: string; readonly stationtype: string } | null;
  readonly touchReceivedAt: string | null;
}

export interface EcowittCustomUploadPlanInput {
  readonly method: string;
  readonly pathname: string;
  readonly bodyByteLength: number;
  readonly fields: Readonly<Record<string, string>> | null;
  readonly claim: EcowittCustomUploadClaim | null;
  readonly entitlement: EcowittCustomUploadEntitlement;
  readonly now: Date;
  /** SHA-256 hex of the lowercased PASSKEY, or null when it is not 32 hex chars. */
  readonly passkeySha256: string | null;
  /** Tent EcoWitt air channels, 1–8. Empty means no channel is tent air. */
  readonly airChannels: readonly number[];
  /** Tent EcoWitt soil channels, 1–8. Empty means no soil channel is stored. */
  readonly soilChannels: readonly number[];
}

const AIR_TEMP_C_MIN = -10;
const AIR_TEMP_C_MAX = 50;
const CO2_PPM_MIN = 200;
const CO2_PPM_MAX = 10000;

function reject(reason: EcowittCustomUploadRejection): EcowittCustomUploadIngestPlan {
  return {
    httpStatus: 200,
    accepted: false,
    reason,
    rows: [],
    bind: null,
    touchReceivedAt: null,
  };
}

/** Fahrenheit to Celsius. Same ratio as `fahrenheitToCelsius` in temperatureUnits. */
export function customUploadFahrenheitToCelsius(fahrenheit: number): number {
  return (fahrenheit - 32) * (5 / 9);
}

export function clampCustomUploadIntervalSeconds(intervalSeconds: number): number {
  if (!Number.isFinite(intervalSeconds)) return ECOWITT_CUSTOM_UPLOAD_DEFAULT_INTERVAL_SECONDS;
  const whole = Math.trunc(intervalSeconds);
  if (whole < ECOWITT_CUSTOM_UPLOAD_MIN_INTERVAL_SECONDS) {
    return ECOWITT_CUSTOM_UPLOAD_DEFAULT_INTERVAL_SECONDS;
  }
  if (whole > ECOWITT_CUSTOM_UPLOAD_MAX_INTERVAL_SECONDS) {
    return ECOWITT_CUSTOM_UPLOAD_MAX_INTERVAL_SECONDS;
  }
  return whole;
}

/** Minimum gap between accepted packets: max(8s, half the gateway interval). */
export function customUploadMinimumGapMs(intervalSeconds: number): number {
  const intervalMs = clampCustomUploadIntervalSeconds(intervalSeconds) * 1000;
  return Math.max(8_000, intervalMs / 2);
}

export function isCustomUploadPacketStale(
  lastPacketAt: string | null,
  intervalSeconds: number,
  now: Date,
): boolean {
  if (lastPacketAt === null) return false;
  const parsed = Date.parse(lastPacketAt);
  if (!Number.isFinite(parsed)) return true;
  const windowMs = clampCustomUploadIntervalSeconds(intervalSeconds) * 3 * 1000;
  return now.getTime() - parsed > windowMs;
}

/**
 * Path token for `/ew/<token>`. The gateway UI path is `ew/<token>` with no
 * leading slash; the HTTP path includes the slash. Returns null unless the
 * token is 32–128 hex characters.
 */
export function ecowittClaimTokenFromPath(pathname: string): string | null {
  const match = /^\/ew\/([0-9a-fA-F]{32,128})\/?$/.exec(pathname);
  if (!match) return null;
  return match[1].toLowerCase();
}

export function isEcowittPasskey(value: string): boolean {
  return /^[0-9a-fA-F]{32}$/.test(value.trim());
}

/** Strict EcoWitt `dateutc`. Rollover dates such as Feb 31 fail closed. */
export function parseEcowittCustomUploadDateutc(value: string): string | null {
  const raw = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})[ +](\d{2}):(\d{2}):(\d{2})$/.exec(raw);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null;
  const utc = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(utc);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute ||
    check.getUTCSeconds() !== second
  ) {
    return null;
  }
  return check.toISOString().replace(".000Z", "Z");
}

export function validateEcowittCustomUploadDateutc(value: string, now: Date): string | null {
  const canonical = parseEcowittCustomUploadDateutc(value);
  if (canonical === null) return null;
  const parsed = Date.parse(canonical);
  if (!Number.isFinite(parsed)) return null;
  if (parsed > now.getTime() + ECOWITT_CUSTOM_UPLOAD_FUTURE_SKEW_MS) return null;
  if (parsed < now.getTime() - ECOWITT_CUSTOM_UPLOAD_MAX_AGE_MS) return null;
  return canonical;
}

function lowercasedFields(fields: Readonly<Record<string, string>>): Map<string, string | null> {
  const grouped = new Map<string, Set<string>>();
  for (const [key, value] of Object.entries(fields)) {
    const lower = key.toLowerCase();
    const values = grouped.get(lower) ?? new Set<string>();
    values.add(value);
    grouped.set(lower, values);
  }
  const resolved = new Map<string, string | null>();
  for (const [key, values] of grouped) {
    resolved.set(key, values.size === 1 ? [...values][0] : null);
  }
  return resolved;
}

export function looksLikeEcowittCustomUploadGateway(
  fields: Readonly<Record<string, string>>,
): boolean {
  const keys = new Set([...lowercasedFields(fields).keys()]);
  let markers = 0;
  for (const key of keys) {
    if (GATEWAY_MARKER_SET.has(key)) markers += 1;
  }
  return markers >= 2;
}

function coerceFinite(value: string | null): number | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "true" || trimmed === "false") return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed === -9999) return null;
  return parsed;
}

function stationTypeFrom(fields: Map<string, string | null>): string | null {
  const raw = fields.get("stationtype");
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed.length > 64) return null;
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null;
  return trimmed;
}

interface ChannelSample {
  readonly metric: EcowittCustomUploadMetric;
  readonly channel: number;
  readonly rawKey: string;
  readonly value: number;
  readonly rawValue: string;
  readonly suspect: boolean;
}

function channelsInRange(channels: readonly number[]): number[] {
  return channels.filter((channel) => channel >= 1 && channel <= 8);
}

function percentSuspect(metric: EcowittCustomUploadMetric, value: number): boolean {
  return (
    (metric === "humidity_pct" || metric === "soil_moisture_pct") && (value <= 0 || value >= 100)
  );
}

function metricSamples(
  fields: Map<string, string | null>,
  airChannels: readonly number[],
  soilChannels: readonly number[],
  passkeyFingerprint: string,
): readonly ChannelSample[] {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of fields) payload[key] = value;
  const routed = routeEcoWittPayloadToTents({
    payload,
    payloadPasskeyFingerprint: passkeyFingerprint,
    eligibleTents: [
      {
        tent_id: "claim",
        passkey_fingerprint: passkeyFingerprint,
        air_channels: channelsInRange(airChannels),
        soil_channels: channelsInRange(soilChannels),
      },
    ],
  });
  const samples: ChannelSample[] = [];
  for (const group of routed.groups) {
    for (const reading of group.readings) {
      if (
        reading.metric === "temperature_c" &&
        (reading.value < AIR_TEMP_C_MIN || reading.value > AIR_TEMP_C_MAX)
      ) {
        continue;
      }
      const raw = fields.get(reading.source_channel_key);
      if ((raw ?? "").trim() === "-9999") continue;
      samples.push({
        metric: reading.metric,
        channel: reading.channel,
        rawKey: reading.source_channel_key,
        value: reading.value,
        rawValue: (raw ?? "").trim(),
        suspect: percentSuspect(reading.metric, reading.value),
      });
    }
  }
  const co2 = coerceFinite(fields.get("co2") ?? null);
  if (co2 !== null && co2 >= CO2_PPM_MIN && co2 <= CO2_PPM_MAX) {
    samples.push({
      metric: "co2_ppm",
      channel: 0,
      rawKey: "co2",
      value: co2,
      rawValue: (fields.get("co2") ?? "").trim(),
      suspect: false,
    });
  }
  return samples;
}

/** One row per metric. Mean of the channels that survived routing and the −10..50 °C air bound. */
function aggregateCustomUploadSamples(
  samples: readonly ChannelSample[],
): ReadonlyMap<EcowittCustomUploadMetric, readonly ChannelSample[]> {
  const grouped = new Map<EcowittCustomUploadMetric, ChannelSample[]>();
  for (const sample of samples) {
    const list = grouped.get(sample.metric) ?? [];
    list.push(sample);
    grouped.set(sample.metric, list);
  }
  return grouped;
}

function dateutcFailure(
  fields: Map<string, string | null>,
  now: Date,
): "dateutc_invalid" | "dateutc_in_future" | "dateutc_too_old" | null {
  const raw = fields.get("dateutc");
  const canonical = raw === null || raw === undefined ? null : parseEcowittCustomUploadDateutc(raw);
  if (canonical === null) return "dateutc_invalid";
  const parsed = Date.parse(canonical);
  if (!Number.isFinite(parsed)) return "dateutc_invalid";
  if (parsed > now.getTime() + ECOWITT_CUSTOM_UPLOAD_FUTURE_SKEW_MS) return "dateutc_in_future";
  if (parsed < now.getTime() - ECOWITT_CUSTOM_UPLOAD_MAX_AGE_MS) return "dateutc_too_old";
  return null;
}

function duplicateCapturedAt(claim: EcowittCustomUploadClaim, capturedAt: string): boolean {
  if (claim.lastCapturedAt === null) return false;
  const previous = Date.parse(claim.lastCapturedAt);
  const next = Date.parse(capturedAt);
  return Number.isFinite(previous) && Number.isFinite(next) && previous === next;
}

function rateLimited(claim: EcowittCustomUploadClaim, now: Date): boolean {
  if (claim.lastReceivedAt === null) return false;
  const previous = Date.parse(claim.lastReceivedAt);
  if (!Number.isFinite(previous)) return true;
  return now.getTime() - previous < customUploadMinimumGapMs(claim.intervalSeconds);
}

export function planEcowittCustomUploadIngest(
  input: EcowittCustomUploadPlanInput,
): EcowittCustomUploadIngestPlan {
  if (input.method.toUpperCase() !== "POST") return reject("method_not_allowed");
  if (ecowittClaimTokenFromPath(input.pathname) === null) return reject("missing_claim_token");
  if (input.bodyByteLength > ECOWITT_CUSTOM_UPLOAD_MAX_BODY_BYTES) {
    return reject("payload_too_large");
  }
  if (input.fields === null) return reject("unsupported_body");
  if (input.claim === null) return reject("unknown_claim");
  if (input.claim.revokedAt !== null) return reject("claim_revoked");

  switch (input.entitlement) {
    case "allowed":
      break;
    case "upgrade_required":
      return reject("upgrade_required");
    case "lookup_failed":
      return reject("entitlement_lookup_failed");
    default: {
      const unreachable: never = input.entitlement;
      throw new Error(`Unhandled entitlement: ${String(unreachable)}`);
    }
  }

  const claim = input.claim;

  const fields = lowercasedFields(input.fields);
  const passkeyRaw = fields.get("passkey");
  if (passkeyRaw === null || passkeyRaw === undefined || !isEcowittPasskey(passkeyRaw)) {
    return reject("passkey_malformed");
  }
  if (input.passkeySha256 === null || !/^[0-9a-f]{64}$/.test(input.passkeySha256)) {
    return reject("passkey_malformed");
  }
  const passkeySha256 = input.passkeySha256;
  const stationtype = stationTypeFrom(fields);
  if (stationtype === null) return reject("stationtype_missing");
  if (!looksLikeEcowittCustomUploadGateway(input.fields)) return reject("not_a_gateway_packet");
  if (claim.passkeySha256 !== null && claim.passkeySha256 !== passkeySha256) {
    return reject("passkey_mismatch");
  }
  if (rateLimited(claim, input.now)) return reject("rate_limited");

  const dateProblem = dateutcFailure(fields, input.now);
  if (dateProblem !== null) return reject(dateProblem);
  const capturedAt = validateEcowittCustomUploadDateutc(fields.get("dateutc") ?? "", input.now);
  if (capturedAt === null) return reject("dateutc_invalid");
  if (duplicateCapturedAt(claim, capturedAt)) return reject("duplicate_captured_at");

  const samples = metricSamples(
    fields,
    input.airChannels,
    input.soilChannels,
    passkeySha256.slice(0, 16),
  );
  const grouped = aggregateCustomUploadSamples(samples);
  if (grouped.size === 0) return reject("no_storable_metrics");

  const receivedAt = input.now.toISOString();
  const rows: EcowittCustomUploadStoredReading[] = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([metric, channels]) => {
      const included = channels.filter(
        (channel) => !(metric === "humidity_pct" && channel.suspect && channel.value <= 0),
      );
      if (included.length === 0) return [];
      const mean = included.reduce((sum, channel) => sum + channel.value, 0) / included.length;
      return [
        {
          userId: claim.userId,
          tentId: claim.tentId,
          source: "live" as const,
          metric,
          value: Math.round(mean * 100) / 100,
          quality: channels.some((channel) => channel.suspect)
            ? ("degraded" as const)
            : ("ok" as const),
          capturedAt,
          receivedAt,
          rawPayload: {
            vendor: "ecowitt" as const,
            ingest_path: ECOWITT_CUSTOM_UPLOAD_INGEST_PATH,
            claim_id: claim.id,
            aggregation: "mean" as const,
            channels: channels.map((channel) => ({
              channel: channel.channel,
              rawKey: channel.rawKey,
              rawValue: channel.rawValue,
              value: channel.value,
              suspect: channel.suspect,
              includedInMean: included.includes(channel),
            })),
            passkeyFingerprint: passkeySha256.slice(0, 16),
            timestampSource: "ecowitt_dateutc" as const,
          },
        },
      ];
    });

  return {
    httpStatus: 200,
    accepted: true,
    reason: "stored",
    rows,
    bind: claim.passkeySha256 === null ? { passkeySha256, stationtype } : null,
    touchReceivedAt: receivedAt,
  };
}

/** application/x-www-form-urlencoded body. Unknown keys are kept for marker checks and then ignored. */
export function parseEcowittCustomUploadForm(body: string): Record<string, string> | null {
  if (body.includes("\0")) return null;
  const params = new URLSearchParams(body);
  const fields: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    if (key === "") return null;
    fields[key] = value;
  }
  return fields;
}
