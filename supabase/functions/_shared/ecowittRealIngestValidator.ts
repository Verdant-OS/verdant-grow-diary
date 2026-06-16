// Edge mirror of src/lib EcoWitt real-ingest logic.
// Keep behavior in parity with src/lib via ecowitt-real-ingest-edge-parity tests.
// Do not add persistence, Supabase writes, network calls, alerts, Action Queue writes, AI calls, automation, or device control here.

import { redactEcoWittRawPayload } from "./ecowittRealIngestRedaction.ts";
import { buildEcoWittRealIngestDedupeKey } from "./ecowittRealIngestDedupe.ts";
import type {
  EcoWittNormalizedReadings,
  EcoWittRealIngestCandidate,
  EcoWittRealIngestSource,
  EcoWittRealIngestValidationResult,
} from "./ecowittRealIngestTypes.ts";

const FUTURE_TIMESTAMP_TOLERANCE_MS = 60_000;

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PLACEHOLDER_TENT_OR_PLANT_IDS: ReadonlySet<string> = new Set([
  "t1",
  "tent-1",
  "demo-tent",
  "sample-tent",
  "plant-1",
  "demo-plant",
]);

const PLACEHOLDER_DEVICE_IDS: ReadonlySet<string> = new Set([
  "",
  "demo",
  "demo-device",
  "sample-device",
  "placeholder",
  "test",
  "test-device",
]);

const VALID_SOURCES: ReadonlySet<EcoWittRealIngestSource> = new Set<
  EcoWittRealIngestSource
>(["live", "manual", "csv", "demo", "stale", "invalid"]);

const AIR_TEMP_F_MIN = 40;
const AIR_TEMP_F_MAX = 120;
const CELSIUS_LIKE_F_MIN = -20;
const CELSIUS_LIKE_F_MAX = 45;
const SOIL_TEMP_F_MIN = 30;
const SOIL_TEMP_F_MAX = 120;
const VPD_KPA_MIN = 0;
const VPD_KPA_MAX = 10;
const CO2_PPM_MIN = 0;
const CO2_PPM_MAX = 10_000;
const PPFD_MIN = 0;
const PPFD_MAX = 3000;
const SOIL_EC_PLAUSIBLE_MS_CM_MAX = 10;
const SOIL_EC_LIKELY_US_CM_THRESHOLD = 50;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    Object.prototype.toString.call(v) === "[object Object]"
  );
}

function toFiniteNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  return null;
}

function nonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isUuidShape(v: unknown): boolean {
  return typeof v === "string" && UUID_RX.test(v.trim());
}

function emptyReadings(): EcoWittNormalizedReadings {
  return {
    air_temp_f: null,
    humidity_pct: null,
    vpd_kpa: null,
    soil_water_content_pct: null,
    soil_temp_f: null,
    soil_ec: null,
    co2_ppm: null,
    ppfd: null,
  };
}

function blockedResult(
  reasons: string[],
  warnings: string[],
  partial: Partial<EcoWittRealIngestValidationResult> = {},
): EcoWittRealIngestValidationResult {
  return {
    accepted: false,
    can_persist_later: false,
    source: partial.source ?? "unknown",
    tent_id: partial.tent_id ?? null,
    plant_id: partial.plant_id ?? null,
    captured_at: partial.captured_at ?? null,
    normalized_readings: partial.normalized_readings ?? emptyReadings(),
    blocked_reasons: reasons,
    warnings,
    redacted_payload: partial.redacted_payload ?? null,
    dedupe_key: partial.dedupe_key ?? null,
  };
}

export interface ValidateEcoWittRealIngestOptions {
  reference_time: string;
  freshness_window_ms: number;
}

