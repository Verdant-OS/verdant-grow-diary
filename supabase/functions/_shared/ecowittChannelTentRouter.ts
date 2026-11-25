/**
 * EcoWitt channel → tent router — pure helper.
 *
 * Given a raw EcoWitt custom-upload payload (already passkey-stripped is OK,
 * we'll strip again defensively) and a set of caller-owned tents whose
 * `hardware_config.ecowitt` declares `air_channels` and `soil_channels`,
 * return per-tent reading groups ready to insert into `sensor_readings`.
 *
 * Boundaries (stop-ship if violated):
 *  - Pure: no fetch, no DB client, no auth, no timers, no wall-clock reads
 *    (caller injects `capturedAt`).
 *  - NEVER trusts the incoming payload's PASSKEY/MAC for authentication.
 *    The caller's gateway identity is passed in as a precomputed fingerprint
 *    (see `ecowittPasskeyFingerprint.ts`). PASSKEY-mismatch → drop, do not
 *    fall back, do not authenticate.
 *  - NEVER returns the raw passkey / MAC / token. Callers MUST also pass
 *    the payload through `ecowittPayloadAdapter`'s credential suppression
 *    before persisting `raw_payload`.
 *  - NEVER fans out across tents the caller does not own. The caller
 *    pre-filters `eligibleTents` to the authenticated bridge-token's tent
 *    scope. This helper trusts the list.
 *  - NEVER emits alerts, Action Queue items, AI calls, or device commands.
 */

export type EcoWittRouterMetric = "temperature_c" | "humidity_pct" | "soil_moisture_pct";

export interface EcoWittRouterReading {
  metric: EcoWittRouterMetric;
  /** Channel index 1-8 as declared by the EcoWitt payload. */
  channel: number;
  /** Final value in Verdant-canonical units (°C / %). */
  value: number;
  /** Raw channel key as seen in payload, lowercased. */
  source_channel_key: string;
}

export interface EcoWittRouterTentGroup {
  tent_id: string;
  readings: EcoWittRouterReading[];
}

export type EcoWittRouterDropReason =
  | "no_passkey_in_payload"
  | "no_eligible_tent_for_channel"
  | "channel_value_missing_or_invalid"
  | "channel_value_out_of_plausible_range"
  | "fingerprint_mismatch";

export interface EcoWittRouterDrop {
  channel_key: string;
  channel: number | null;
  metric: EcoWittRouterMetric | null;
  reason: EcoWittRouterDropReason;
}

export interface EcoWittRouterEligibleTent {
  tent_id: string;
  passkey_fingerprint: string;
  air_channels: number[];
  soil_channels: number[];
}

export interface EcoWittRouterInput {
  /** Raw EcoWitt payload as a flat lowered object. */
  payload: Record<string, unknown>;
  /** Caller-owned tents with `hardware_config.ecowitt` set. */
  eligibleTents: EcoWittRouterEligibleTent[];
  /** Precomputed fingerprint of the payload's PASSKEY. */
  payloadPasskeyFingerprint: string | null;
}

export interface EcoWittRouterResult {
  groups: EcoWittRouterTentGroup[];
  dropped: EcoWittRouterDrop[];
  /**
   * Subset of eligibleTents whose fingerprint matched the payload. Used by
   * the caller to attach the safe fingerprint to `raw_payload`.
   */
  matched_fingerprint: string | null;
}

const TEMP_F_RE = /^temp([1-8])f$/i;
const HUMIDITY_RE = /^humidity([1-8])$/i;
const SOIL_RE = /^soilmoisture([1-8])$/i;

/**
 * WH52 soil-EC probes publish moisture as `soil_ec_humN` (N = 1–8), not
 * `soilmoistureN`. `soil_ec_tempN` and `soil_ecN` are not EcoWitt router
 * metrics (`EcoWittRouterMetric` is only air temp, air humidity, and soil
 * moisture), so this class does not read them.
 *
 * When both moisture keys exist for the same N, `soilmoistureN` is the only
 * candidate. `soil_ec_humN` is skipped even if the WH51 value is later
 * dropped, so one channel cannot emit two moisture readings.
 */
export class EcoWittWh52SoilProbe {
  static readonly MOISTURE_KEY = /^soil_ec_hum([1-8])$/i;

  static moistureChannel(key: string): number | null {
    const match = EcoWittWh52SoilProbe.MOISTURE_KEY.exec(key);
    return match ? Number(match[1]) : null;
  }

  static legacyMoistureKey(channel: number): string {
    return `soilmoisture${channel}`;
  }

  /**
   * True when any key equals `soilmoistureN`, ignoring case. Callers may
   * pass the raw payload or the lowercased copy.
   */
  static legacyMoisturePresent(payload: Record<string, unknown>, channel: number): boolean {
    const wanted = EcoWittWh52SoilProbe.legacyMoistureKey(channel);
    return Object.keys(payload).some((key) => key.toLowerCase() === wanted);
  }
}

// Plausible ranges. Mirrors the suspicion thresholds in
// sensorBridgeIntakeRules so we drop garbage before fan-out (the intake
// rules remain the source of truth at insert time).
const TEMP_C_MIN = -10;
const TEMP_C_MAX = 60;
const PCT_MIN = 0;
const PCT_MAX = 100;

