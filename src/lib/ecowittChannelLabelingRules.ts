/**
 * ecowittChannelLabelingRules — pure, read-only view-model builder that
 * turns a raw EcoWitt payload into operator-facing channel rows.
 *
 * Boundaries (stop-ship if violated):
 *  - Pure: no I/O, no React, no Supabase, no timers, no auth, no fetch.
 *  - Read-only: never writes sensor_readings, grow_events, action_queue,
 *    and never returns a device-control instruction.
 *  - Never marks local/test/manual/stale evidence as "Live".
 *  - Never infers plant identity from channel number.
 *  - Never auto-assigns a channel to a plant.
 *  - Never classifies invalid / stale / rejected values as healthy.
 *  - Detection is limited to families already supported by
 *    `ecowittPayloadAdapter` / `ecowittPayloadRules` (soil moisture
 *    channels 1..16, temp1f..temp8f, humidity1..humidity8). Out-of-range
 *    channel indices are preserved but flagged "unsupported".
 */

export type EcowittChannelFamily =
  | "soil_moisture"
  | "air_temperature"
  | "humidity"
  | "other";

export type EcowittChannelStatus =
  | "accepted"
  | "rejected"
  | "missing"
  | "invalid"
  | "stale"
  | "not_checked";

export type EcowittEvidenceSource =
  | "live"
  | "local"
  | "test"
  | "manual"
  | "csv"
  | "stale"
  | "unknown";

export type EcowittCanonicalMetric =
  | "soil_moisture_pct"
  | "temp_f"
  | "humidity_pct";

export interface DetectedEcowittChannel {
  rawKey: string;
  channel: number | null;
  family: EcowittChannelFamily;
  familyLabel: string;
  canonicalMetric: EcowittCanonicalMetric | null;
  value: number | null;
  unit: string;
  /** Formatted display value, e.g. "33%", "72.5°F", or "—". */
  valueLabel: string;
  status: EcowittChannelStatus;
  /** ISO timestamp of the source evidence, if known. */
  capturedAt: string | null;
  /** Operator-safe reason for rejected/missing/invalid/stale, "" otherwise. */
  reason: string;
  /** Known safe label supplied by caller (never inferred from payload). */
  knownLabel: string | null;
  /** "Unassigned channel" when no known label is provided. */
  assignmentLabel: string;
  /** False when the channel matches an EcoWitt family but is out of range. */
  supported: boolean;
}

export interface DetectedEcowittChannelGroup {
  family: EcowittChannelFamily;
  familyLabel: string;
  canonicalMetric: EcowittCanonicalMetric | null;
  channels: DetectedEcowittChannel[];
  /** Set when more than one channel is present for a single canonical metric. */
  multiChannelWarning: string | null;
}

export interface EcowittChannelLabelingViewModel {
  hasChannels: boolean;
  /** Operator copy explaining the slice is read-only. */
  readOnlyNotice: string;
  groups: DetectedEcowittChannelGroup[];
  /** Channels with recognized family shape but out-of-range / unsupported. */
  unsupported: DetectedEcowittChannel[];
  warnings: string[];
}

export interface BuildEcowittChannelLabelingOptions {
  /** Single capturedAt for the whole snapshot (audit/latest evidence). */
  capturedAt?: string | null;
  /** Evidence source label — controls stale handling. Never promoted to live. */
  evidenceSource?: EcowittEvidenceSource;
  /** Optional per-rawKey safe labels surfaced as "Known label". */
  knownLabels?: Readonly<Record<string, string>>;
  /** Injected wall clock for deterministic stale evaluation. */
  now?: Date;
  /** Stale threshold in ms (defaults to 60 minutes). */
  staleAfterMs?: number;
}

export const READ_ONLY_CHANNEL_NOTICE =
  "Read-only channel review. Assignments are not saved yet.";

export const MULTI_SOIL_MOISTURE_WARNING =
  "Multiple soil moisture channels detected — Verdant currently surfaces the primary channel as `soil_moisture_pct`; review raw channels before plant-specific interpretation.";

const DEFAULT_STALE_AFTER_MS = 60 * 60 * 1000;

