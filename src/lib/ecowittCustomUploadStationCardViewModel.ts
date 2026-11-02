/**
 * Station card for one tent's EcoWitt customized-upload readings.
 *
 * Pure. Shows only source `live` rows. Missing metrics stay blank.
 * Temperature is stored Celsius and displayed Fahrenheit.
 * Stale means the last packet is older than three gateway intervals.
 */

import { ECOWITT_CUSTOM_UPLOAD_COPY } from "@/constants/ecowittCustomUploadCopy";
import {
  ECOWITT_CUSTOM_UPLOAD_DEFAULT_INTERVAL_SECONDS,
  isCustomUploadPacketStale,
} from "@/lib/ecowittCustomUploadIngestRules";
import { celsiusToFahrenheit } from "@/lib/temperatureUnits";

export type EcowittStationClaimState = "none" | "unbound" | "active" | "revoked";

export interface EcowittStationReadingInput {
  readonly tentId: string;
  readonly metric: string;
  readonly value: number;
  readonly source: string;
  readonly quality: string;
  readonly capturedAt: string | null;
}

export interface EcowittStationCardInput {
  readonly tentId: string | null;
  readonly readings: readonly EcowittStationReadingInput[];
  readonly now: Date;
  readonly intervalSeconds?: number;
  readonly lastReceivedAt: string | null;
  readonly claimState: EcowittStationClaimState;
  /** Raw token from the create call in this session. Never invented here. */
  readonly justCreatedToken: string | null;
  readonly createError?: string | null;
}

export interface EcowittStationSetting {
  readonly label: string;
  readonly value: string;
}

export interface EcowittStationCardModel {
  readonly sectionLabel: string;
  readonly emptyMessage: string | null;
  readonly freshness: "none" | "live" | "stale";
  readonly freshnessLabel: string | null;
  readonly indoorTempF: string | null;
  readonly indoorRh: string | null;
  readonly soil1: string | null;
  readonly co2: string | null;
  readonly lastReadingLabel: string | null;
  readonly settingsTitle: string;
  readonly settings: readonly EcowittStationSetting[];
  readonly tokenOnceNote: string;
  readonly createLinkLabel: string;
  readonly createError: string | null;
  readonly canCreateLink: boolean;
  readonly revoked: boolean;
}

const LIVE_METRICS = ["temperature_c", "humidity_pct", "soil_moisture_pct", "co2_ppm"] as const;
type LiveMetric = (typeof LIVE_METRICS)[number];

function isLiveMetric(metric: string): metric is LiveMetric {
  return (LIVE_METRICS as readonly string[]).includes(metric);
}

function latestLive(
  readings: readonly EcowittStationReadingInput[],
  tentId: string,
  metric: LiveMetric,
): EcowittStationReadingInput | null {
  let best: EcowittStationReadingInput | null = null;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const reading of readings) {
    if (reading.tentId !== tentId) continue;
    if (reading.source !== "live") continue;
    if (reading.quality !== "ok") continue;
    if (reading.metric !== metric || !isLiveMetric(reading.metric)) continue;
    if (!Number.isFinite(reading.value)) continue;
    if (reading.capturedAt === null) continue;
    const ms = Date.parse(reading.capturedAt);
    if (!Number.isFinite(ms)) continue;
    if (ms >= bestMs) {
      best = reading;
      bestMs = ms;
    }
  }
  return best;
}

function formatTempF(celsius: number): string {
  return `${celsiusToFahrenheit(celsius).toFixed(1)} °F`;
}

function formatPercent(value: number): string {
  return `${Math.round(value)} %`;
}

function formatCo2(value: number): string {
  return `${Math.round(value)} ppm`;
}

function pathValue(token: string | null): string {
  if (token !== null && /^[0-9a-f]{32,128}$/.test(token)) return `ew/${token}`;
  return ECOWITT_CUSTOM_UPLOAD_COPY.pathPlaceholder;
}