function coerceFinite(v: unknown): number | null {
  if (typeof v === "boolean" || v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (trimmed === "" || trimmed === "true" || trimmed === "false") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function fahrenheitToCelsius(f: number): number {
  return ((f - 32) * 5) / 9;
}

function lowerKeyed(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k.toLowerCase()] = v;
  return out;
}

function findTentForChannel(
  tents: EcoWittRouterEligibleTent[],
  channel: number,
  metric: EcoWittRouterMetric,
): EcoWittRouterEligibleTent | null {
  const list = metric === "soil_moisture_pct" ? "soil_channels" : "air_channels";
  for (const t of tents) {
    if (t[list].includes(channel)) return t;
  }
  return null;
}

export function routeEcoWittPayloadToTents(input: EcoWittRouterInput): EcoWittRouterResult {
  const dropped: EcoWittRouterDrop[] = [];
  const groupsByTent = new Map<string, EcoWittRouterReading[]>();

  // 1. No payload passkey → we cannot identify any gateway. Drop everything.
  //    We do NOT fall back to "first tent" or any global default.
  if (!input.payloadPasskeyFingerprint) {
    dropped.push({
      channel_key: "*",
      channel: null,
      metric: null,
      reason: "no_passkey_in_payload",
    });
    return { groups: [], dropped, matched_fingerprint: null };
  }

  // 2. Restrict eligible tents to those whose fingerprint matches the
  //    payload's. If none match, drop everything (no cross-gateway leakage).
  const matchedTents = input.eligibleTents.filter(
    (t) => t.passkey_fingerprint === input.payloadPasskeyFingerprint,
  );
  if (matchedTents.length === 0) {
    dropped.push({
      channel_key: "*",
      channel: null,
      metric: null,
      reason: "fingerprint_mismatch",
    });
    return {
      groups: [],
      dropped,
      matched_fingerprint: input.payloadPasskeyFingerprint,
    };
  }

  const lower = lowerKeyed(input.payload);

  // Pair temp{n}f with humidity{n} into the same air-channel tent. Both go
  // to the tent that lists channel `n` in `air_channels`. soilmoisture{n}
  // and WH52 soil_ec_hum{n} go to the tent that lists `n` in `soil_channels`.
  // The two lists can point to different tents — that's the whole point of Option C.
  for (const [rawKey, rawValue] of Object.entries(lower)) {
    const tempMatch = TEMP_F_RE.exec(rawKey);
    const humMatch = HUMIDITY_RE.exec(rawKey);
    const soilMatch = SOIL_RE.exec(rawKey);
    const wh52Channel = EcoWittWh52SoilProbe.moistureChannel(rawKey);
    if (wh52Channel !== null && EcoWittWh52SoilProbe.legacyMoisturePresent(lower, wh52Channel)) {
      continue;
    }

    let metric: EcoWittRouterMetric | null = null;
    let channel = 0;
    let value: number | null = null;

    if (tempMatch) {
      metric = "temperature_c";
      channel = Number(tempMatch[1]);
      const raw = coerceFinite(rawValue);
      value = raw === null ? null : fahrenheitToCelsius(raw);
    } else if (humMatch) {
      metric = "humidity_pct";
      channel = Number(humMatch[1]);
      value = coerceFinite(rawValue);
    } else if (soilMatch) {
      metric = "soil_moisture_pct";
      channel = Number(soilMatch[1]);
      value = coerceFinite(rawValue);
    } else if (wh52Channel !== null) {
      metric = "soil_moisture_pct";
      channel = wh52Channel;
      value = coerceFinite(rawValue);
    } else {
      continue;
    }

    if (value === null) {
      dropped.push({
        channel_key: rawKey,
        channel,
        metric,
        reason: "channel_value_missing_or_invalid",
      });
      continue;
    }

    const min = metric === "temperature_c" ? TEMP_C_MIN : PCT_MIN;
    const max = metric === "temperature_c" ? TEMP_C_MAX : PCT_MAX;
    if (value < min || value > max) {
      dropped.push({
        channel_key: rawKey,
        channel,
        metric,
        reason: "channel_value_out_of_plausible_range",
      });
      continue;
    }

    const tent = findTentForChannel(matchedTents, channel, metric);
    if (!tent) {
      dropped.push({
        channel_key: rawKey,
        channel,
        metric,
        reason: "no_eligible_tent_for_channel",
      });
      continue;
    }

    const list = groupsByTent.get(tent.tent_id) ?? [];
    list.push({
      metric,
      channel,
      // Round to 2 decimals to keep storage tidy; intake rules re-validate.
      value: Math.round(value * 100) / 100,
      source_channel_key: rawKey,
    });
    groupsByTent.set(tent.tent_id, list);
  }

  const groups: EcoWittRouterTentGroup[] = Array.from(groupsByTent.entries())
    .map(([tent_id, readings]) => ({ tent_id, readings }))
    // Stable order for deterministic tests / logs.
    .sort((a, b) => a.tent_id.localeCompare(b.tent_id));

  return {
    groups,
    dropped,
    matched_fingerprint: input.payloadPasskeyFingerprint,
  };
}