const SOIL_RE = /^soilmoisture(\d{1,2})$/i;
const TEMP_F_RE = /^temp(\d{1,2})f$/i;
const HUMIDITY_RE = /^humidity(\d{1,2})$/i;

const FAMILY_LABELS: Record<EcowittChannelFamily, string> = {
  soil_moisture: "Soil moisture",
  air_temperature: "Air temperature",
  humidity: "Humidity",
  other: "Other",
};

const FAMILY_METRICS: Record<
  Exclude<EcowittChannelFamily, "other">,
  EcowittCanonicalMetric
> = {
  soil_moisture: "soil_moisture_pct",
  air_temperature: "temp_f",
  humidity: "humidity_pct",
};

interface ParsedKey {
  family: EcowittChannelFamily;
  channel: number;
  /** False when channel index is outside Verdant's supported range. */
  supported: boolean;
}

function parseRawKey(rawKey: string): ParsedKey | null {
  const soil = SOIL_RE.exec(rawKey);
  if (soil) {
    const ch = Number(soil[1]);
    return {
      family: "soil_moisture",
      channel: ch,
      supported: Number.isInteger(ch) && ch >= 1 && ch <= 16,
    };
  }
  const temp = TEMP_F_RE.exec(rawKey);
  if (temp) {
    const ch = Number(temp[1]);
    return {
      family: "air_temperature",
      channel: ch,
      supported: Number.isInteger(ch) && ch >= 1 && ch <= 8,
    };
  }
  const hum = HUMIDITY_RE.exec(rawKey);
  if (hum) {
    const ch = Number(hum[1]);
    return {
      family: "humidity",
      channel: ch,
      supported: Number.isInteger(ch) && ch >= 1 && ch <= 8,
    };
  }
  return null;
}

function coerceNumber(raw: unknown): { value: number | null; invalid: boolean } {
  if (raw === null || raw === undefined || raw === "") {
    return { value: null, invalid: false };
  }
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return { value: null, invalid: true };
  return { value: n, invalid: false };
}

function formatValueLabel(
  family: EcowittChannelFamily,
  value: number | null,
): string {
  if (value === null) return "—";
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  switch (family) {
    case "soil_moisture":
    case "humidity":
      return `${text}%`;
    case "air_temperature":
      return `${text}°F`;
    default:
      return text;
  }
}

function evaluateValue(
  family: EcowittChannelFamily,
  value: number | null,
): { status: EcowittChannelStatus; reason: string } {
  if (value === null) return { status: "missing", reason: "" };
  switch (family) {
    case "soil_moisture":
      if (value < 0 || value > 100) {
        return {
          status: "rejected",
          reason: "Soil moisture out of plausible range (0–100%).",
        };
      }
      return { status: "accepted", reason: "" };
    case "humidity":
      if (value < 0 || value > 100) {
        return {
          status: "rejected",
          reason: "Humidity out of plausible range (0–100%).",
        };
      }
      return { status: "accepted", reason: "" };
    case "air_temperature":
      if (value < -40 || value > 150) {
        return {
          status: "rejected",
          reason: "Temperature out of plausible range (-40°F to 150°F).",
        };
      }
      return { status: "accepted", reason: "" };
    default:
      return { status: "not_checked", reason: "" };
  }
}

function ageMs(capturedAt: string | null, now: Date): number | null {
  if (!capturedAt) return null;
  const t = Date.parse(capturedAt);
  if (!Number.isFinite(t)) return null;
  return now.getTime() - t;
}