export function buildEcowittCustomUploadStationCard(
  input: EcowittStationCardInput,
): EcowittStationCardModel {
  const interval = input.intervalSeconds ?? ECOWITT_CUSTOM_UPLOAD_DEFAULT_INTERVAL_SECONDS;
  const settings: EcowittStationSetting[] = [
    { label: "Upload", value: ECOWITT_CUSTOM_UPLOAD_COPY.uploadMode },
    { label: "Protocol", value: ECOWITT_CUSTOM_UPLOAD_COPY.protocol },
    { label: "Path", value: pathValue(input.justCreatedToken) },
    { label: "Port", value: ECOWITT_CUSTOM_UPLOAD_COPY.port },
    { label: "Interval", value: ECOWITT_CUSTOM_UPLOAD_COPY.interval },
    { label: "State", value: ECOWITT_CUSTOM_UPLOAD_COPY.enable },
  ];
  const base = {
    sectionLabel: ECOWITT_CUSTOM_UPLOAD_COPY.sectionLabel,
    settingsTitle: ECOWITT_CUSTOM_UPLOAD_COPY.settingsTitle,
    settings,
    tokenOnceNote: ECOWITT_CUSTOM_UPLOAD_COPY.tokenOnce,
    createLinkLabel: ECOWITT_CUSTOM_UPLOAD_COPY.createLink,
    createError: input.createError ?? null,
    canCreateLink:
      input.tentId !== null && input.claimState !== "active" && input.claimState !== "unbound",
    revoked: input.claimState === "revoked",
  };

  if (input.tentId === null) {
    return {
      ...base,
      emptyMessage: ECOWITT_CUSTOM_UPLOAD_COPY.empty,
      freshness: "none",
      freshnessLabel: null,
      indoorTempF: null,
      indoorRh: null,
      soil1: null,
      co2: null,
      lastReadingLabel: null,
      canCreateLink: false,
    };
  }

  const temp = latestLive(input.readings, input.tentId, "temperature_c");
  const humidity = latestLive(input.readings, input.tentId, "humidity_pct");
  const soil = latestLive(input.readings, input.tentId, "soil_moisture_pct");
  const co2 = latestLive(input.readings, input.tentId, "co2_ppm");
  const present = [temp, humidity, soil, co2].filter(
    (reading): reading is EcowittStationReadingInput => reading !== null,
  );

  if (present.length === 0) {
    return {
      ...base,
      emptyMessage: ECOWITT_CUSTOM_UPLOAD_COPY.empty,
      freshness: "none",
      freshnessLabel: null,
      indoorTempF: null,
      indoorRh: null,
      soil1: null,
      co2: null,
      lastReadingLabel: null,
    };
  }

  let newest: string | null = null;
  let newestMs = Number.NEGATIVE_INFINITY;
  for (const reading of present) {
    const captured = reading.capturedAt;
    if (captured === null) continue;
    const ms = Date.parse(captured);
    if (!Number.isFinite(ms) || ms < newestMs) continue;
    newest = captured;
    newestMs = ms;
  }
  if (newest === null) {
    return {
      ...base,
      emptyMessage: ECOWITT_CUSTOM_UPLOAD_COPY.empty,
      freshness: "none",
      freshnessLabel: null,
      indoorTempF: null,
      indoorRh: null,
      soil1: null,
      co2: null,
      lastReadingLabel: null,
    };
  }
  const packetAt = input.lastReceivedAt ?? newest;
  const stale = isCustomUploadPacketStale(packetAt, interval, input.now);

  return {
    ...base,
    emptyMessage: null,
    freshness: stale ? "stale" : "live",
    freshnessLabel: stale ? ECOWITT_CUSTOM_UPLOAD_COPY.stale : ECOWITT_CUSTOM_UPLOAD_COPY.live,
    indoorTempF: temp ? formatTempF(temp.value) : null,
    indoorRh: humidity ? formatPercent(humidity.value) : null,
    soil1: soil ? formatPercent(soil.value) : null,
    co2: co2 ? formatCo2(co2.value) : null,
    lastReadingLabel: `${ECOWITT_CUSTOM_UPLOAD_COPY.lastReading}: ${newest}`,
  };
}