export function validateEcoWittRealIngestCandidate(
  candidate: unknown,
  options: ValidateEcoWittRealIngestOptions,
): EcoWittRealIngestValidationResult {
  const blocked: string[] = [];
  const warnings: string[] = [];
  const push = (arr: string[], v: string) => {
    if (!arr.includes(v)) arr.push(v);
  };

  const refTs = options ? Date.parse(String(options.reference_time)) : NaN;
  if (!options || !Number.isFinite(refTs)) {
    push(blocked, "invalid_captured_at");
    return blockedResult(blocked, warnings);
  }
  const freshnessMs =
    options && Number.isFinite(options.freshness_window_ms)
      ? Math.max(0, Number(options.freshness_window_ms))
      : 0;

  if (!isPlainObject(candidate)) {
    push(blocked, "missing_tent_id");
    push(blocked, "missing_captured_at");
    push(blocked, "source_unknown");
    return blockedResult(blocked, warnings);
  }

  const c = candidate as Partial<EcoWittRealIngestCandidate> & {
    readings?: unknown;
    raw_payload?: unknown;
  };

  let tentId: string | null = null;
  if (!nonEmptyString(c.tent_id)) {
    push(blocked, "missing_tent_id");
  } else {
    const t = (c.tent_id as string).trim();
    if (PLACEHOLDER_TENT_OR_PLANT_IDS.has(t.toLowerCase())) {
      push(blocked, "non_uuid_tent_id");
    } else if (!isUuidShape(t)) {
      push(blocked, "non_uuid_tent_id");
    } else {
      tentId = t;
    }
  }

  let plantId: string | null = null;
  if (c.plant_id === undefined || c.plant_id === null) {
    push(warnings, "plant_id_missing");
  } else if (!nonEmptyString(c.plant_id)) {
    push(blocked, "non_uuid_plant_id");
  } else {
    const p = (c.plant_id as string).trim();
    if (PLACEHOLDER_TENT_OR_PLANT_IDS.has(p.toLowerCase())) {
      push(blocked, "non_uuid_plant_id");
    } else if (!isUuidShape(p)) {
      push(blocked, "non_uuid_plant_id");
    } else {
      plantId = p;
    }
  }

  let source: EcoWittRealIngestSource | "unknown" = "unknown";
  if (typeof c.source !== "string" || c.source.length === 0) {
    push(blocked, "source_unknown");
  } else {
    const s = c.source as string;
    if (VALID_SOURCES.has(s as EcoWittRealIngestSource)) {
      source = s as EcoWittRealIngestSource;
      if (source !== "live") push(blocked, "source_not_live");
    } else {
      push(blocked, "source_unknown");
    }
  }

  let capturedAt: string | null = null;
  if (!nonEmptyString(c.captured_at)) {
    push(blocked, "missing_captured_at");
  } else {
    const raw = (c.captured_at as string).trim();
    const ts = Date.parse(raw);
    if (!Number.isFinite(ts)) {
      push(blocked, "invalid_captured_at");
    } else if (ts - refTs > FUTURE_TIMESTAMP_TOLERANCE_MS) {
      push(blocked, "invalid_captured_at");
    } else if (refTs - ts > freshnessMs) {
      push(blocked, "stale_snapshot");
      capturedAt = raw;
    } else {
      capturedAt = raw;
    }
  }

  if (!nonEmptyString(c.device_identity)) {
    push(blocked, "missing_device_identity");
  } else {
    const d = (c.device_identity as string).trim();
    if (PLACEHOLDER_DEVICE_IDS.has(d.toLowerCase())) {
      push(blocked, "placeholder_device_identity");
    }
  }

  if (!nonEmptyString(c.source_identity)) {
    push(blocked, "missing_source_identity");
  }

  const inboundReadings = isPlainObject(c.readings) ? c.readings : {};
  const normalized = emptyReadings();

  {
    const raw = (inboundReadings as Record<string, unknown>).air_temp_f;
    if (raw === undefined || raw === null) {
      push(blocked, "missing_required_metric:air_temp_f");
    } else {
      const n = toFiniteNumber(raw);
      if (n === null) {
        push(blocked, "invalid_metric:air_temp_f");
      } else if (n >= CELSIUS_LIKE_F_MIN && n <= CELSIUS_LIKE_F_MAX) {
        push(blocked, "suspicious_unit:temperature_c_as_f");
        normalized.air_temp_f = n;
      } else if (n < AIR_TEMP_F_MIN || n > AIR_TEMP_F_MAX) {
        push(blocked, "invalid_metric:air_temp_f");
      } else {
        normalized.air_temp_f = n;
      }
    }
  }

  {
    const raw = (inboundReadings as Record<string, unknown>).humidity_pct;
    if (raw === undefined || raw === null) {
      push(blocked, "missing_required_metric:humidity_pct");
    } else {
      const n = toFiniteNumber(raw);
      if (n === null) {
        push(blocked, "invalid_metric:humidity_pct");
      } else if (n < 0 || n > 100) {
        push(blocked, "invalid_metric:humidity_pct");
      } else if (n === 0 || n === 100) {
        push(blocked, "suspicious_value:humidity_stuck_0_or_100");
        normalized.humidity_pct = n;
      } else {
        normalized.humidity_pct = n;
      }
    }
  }

  {
    const raw = (inboundReadings as Record<string, unknown>).vpd_kpa;
    if (raw === undefined || raw === null) {
      push(warnings, "optional_metric_missing:vpd_kpa");
    } else {
      const n = toFiniteNumber(raw);
      if (n === null || n < VPD_KPA_MIN || n > VPD_KPA_MAX) {
        push(blocked, "invalid_metric:vpd_kpa");
      } else {
        normalized.vpd_kpa = n;
      }
    }
  }

  {
    const raw = (inboundReadings as Record<string, unknown>)
      .soil_water_content_pct;
    if (raw === undefined || raw === null) {
      push(warnings, "optional_metric_missing:soil_water_content_pct");
    } else {
      const n = toFiniteNumber(raw);
      if (n === null || n < 0 || n > 100) {
        push(blocked, "invalid_metric:soil_water_content_pct");
      } else if (n === 0 || n === 100) {
        push(blocked, "suspicious_value:soil_moisture_stuck_0_or_100");
        normalized.soil_water_content_pct = n;
      } else {
        normalized.soil_water_content_pct = n;
      }
    }
  }

  {
    const raw = (inboundReadings as Record<string, unknown>).soil_temp_f;
    if (raw === undefined || raw === null) {
      push(warnings, "optional_metric_missing:soil_temp_f");
    } else {
      const n = toFiniteNumber(raw);
      if (n === null || n < SOIL_TEMP_F_MIN || n > SOIL_TEMP_F_MAX) {
        push(blocked, "invalid_metric:soil_temp_f");
      } else {
        normalized.soil_temp_f = n;
      }
    }
  }

  {
    const raw = (inboundReadings as Record<string, unknown>).soil_ec;
    if (raw === undefined || raw === null) {
      push(warnings, "optional_metric_missing:soil_ec");
    } else {
      const n = toFiniteNumber(raw);
      if (n === null || n < 0) {
        push(blocked, "invalid_metric:soil_ec");
      } else if (n >= SOIL_EC_LIKELY_US_CM_THRESHOLD) {
        push(blocked, "suspicious_unit:soil_ec_us_cm_as_ms_cm");
        normalized.soil_ec = n;
      } else if (n > SOIL_EC_PLAUSIBLE_MS_CM_MAX) {
        push(blocked, "invalid_metric:soil_ec");
      } else {
        normalized.soil_ec = n;
      }
    }
  }

  {
    const raw = (inboundReadings as Record<string, unknown>).co2_ppm;
    if (raw === undefined || raw === null) {
      push(warnings, "optional_metric_missing:co2_ppm");
    } else {
      const n = toFiniteNumber(raw);
      if (n === null || n < CO2_PPM_MIN || n > CO2_PPM_MAX) {
        push(blocked, "invalid_metric:co2_ppm");
      } else {
        normalized.co2_ppm = n;
      }
    }
  }

  {
    const raw = (inboundReadings as Record<string, unknown>).ppfd;
    if (raw === undefined || raw === null) {
      push(warnings, "optional_metric_missing:ppfd");
    } else {
      const n = toFiniteNumber(raw);
      if (n === null || n < PPFD_MIN || n > PPFD_MAX) {
        push(blocked, "invalid_metric:ppfd");
      } else {
        normalized.ppfd = n;
      }
    }
  }

  if (c.confidence === undefined || c.confidence === null) {
    push(warnings, "confidence_defaulted");
  }

  let redacted: unknown = null;
  if (c.raw_payload !== undefined) {
    redacted = redactEcoWittRawPayload(c.raw_payload);
    push(warnings, "raw_payload_redacted");
  }

  const metricKeys: string[] = [];
  for (const [k, v] of Object.entries(normalized)) {
    if (v !== null) metricKeys.push(k);
  }
  const dedupeKey =
    tentId && capturedAt && nonEmptyString(c.device_identity) &&
    nonEmptyString(c.source_identity) && metricKeys.length > 0
      ? buildEcoWittRealIngestDedupeKey({
          tent_id: tentId,
          plant_id: plantId,
          source_identity: (c.source_identity as string).trim(),
          device_identity: (c.device_identity as string).trim(),
          captured_at: capturedAt,
          metric_keys: metricKeys,
        })
      : null;

  const accepted = blocked.length === 0 && source === "live";

  return {
    accepted,
    can_persist_later: accepted,
    source,
    tent_id: tentId,
    plant_id: plantId,
    captured_at: capturedAt,
    normalized_readings: normalized,
    blocked_reasons: blocked,
    warnings,
    redacted_payload: redacted,
    dedupe_key: dedupeKey,
  };
}
