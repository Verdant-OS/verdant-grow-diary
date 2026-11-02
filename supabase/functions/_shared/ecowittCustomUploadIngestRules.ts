/**
 * EcoWitt Customized-upload claim ingest.
 *
 * Pure: no React, no Supabase, no fetch, no clock except the injected `now`.
 * Date and percent handling follow `tools/ecowitt-testbench/ecowitt_listener.py`
 * (strict `YYYY-MM-DD HH:MM:SS` UTC, reject clocks more than five minutes
 * ahead, drop stuck 0/100 percent readings, ignore unknown keys). This path
 * stores indoor `tempinf` / `humidityin`, soil channel 1, and `co2` only.
 * It does not treat a missing metric as a healthy zero.
 *
 * The claim token and PASSKEY never appear in stored rows or in the plan's
 * public fields. Callers hash them before planning.
 */

export const ECOWITT_CUSTOM_UPLOAD_MAX_BODY_BYTES = 64 * 1024;
export const ECOWITT_CUSTOM_UPLOAD_FUTURE_SKEW_MS = 5 * 60 * 1000;
export const ECOWITT_CUSTOM_UPLOAD_MAX_AGE_MS = ECOWITT_CUSTOM_UPLOAD_FUTURE_SKEW_MS;
export const ECOWITT_CUSTOM_UPLOAD_DEFAULT_INTERVAL_SECONDS = 16;
export const ECOWITT_CUSTOM_UPLOAD_MIN_INTERVAL_SECONDS = 16;
export const ECOWITT_CUSTOM_UPLOAD_MAX_INTERVAL_SECONDS = 600;

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

export type EcowittCustomUploadChannel = "indoor" | "soil1" | "co2";

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
  readonly quality: "ok";
  readonly capturedAt: string;
  readonly receivedAt: string;
  readonly rawPayload: {
    readonly vendor: "ecowitt";
    readonly channel: EcowittCustomUploadChannel;
    readonly rawKey: string;
    readonly rawValue: string;
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
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(raw);
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
  if (!Number.isFinite(parsed)) return null;
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

interface MetricDraft {
  readonly metric: EcowittCustomUploadMetric;
  readonly channel: EcowittCustomUploadChannel;
  readonly rawKey: string;
  readonly value: number;
  readonly rawValue: string;
}

function metricDrafts(fields: Map<string, string | null>): readonly MetricDraft[] {
  const drafts: MetricDraft[] = [];
  const indoorF = coerceFinite(fields.get("tempinf") ?? null);
  if (indoorF !== null) {
    const celsius = customUploadFahrenheitToCelsius(indoorF);
    if (celsius >= AIR_TEMP_C_MIN && celsius <= AIR_TEMP_C_MAX) {
      drafts.push({
        metric: "temperature_c",
        channel: "indoor",
        rawKey: "tempinf",
        value: celsius,
        rawValue: (fields.get("tempinf") ?? "").trim(),
      });
    }
  }
  const humidity = coerceFinite(fields.get("humidityin") ?? null);
  if (humidity !== null && humidity > 0 && humidity < 100) {
    drafts.push({
      metric: "humidity_pct",
      channel: "indoor",
      rawKey: "humidityin",
      value: humidity,
      rawValue: (fields.get("humidityin") ?? "").trim(),
    });
  }
  const soil = coerceFinite(fields.get("soilmoisture1") ?? null);
  if (soil !== null && soil > 0 && soil < 100) {
    drafts.push({
      metric: "soil_moisture_pct",
      channel: "soil1",
      rawKey: "soilmoisture1",
      value: soil,
      rawValue: (fields.get("soilmoisture1") ?? "").trim(),
    });
  }
  const co2 = coerceFinite(fields.get("co2") ?? null);
  if (co2 !== null && co2 >= CO2_PPM_MIN && co2 <= CO2_PPM_MAX) {
    drafts.push({
      metric: "co2_ppm",
      channel: "co2",
      rawKey: "co2",
      value: co2,
      rawValue: (fields.get("co2") ?? "").trim(),
    });
  }
  return drafts;
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

  const drafts = metricDrafts(fields);
  if (drafts.length === 0) return reject("no_storable_metrics");

  const receivedAt = input.now.toISOString();
  const rows: EcowittCustomUploadStoredReading[] = drafts.map((draft) => ({
    userId: claim.userId,
    tentId: claim.tentId,
    source: "live",
    metric: draft.metric,
    value: draft.value,
    quality: "ok",
    capturedAt,
    receivedAt,
    rawPayload: {
      vendor: "ecowitt",
      channel: draft.channel,
      rawKey: draft.rawKey,
      rawValue: draft.rawValue,
      passkeyFingerprint: passkeySha256,
      timestampSource: "ecowitt_dateutc",
    },
  }));

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