export function buildEcowittChannelLabelingViewModel(
  payload: unknown,
  options: BuildEcowittChannelLabelingOptions = {},
): EcowittChannelLabelingViewModel {
  const now = options.now ?? new Date();
  const staleAfter = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const capturedAt =
    typeof options.capturedAt === "string" && options.capturedAt.length > 0
      ? options.capturedAt
      : null;
  const evidenceSource = options.evidenceSource ?? "unknown";
  const knownLabels = options.knownLabels ?? {};

  const supportedChannels: DetectedEcowittChannel[] = [];
  const unsupported: DetectedEcowittChannel[] = [];

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const obj = payload as Record<string, unknown>;
    for (const [rawKey, rawValue] of Object.entries(obj)) {
      const parsed = parseRawKey(rawKey);
      if (!parsed) continue;

      const { value, invalid } = coerceNumber(rawValue);
      const familyLabel = FAMILY_LABELS[parsed.family];
      const canonicalMetric =
        parsed.family === "other"
          ? null
          : FAMILY_METRICS[parsed.family];

      let status: EcowittChannelStatus;
      let reason: string;

      if (!parsed.supported) {
        status = "not_checked";
        reason =
          "Unsupported channel — raw key preserved but not mapped to a canonical metric.";
      } else if (invalid) {
        status = "invalid";
        reason = "Value is not a finite number.";
      } else {
        const evaluated = evaluateValue(parsed.family, value);
        status = evaluated.status;
        reason = evaluated.reason;
      }

      // Stale handling never promotes a reading to live.
      if (
        status === "accepted" &&
        (evidenceSource === "stale" ||
          (capturedAt !== null &&
            (() => {
              const a = ageMs(capturedAt, now);
              return a !== null && a > staleAfter;
            })()))
      ) {
        status = "stale";
        reason = "Reading is older than the live freshness window.";
      }

      const knownLabel =
        typeof knownLabels[rawKey] === "string" && knownLabels[rawKey].length > 0
          ? knownLabels[rawKey]
          : null;

      const channel: DetectedEcowittChannel = {
        rawKey,
        channel: parsed.channel,
        family: parsed.family,
        familyLabel,
        canonicalMetric,
        value,
        unit:
          parsed.family === "air_temperature"
            ? "°F"
            : parsed.family === "humidity" || parsed.family === "soil_moisture"
              ? "%"
              : "",
        valueLabel: formatValueLabel(parsed.family, value),
        status,
        capturedAt,
        reason,
        knownLabel,
        assignmentLabel: knownLabel ?? "Unassigned channel",
        supported: parsed.supported,
      };

      if (parsed.supported) {
        supportedChannels.push(channel);
      } else {
        unsupported.push(channel);
      }
    }
  }

  // Deterministic sort: family priority, then channel asc, then raw key.
  const familyOrder: Record<EcowittChannelFamily, number> = {
    soil_moisture: 0,
    air_temperature: 1,
    humidity: 2,
    other: 3,
  };

  const sortChannels = (
    a: DetectedEcowittChannel,
    b: DetectedEcowittChannel,
  ): number => {
    const ac = a.channel ?? Number.POSITIVE_INFINITY;
    const bc = b.channel ?? Number.POSITIVE_INFINITY;
    if (ac !== bc) return ac - bc;
    return a.rawKey.localeCompare(b.rawKey);
  };

  const groupsByFamily = new Map<EcowittChannelFamily, DetectedEcowittChannel[]>();
  for (const ch of supportedChannels) {
    const arr = groupsByFamily.get(ch.family) ?? [];
    arr.push(ch);
    groupsByFamily.set(ch.family, arr);
  }
  unsupported.sort(sortChannels);

  const groups: DetectedEcowittChannelGroup[] = Array.from(
    groupsByFamily.entries(),
  )
    .map(([family, channels]) => {
      channels.sort(sortChannels);
      const canonicalMetric =
        family === "other" ? null : FAMILY_METRICS[family];
      const multiChannelWarning =
        family === "soil_moisture" && channels.length > 1
          ? MULTI_SOIL_MOISTURE_WARNING
          : null;
      return {
        family,
        familyLabel: FAMILY_LABELS[family],
        canonicalMetric,
        channels,
        multiChannelWarning,
      };
    })
    .sort((a, b) => familyOrder[a.family] - familyOrder[b.family]);

  const warnings: string[] = [];
  for (const g of groups) {
    if (g.multiChannelWarning) warnings.push(g.multiChannelWarning);
  }

  return {
    hasChannels: supportedChannels.length > 0 || unsupported.length > 0,
    readOnlyNotice: READ_ONLY_CHANNEL_NOTICE,
    groups,
    unsupported,
    warnings,
  };
}
