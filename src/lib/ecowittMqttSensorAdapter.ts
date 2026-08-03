/**
 * EcoWitt MQTT sensor adapter v1.
 *
 * Transforms one decoded raw EcoWitt MQTT payload into Verdant's canonical
 * per-metric adapter readings. It performs no network, persistence, auth,
 * alerting, workflow, AI, or equipment behavior.
 */

import { toCanonicalMscm } from "@/lib/ecUnits";
import {
  isAirTempCRealistic,
  isAirTempFRealistic,
  isCo2PpmRealistic,
  isHumidityRealistic,
  isHumidityStuckExtreme,
  isSoilEcMscmRealistic,
  isSoilEcUnitMismatchSuspected,
  isSoilMoistureRealistic,
  isSoilTempCRealistic,
  isVpdRealistic,
  SOIL_EC_MSCM_RANGE,
} from "@/lib/sensorTruthRules";
import {
  SENSOR_ADAPTER_REDACTED_PAYLOAD_REF,
  buildSensorAdapterReadingId,
  canonicalUnitForSensorAdapterMetric,
  classifySensorAdapterFreshness,
  isValidSensorAdapterFreshnessPolicy,
  sortSensorAdapterReadings,
  type SensorAdapterComparisonRole,
  type SensorAdapterFreshnessPolicy,
  type SensorAdapterIngestBoundaryStatus,
  type SensorAdapterMetric,
  type SensorAdapterNormalizedUnit,
  type SensorAdapterReading,
  type SensorAdapterResult,
  type SensorAdapterSource,
  type SensorAdapterTrustLevel,
  type SensorAdapterValidity,
  type SensorAdapterValueOrigin,
  type SensorAdapterWarning,
} from "@/lib/sensorAdapterContract";
import { calculateAirVpdKpa, fahrenheitToCelsius } from "@/lib/vpdRules";

export const ECOWITT_MQTT_SENSOR_ADAPTER_ID = "ecowitt_mqtt_normalizer" as const;
export const ECOWITT_MQTT_SENSOR_ADAPTER_VERSION = "1.0.1" as const;
export const ECOWITT_MQTT_SENSOR_PROVIDER = "ecowitt" as const;
export const ECOWITT_MQTT_SENSOR_TRANSPORT = "mqtt" as const;

export type EcowittMqttReportedUnit = "°F" | "°C" | "%" | "ppm" | "kPa" | "mS/cm" | "µS/cm";

export interface EcowittMqttChannelAssignment {
  /** Exact raw payload field, matched case-insensitively. */
  raw_field: string;
  /** Server/config resolved target. Payload tent ids are never trusted. */
  tent_id: string | null;
  plant_id?: string | null;
  /** Stable grower-defined alias; defaults to the raw field name. */
  channel_ref?: string | null;
  /** Optional safe equipment alias. Never derived from MAC/station fields. */
  device_ref?: string | null;
  /** Optional explicit unit assertion. Must agree with unit-bearing keys. */
  reported_unit?: EcowittMqttReportedUnit | null;
  /** Temp/RH with the same pairing ref may derive one VPD reading. */
  pairing_ref?: string | null;
}

export interface EcowittMqttSensorAdapterInput {
  payload: unknown;
  channel_assignments: readonly EcowittMqttChannelAssignment[];
  freshness_policy: SensorAdapterFreshnessPolicy;
  /** Adapter receive time; never substituted for captured_at. */
  received_at: string;
  /** Injected clock for deterministic freshness classification. */
  now_ms: number;
}

type MetricOrigin = "ecowitt_gateway" | "ecowitt_reported" | "verdant_derived";

interface FieldDescriptor {
  raw_field: string;
  metric: SensorAdapterMetric;
  unit: EcowittMqttReportedUnit | null;
  pairing_ref: string | null;
  value_origin: SensorAdapterValueOrigin;
  comparison_role: SensorAdapterComparisonRole;
  origin_source: MetricOrigin;
}

interface TimestampParseResult {
  captured_at: string | null;
  warning: Extract<SensorAdapterWarning, "missing_timestamp" | "malformed_timestamp"> | null;
}

interface ReceivedAtParseResult {
  received_at: string | null;
  warning: Extract<SensorAdapterWarning, "malformed_received_at" | "future_received_at"> | null;
}

interface NormalizedPayloadKeysResult {
  payload: Record<string, unknown>;
  duplicate_keys: ReadonlySet<string>;
}

interface NormalizedValueResult {
  value: number | null;
  validity: SensorAdapterValidity;
  warnings: SensorAdapterWarning[];
}

interface TargetResolution {
  assignment: EcowittMqttChannelAssignment | null;
  tent_id: string | null;
  plant_id: string | null;
  channel_ref: string;
  device_ref: string | null;
  pairing_ref: string;
  warnings: SensorAdapterWarning[];
  duplicate: boolean;
}

interface ReadingWithPairing {
  reading: SensorAdapterReading;
  pairing_ref: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const MAC_RE =
  /(?:\b(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b|\b(?:[0-9a-f]{4}\.){2}[0-9a-f]{4}\b|(?:^|[^0-9a-f])[0-9a-f]{12}(?=$|[^0-9a-f]))/i;
const IPV4_CANDIDATE_RE = /\d+(?:\.\d+){3,}/g;
const IPV6_CANDIDATE_RE = /[0-9a-f:]+(?:%[a-z0-9._-]+)?/gi;
const COMMON_CREDENTIAL_PREFIX_RE =
  /(?:\bsk[-_](?:live|test|proj)(?:[-_][a-z0-9_-]+)?|\bgh[pousr]_[a-z0-9_]+|\bgithub_pat_[a-z0-9_]+|\bxox[a-z0-9]-[a-z0-9-]+|\bAKIA[A-Z0-9]{8,}|\bAIza[a-z0-9_-]+)/i;
const SECRET_VALUE_RE =
  /(?:\bvbt_[a-z0-9._-]+\b|(?:passkey|password|secret|token|api[_-]?key|apikey|service[_-]?role|bridge[_-]?token|station(?:type|id|identifier)?|mac)|\bbearer\s+\S+|\beyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+\b)/i;
const SENSITIVE_OUTPUT_KEY_RE =
  /(?:passkey|password|secret|token|api[_-]?key|apikey|auth|bearer|mac|station|service[_-]?role|gateway[_-]?(?:id|identifier)|(?:^|[_-])(?:local|private)?[_-]?ip(?:[_-]|$))/i;
const CONTROL_KEY_TOKEN_RE =
  /(?:^|[_-])(?:command|commands|cmd|control|controls|relay|switch|fan|pump|heater|humidifier|light|lamp|actuator|valve|outlet|motor|power|setpoint|target|output|pwm|duty|publish|service[_-]?call|automation|schedule|mode|enable|trigger|state)(?:[_-]|$)/i;
const CONTROL_KEY_PREFIX_RE =
  /^(?:command|commands|control|controls|relay|switch|fan|pump|heater|humidifier|actuator|valve|outlet|motor|power|setpoint|target|output|pwm|duty|publish|servicecall|automation|schedule|mode|enable|trigger)/i;

const CONTROL_KEYS = new Set([
  "command",
  "cmd",
  "command_topic",
  "control",
  "device_control",
  "relay",
  "relay1",
  "relay2",
  "switch",
  "fan",
  "fanstate",
  "pump",
  "heater",
  "humidifier",
  "light",
  "lightstate",
  "setpoint",
  "mqtt_publish",
  "publish",
  "service_call",
]);

const NON_METRIC_KEYS = new Set([
  "captured_at",
  "dateutc",
  "date",
  "_comment",
  "_fixture_kind",
  "_proof_status",
]);
const UNSAFE_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === "[object Object]"
  );
}

function lexicalCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function dedupeSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort(lexicalCompare);
}

function round(value: number, decimals = 3): number {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function isNonPublicOrLocalIpv4(candidate: string): boolean {
  const octets = candidate.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet > 255)) {
    return false;
  }
  const [first, second, third] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && (third === 0 || third === 2)) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19 || (second === 51 && third === 100))) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  );
}

function containsNonPublicOrLocalIpv4(value: string): boolean {
  return (value.match(IPV4_CANDIDATE_RE) ?? []).some(isNonPublicOrLocalIpv4);
}

function parseIpv6Segments(candidate: string): number[] | null {
  const address = candidate.split("%", 1)[0].toLowerCase();
  if (!address.includes(":") || !/^[0-9a-f:]+$/.test(address)) return null;

  const compressionParts = address.split("::");
  if (compressionParts.length > 2) return null;
  const parseSide = (side: string): string[] | null => {
    if (!side) return [];
    const segments = side.split(":");
    return segments.every((segment) => /^[0-9a-f]{1,4}$/.test(segment)) ? segments : null;
  };
  const head = parseSide(compressionParts[0]);
  const tail = parseSide(compressionParts[1] ?? "");
  if (head === null || tail === null) return null;

  let segments: string[];
  if (compressionParts.length === 2) {
    const omittedCount = 8 - head.length - tail.length;
    if (omittedCount < 1) return null;
    segments = [...head, ...Array<string>(omittedCount).fill("0"), ...tail];
  } else {
    if (head.length !== 8) return null;
    segments = head;
  }
  return segments.map((segment) => Number.parseInt(segment, 16));
}

function isNonPublicOrLocalIpv6(candidate: string): boolean {
  const segments = parseIpv6Segments(candidate);
  if (segments === null) return false;
  const first = segments[0];
  const loopback = segments.slice(0, 7).every((segment) => segment === 0) && segments[7] === 1;
  const unspecified = segments.every((segment) => segment === 0);
  const uniqueLocal = (first & 0xfe00) === 0xfc00;
  const linkLocal = (first & 0xffc0) === 0xfe80;
  return loopback || unspecified || uniqueLocal || linkLocal;
}

function containsNonPublicOrLocalIpv6(value: string): boolean {
  return (value.match(IPV6_CANDIDATE_RE) ?? []).some(isNonPublicOrLocalIpv6);
}

function containsSensitiveValue(value: string): boolean {
  return (
    SECRET_VALUE_RE.test(value) ||
    COMMON_CREDENTIAL_PREFIX_RE.test(value) ||
    MAC_RE.test(value) ||
    containsNonPublicOrLocalIpv4(value) ||
    containsNonPublicOrLocalIpv6(value)
  );
}

function canonicalizeTimestamp(
  raw: unknown,
  options: { allow_naive_ecowitt_utc: boolean },
): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const trimmed = raw.trim();
  const naive = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(trimmed);
  const candidate =
    options.allow_naive_ecowitt_utc && naive ? `${trimmed.replace(" ", "T")}Z` : trimmed;
  const parts =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})$/i.exec(
      candidate,
    );
  if (!parts) return null;

  const [, year, month, day, hour, minute, second, fraction = "0"] = parts;
  const millisecond = Number(fraction.slice(0, 3).padEnd(3, "0"));
  const calendarCheck = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      millisecond,
    ),
  );
  if (
    calendarCheck.getUTCFullYear() !== Number(year) ||
    calendarCheck.getUTCMonth() + 1 !== Number(month) ||
    calendarCheck.getUTCDate() !== Number(day) ||
    calendarCheck.getUTCHours() !== Number(hour) ||
    calendarCheck.getUTCMinutes() !== Number(minute) ||
    calendarCheck.getUTCSeconds() !== Number(second)
  ) {
    return null;
  }

  const parsed = Date.parse(candidate);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function normalizeReceivedAt(args: {
  value: string;
  now_ms: number;
  policy: SensorAdapterFreshnessPolicy;
}): ReceivedAtParseResult {
  const receivedAt = canonicalizeTimestamp(args.value, {
    allow_naive_ecowitt_utc: false,
  });
  if (receivedAt === null) {
    return { received_at: null, warning: "malformed_received_at" };
  }
  if (
    isValidSensorAdapterFreshnessPolicy(args.policy) &&
    Number.isFinite(args.now_ms) &&
    Date.parse(receivedAt) - args.now_ms > args.policy.future_clock_skew_ms
  ) {
    return { received_at: receivedAt, warning: "future_received_at" };
  }
  return { received_at: receivedAt, warning: null };
}

function parseCapturedAt(payload: Record<string, unknown>): TimestampParseResult {
  const hasCaptured = Object.hasOwn(payload, "captured_at");
  const key = hasCaptured ? "captured_at" : "dateutc";
  const raw = payload[key];
  if (raw === null || raw === undefined || raw === "") {
    return { captured_at: null, warning: "missing_timestamp" };
  }
  if (typeof raw !== "string") {
    return { captured_at: null, warning: "malformed_timestamp" };
  }

  const trimmed = raw.trim();
  if (!trimmed) return { captured_at: null, warning: "missing_timestamp" };

  const parsed = canonicalizeTimestamp(trimmed, {
    allow_naive_ecowitt_utc: key === "dateutc",
  });
  if (parsed === null) {
    return { captured_at: null, warning: "malformed_timestamp" };
  }
  return { captured_at: parsed, warning: null };
}

function normalizedPayloadKeys(payload: Record<string, unknown>): NormalizedPayloadKeysResult {
  const out: Record<string, unknown> = {};
  const duplicateKeys = new Set<string>();
  for (const key of Object.keys(payload).sort(lexicalCompare)) {
    const normalizedKey = key.toLowerCase();
    if (UNSAFE_OBJECT_KEYS.has(normalizedKey)) continue;
    if (Object.hasOwn(out, normalizedKey)) {
      duplicateKeys.add(normalizedKey);
      continue;
    }
    out[normalizedKey] = payload[key];
  }
  return { payload: out, duplicate_keys: duplicateKeys };
}

function defaultPairingRef(suffix: string | undefined): string {
  return suffix && suffix.length > 0 ? suffix : "ambient";
}

function describeField(rawField: string): FieldDescriptor | null {
  const key = rawField.toLowerCase();

  if (key === "tempf") {
    return temperatureDescriptor(key, "°F", "ambient");
  }
  if (key === "tempc") {
    return temperatureDescriptor(key, "°C", "ambient");
  }
  if (key === "tempinf") {
    return temperatureDescriptor(key, "°F", "indoor");
  }
  if (key === "tempinc") {
    return temperatureDescriptor(key, "°C", "indoor");
  }
  const tempMatch = /^temp([1-8])([fc])$/.exec(key);
  if (tempMatch) {
    return temperatureDescriptor(
      key,
      tempMatch[2] === "f" ? "°F" : "°C",
      defaultPairingRef(tempMatch[1]),
    );
  }

  if (key === "humidity") return humidityDescriptor(key, "ambient");
  if (key === "humidityin") return humidityDescriptor(key, "indoor");
  const humidityMatch = /^humidity([1-8])$/.exec(key);
  if (humidityMatch) {
    return humidityDescriptor(key, defaultPairingRef(humidityMatch[1]));
  }

  const soilMatch = /^soilmoisture(1[0-6]|[1-9])$/.exec(key);
  if (soilMatch) {
    return {
      raw_field: key,
      metric: "soil_moisture_pct",
      unit: "%",
      pairing_ref: `soil:${soilMatch[1]}`,
      value_origin: "observed",
      comparison_role: "primary",
      origin_source: "ecowitt_gateway",
    };
  }

  const soilTempMatch = /^soiltemp(1[0-6]|[1-9])([fc])$/.exec(key);
  if (soilTempMatch) {
    return {
      raw_field: key,
      metric: "soil_temp_c",
      unit: soilTempMatch[2] === "f" ? "°F" : "°C",
      pairing_ref: `soil:${soilTempMatch[1]}`,
      value_origin: "observed",
      comparison_role: "primary",
      origin_source: "ecowitt_gateway",
    };
  }

  if (["co2", "co2in", "co2_in", "co2_ppm"].includes(key)) {
    return {
      raw_field: key,
      metric: "co2_ppm",
      unit: "ppm",
      pairing_ref: key,
      value_origin: "observed",
      comparison_role: "primary",
      origin_source: "ecowitt_gateway",
    };
  }

  if (/^vpd(?:_kpa|[1-8])?$/.test(key)) {
    const suffix = /^vpd([1-8])$/.exec(key)?.[1];
    return {
      raw_field: key,
      metric: "vpd_kpa",
      unit: "kPa",
      pairing_ref: defaultPairingRef(suffix),
      value_origin: "source_reported",
      comparison_role: "reference",
      origin_source: "ecowitt_reported",
    };
  }

  const ecMatch = /^soil_?ec(?:(1[0-6]|[1-9]))?(?:_(us|µs|μs|ms)_?cm)?$/.exec(key);
  if (ecMatch) {
    const unitToken = ecMatch[2]?.toLowerCase();
    const unit = unitToken ? (unitToken === "ms" ? "mS/cm" : "µS/cm") : null;
    return {
      raw_field: key,
      metric: "ec",
      unit,
      pairing_ref: `soil:${ecMatch[1] ?? "ambient"}`,
      value_origin: "observed",
      comparison_role: "primary",
      origin_source: "ecowitt_gateway",
    };
  }

  return null;
}

function temperatureDescriptor(
  rawField: string,
  unit: "°F" | "°C",
  pairingRef: string,
): FieldDescriptor {
  return {
    raw_field: rawField,
    metric: "temperature_c",
    unit,
    pairing_ref: pairingRef,
    value_origin: "observed",
    comparison_role: "primary",
    origin_source: "ecowitt_gateway",
  };
}

function humidityDescriptor(rawField: string, pairingRef: string): FieldDescriptor {
  return {
    raw_field: rawField,
    metric: "humidity_pct",
    unit: "%",
    pairing_ref: pairingRef,
    value_origin: "observed",
    comparison_role: "primary",
    origin_source: "ecowitt_gateway",
  };
}

function safeReference(value: unknown): {
  value: string | null;
  redacted: boolean;
} {
  if (value === null || value === undefined) {
    return { value: null, redacted: false };
  }
  if (typeof value !== "string") {
    return { value: null, redacted: true };
  }
  const trimmed = value.trim();
  if (!trimmed) return { value: null, redacted: false };
  if (
    !SAFE_REF_RE.test(trimmed) ||
    containsSensitiveValue(trimmed) ||
    /(?:station|gateway)/i.test(trimmed)
  ) {
    return { value: null, redacted: true };
  }
  return { value: trimmed, redacted: false };
}

function assignmentIndex(
  assignments: readonly EcowittMqttChannelAssignment[],
): Map<string, EcowittMqttChannelAssignment[]> {
  const out = new Map<string, EcowittMqttChannelAssignment[]>();
  for (const assignment of assignments) {
    if (!assignment || typeof assignment.raw_field !== "string") continue;
    const key = assignment.raw_field.trim().toLowerCase();
    if (!key) continue;
    const existing = out.get(key) ?? [];
    existing.push(assignment);
    out.set(key, existing);
  }
  return out;
}

function resolveTarget(
  descriptor: FieldDescriptor,
  assignments: Map<string, EcowittMqttChannelAssignment[]>,
): TargetResolution {
  const matches = assignments.get(descriptor.raw_field) ?? [];
  const duplicate = matches.length > 1;
  const assignment = matches.length === 1 ? matches[0] : null;
  const warnings: SensorAdapterWarning[] = [];

  if (duplicate) warnings.push("duplicate_channel_assignment");

  const tentId =
    assignment && typeof assignment.tent_id === "string" && UUID_RE.test(assignment.tent_id)
      ? assignment.tent_id
      : null;
  if (!tentId) warnings.push("missing_tent_mapping");

  let plantId: string | null = null;
  if (assignment?.plant_id) {
    if (typeof assignment.plant_id === "string" && UUID_RE.test(assignment.plant_id)) {
      plantId = assignment.plant_id;
    } else warnings.push("invalid_plant_mapping");
  }

  const channelCandidate = safeReference(assignment?.channel_ref);
  const deviceCandidate = safeReference(assignment?.device_ref);
  const pairingCandidate = safeReference(assignment?.pairing_ref);
  if (channelCandidate.redacted || deviceCandidate.redacted || pairingCandidate.redacted) {
    warnings.push("device_reference_redacted");
  }

  return {
    assignment,
    tent_id: tentId,
    plant_id: plantId,
    channel_ref: channelCandidate.value ?? descriptor.raw_field,
    device_ref: deviceCandidate.value,
    pairing_ref: pairingCandidate.value ?? descriptor.pairing_ref ?? descriptor.raw_field,
    warnings,
    duplicate,
  };
}

function unitsAgree(
  descriptor: FieldDescriptor,
  assignment: EcowittMqttChannelAssignment | null,
): boolean {
  if (!assignment?.reported_unit || !descriptor.unit) return true;
  return assignment.reported_unit === descriptor.unit;
}

function normalizeMetricValue(args: {
  descriptor: FieldDescriptor;
  assignment: EcowittMqttChannelAssignment | null;
  raw_value: unknown;
}): NormalizedValueResult {
  const { descriptor, assignment, raw_value } = args;
  if (raw_value === null || raw_value === undefined || raw_value === "") {
    return { value: null, validity: "invalid", warnings: ["missing_value"] };
  }
  const numeric = finiteNumber(raw_value);
  if (numeric === null) {
    return {
      value: null,
      validity: "invalid",
      warnings: ["non_finite_value"],
    };
  }
  if (!unitsAgree(descriptor, assignment)) {
    return {
      value: null,
      validity: "invalid",
      warnings: [
        descriptor.metric === "temperature_c"
          ? "temperature_unit_mismatch"
          : descriptor.metric === "ec"
            ? "ec_unit_mismatch"
            : "unit_mismatch",
      ],
    };
  }

  switch (descriptor.metric) {
    case "temperature_c":
      return normalizeTemperature(numeric, descriptor.unit);
    case "humidity_pct":
      return normalizeHumidity(numeric);
    case "soil_moisture_pct":
      return normalizeSoilMoisture(numeric);
    case "soil_temp_c":
      return normalizeSoilTemperature(numeric, descriptor.unit);
    case "co2_ppm":
      return isCo2PpmRealistic(numeric) && numeric >= 250 && numeric <= 5_000
        ? valid(round(numeric))
        : invalid("co2_out_of_range");
    case "ec":
      return normalizeEc(numeric, assignment?.reported_unit ?? descriptor.unit);
    case "vpd_kpa":
      return isVpdRealistic(numeric) ? valid(round(numeric)) : invalid("vpd_out_of_range");
  }
}

function normalizeTemperature(
  numeric: number,
  unit: EcowittMqttReportedUnit | null,
): NormalizedValueResult {
  if (unit === "°F") {
    if (!isAirTempFRealistic(numeric)) {
      return invalid(
        isAirTempCRealistic(numeric) ? "temperature_unit_mismatch" : "temperature_out_of_range",
      );
    }
    return valid(round(fahrenheitToCelsius(numeric)));
  }
  if (unit === "°C") {
    if (!isAirTempCRealistic(numeric)) {
      return invalid(
        isAirTempFRealistic(numeric) ? "temperature_unit_mismatch" : "temperature_out_of_range",
      );
    }
    return valid(round(numeric));
  }
  return invalid("temperature_unit_mismatch");
}

function normalizeHumidity(numeric: number): NormalizedValueResult {
  if (!isHumidityRealistic(numeric)) return invalid("humidity_out_of_range");
  const warnings: SensorAdapterWarning[] = isHumidityStuckExtreme(numeric)
    ? ["humidity_stuck_extreme"]
    : [];
  return { value: round(numeric), validity: "valid", warnings };
}

function normalizeSoilMoisture(numeric: number): NormalizedValueResult {
  if (!isSoilMoistureRealistic(numeric)) {
    return invalid("soil_moisture_out_of_range");
  }
  const warnings: SensorAdapterWarning[] =
    numeric === 0 || numeric === 100 ? ["soil_moisture_stuck_extreme"] : [];
  return { value: round(numeric), validity: "valid", warnings };
}

function normalizeSoilTemperature(
  numeric: number,
  unit: EcowittMqttReportedUnit | null,
): NormalizedValueResult {
  if (unit === "°F") {
    const converted = fahrenheitToCelsius(numeric);
    if (!isSoilTempCRealistic(converted)) {
      return invalid(
        isSoilTempCRealistic(numeric) ? "temperature_unit_mismatch" : "temperature_out_of_range",
      );
    }
    return valid(round(converted));
  }
  if (unit === "°C") {
    if (!isSoilTempCRealistic(numeric)) {
      return invalid(
        isSoilTempCRealistic(fahrenheitToCelsius(numeric))
          ? "temperature_unit_mismatch"
          : "temperature_out_of_range",
      );
    }
    return valid(round(numeric));
  }
  return invalid("temperature_unit_mismatch");
}

function normalizeEc(numeric: number, unit: EcowittMqttReportedUnit | null): NormalizedValueResult {
  if (unit === null) {
    if (isSoilEcUnitMismatchSuspected(numeric)) {
      return invalid("ec_unit_mismatch");
    }
    return isSoilEcMscmRealistic(numeric) ? valid(round(numeric)) : invalid("ec_out_of_range");
  }
  if (unit !== "mS/cm" && unit !== "µS/cm") {
    return invalid("ec_unit_mismatch");
  }
  if (unit === "mS/cm" && isSoilEcUnitMismatchSuspected(numeric)) {
    return invalid("ec_unit_mismatch");
  }
  if (unit === "µS/cm" && numeric > SOIL_EC_MSCM_RANGE.min && numeric <= SOIL_EC_MSCM_RANGE.max) {
    return invalid("ec_unit_mismatch");
  }
  const converted = toCanonicalMscm(numeric, unit);
  if (converted === null || !isSoilEcMscmRealistic(converted)) {
    return invalid("ec_out_of_range");
  }
  return valid(round(converted));
}

function valid(value: number): NormalizedValueResult {
  return { value, validity: "valid", warnings: [] };
}

function invalid(warning: SensorAdapterWarning): NormalizedValueResult {
  return { value: null, validity: "invalid", warnings: [warning] };
}

function resolvedTrust(args: {
  source: SensorAdapterSource;
  validity: SensorAdapterValidity;
  warnings: readonly SensorAdapterWarning[];
  value_origin: SensorAdapterValueOrigin;
}): SensorAdapterTrustLevel {
  if (args.validity === "invalid" || args.source === "invalid") {
    return "untrusted";
  }
  if (
    args.source === "stale" ||
    args.value_origin === "source_reported" ||
    args.warnings.length > 0
  ) {
    return "degraded";
  }
  return "local_transport";
}

function confidenceFor(args: {
  source: SensorAdapterSource;
  validity: SensorAdapterValidity;
  trust: SensorAdapterTrustLevel;
  value_origin: SensorAdapterValueOrigin;
}): number {
  if (args.validity === "invalid" || args.source === "invalid") return 0;
  if (args.source === "stale") return 0.5;
  if (args.value_origin === "source_reported") return 0.6;
  return args.trust === "local_transport" ? 0.95 : 0.75;
}

function buildObservedReading(args: {
  descriptor: FieldDescriptor;
  target: TargetResolution;
  normalized: NormalizedValueResult;
  freshness_source: SensorAdapterSource;
  freshness_warnings: readonly SensorAdapterWarning[];
  captured_at: string | null;
  received_at: string | null;
  received_at_warning: Extract<
    SensorAdapterWarning,
    "malformed_received_at" | "future_received_at"
  > | null;
  duplicate_raw_field: boolean;
}): SensorAdapterReading {
  const mappingInvalid =
    args.target.duplicate ||
    args.target.tent_id === null ||
    args.target.warnings.includes("invalid_plant_mapping") ||
    args.received_at_warning !== null ||
    args.freshness_source === "invalid" ||
    args.duplicate_raw_field;
  const validity: SensorAdapterValidity =
    args.normalized.validity === "invalid" || mappingInvalid ? "invalid" : "valid";
  const source: SensorAdapterSource = validity === "invalid" ? "invalid" : args.freshness_source;
  const warnings = dedupeSorted([
    ...args.freshness_warnings,
    ...args.target.warnings,
    ...args.normalized.warnings,
    ...(args.duplicate_raw_field ? (["duplicate_raw_field"] as const) : []),
    ...(args.received_at_warning ? [args.received_at_warning] : []),
    ...(args.descriptor.value_origin === "source_reported"
      ? (["source_reported_vpd_reference_only"] as const)
      : []),
  ]);
  const trust = resolvedTrust({
    source,
    validity,
    warnings,
    value_origin: args.descriptor.value_origin,
  });
  const normalizedValue = validity === "valid" ? args.normalized.value : null;
  const readingId = buildSensorAdapterReadingId({
    adapter_id: ECOWITT_MQTT_SENSOR_ADAPTER_ID,
    adapter_version: ECOWITT_MQTT_SENSOR_ADAPTER_VERSION,
    metric: args.descriptor.metric,
    channel_ref: args.target.channel_ref,
    device_ref: args.target.device_ref,
    captured_at: args.captured_at,
    tent_id: args.target.tent_id,
    raw_field: args.descriptor.raw_field,
    value_origin: args.descriptor.value_origin,
  });

  return {
    source,
    provider: ECOWITT_MQTT_SENSOR_PROVIDER,
    transport: ECOWITT_MQTT_SENSOR_TRANSPORT,
    adapter_id: ECOWITT_MQTT_SENSOR_ADAPTER_ID,
    adapter_version: ECOWITT_MQTT_SENSOR_ADAPTER_VERSION,
    origin_source: args.descriptor.origin_source,
    trust_level: trust,
    captured_at: args.captured_at,
    received_at: args.received_at,
    tent_id: args.target.tent_id,
    plant_id: args.target.plant_id,
    metric: args.descriptor.metric,
    normalized_value: normalizedValue,
    normalized_unit: canonicalUnitForSensorAdapterMetric(args.descriptor.metric),
    validity,
    confidence: confidenceFor({
      source,
      validity,
      trust,
      value_origin: args.descriptor.value_origin,
    }),
    warnings,
    raw_payload_ref: SENSOR_ADAPTER_REDACTED_PAYLOAD_REF,
    channel_ref: args.target.channel_ref,
    device_ref: args.target.device_ref,
    raw_field: args.descriptor.raw_field,
    value_origin: args.descriptor.value_origin,
    comparison_role: args.descriptor.comparison_role,
    reading_id: readingId,
    ingest_boundary_status:
      validity !== "valid"
        ? "invalid"
        : args.descriptor.value_origin === "source_reported"
          ? "reference_only"
          : source === "stale"
            ? "blocked_stale"
            : "ready",
  };
}

/**
 * Two raw fields must not claim the same canonical metric/channel target.
 * Failing both readings closed is safer than silently choosing one or
 * averaging them. This check runs before derived VPD pairing.
 */
function markDuplicateChannelAssignments(
  inputs: readonly ReadingWithPairing[],
): ReadingWithPairing[] {
  const groups = new Map<string, number[]>();
  inputs.forEach(({ reading }, index) => {
    if (!reading.tent_id) return;
    const key = [reading.tent_id, reading.metric, reading.channel_ref].join("|");
    const indexes = groups.get(key) ?? [];
    indexes.push(index);
    groups.set(key, indexes);
  });

  const duplicates = new Set<number>();
  for (const indexes of groups.values()) {
    if (indexes.length > 1) {
      indexes.forEach((index) => duplicates.add(index));
    }
  }

  return inputs.map((input, index) => {
    if (!duplicates.has(index)) return input;
    return {
      ...input,
      reading: {
        ...input.reading,
        source: "invalid",
        trust_level: "untrusted",
        normalized_value: null,
        validity: "invalid",
        confidence: 0,
        warnings: dedupeSorted([...input.reading.warnings, "duplicate_channel_assignment"]),
        ingest_boundary_status: "invalid",
      },
    };
  });
}

function deriveVpdReadings(inputs: readonly ReadingWithPairing[]): {
  readings: SensorAdapterReading[];
  warnings: SensorAdapterWarning[];
} {
  const groups = new Map<
    string,
    { temperatures: SensorAdapterReading[]; humidities: SensorAdapterReading[] }
  >();

  for (const input of inputs) {
    const reading = input.reading;
    if (
      reading.validity !== "valid" ||
      reading.tent_id === null ||
      reading.normalized_value === null ||
      (reading.metric !== "temperature_c" && reading.metric !== "humidity_pct") ||
      (reading.metric === "humidity_pct" && reading.warnings.includes("humidity_stuck_extreme"))
    ) {
      continue;
    }
    const key = [reading.tent_id, reading.plant_id ?? "", input.pairing_ref].join("|");
    const group = groups.get(key) ?? { temperatures: [], humidities: [] };
    if (reading.metric === "temperature_c") group.temperatures.push(reading);
    else group.humidities.push(reading);
    groups.set(key, group);
  }

  const derived: SensorAdapterReading[] = [];
  const warnings: SensorAdapterWarning[] = [];
  for (const [pairingKey, group] of [...groups.entries()].sort((a, b) =>
    lexicalCompare(a[0], b[0]),
  )) {
    if (group.temperatures.length !== 1 || group.humidities.length !== 1) {
      if (group.temperatures.length > 1 || group.humidities.length > 1) {
        warnings.push("vpd_pairing_ambiguous");
      }
      continue;
    }
    const temp = group.temperatures[0];
    const humidity = group.humidities[0];
    const vpd = calculateAirVpdKpa({
      tempC: temp.normalized_value,
      rhPercent: humidity.normalized_value,
    });
    if (vpd === null || !isVpdRealistic(vpd)) {
      warnings.push("vpd_inputs_invalid");
      continue;
    }

    const source: SensorAdapterSource =
      temp.source === "stale" || humidity.source === "stale" ? "stale" : "live";
    const [tentId, plantId, pairingRef] = pairingKey.split("|");
    const capturedAt =
      (temp.captured_at ?? "") >= (humidity.captured_at ?? "")
        ? temp.captured_at
        : humidity.captured_at;
    const channelRef = `vpd:${pairingRef}`;
    const rawField = `derived:${temp.raw_field}+${humidity.raw_field}`;
    const deviceRef =
      temp.device_ref && temp.device_ref === humidity.device_ref ? temp.device_ref : null;
    const combinedWarnings = dedupeSorted([...temp.warnings, ...humidity.warnings]);
    const trust = resolvedTrust({
      source,
      validity: "valid",
      warnings: combinedWarnings,
      value_origin: "derived",
    });
    const readingId = buildSensorAdapterReadingId({
      adapter_id: ECOWITT_MQTT_SENSOR_ADAPTER_ID,
      adapter_version: ECOWITT_MQTT_SENSOR_ADAPTER_VERSION,
      metric: "vpd_kpa",
      channel_ref: channelRef,
      device_ref: deviceRef,
      captured_at: capturedAt,
      tent_id: tentId,
      raw_field: rawField,
      value_origin: "derived",
    });

    derived.push({
      source,
      provider: ECOWITT_MQTT_SENSOR_PROVIDER,
      transport: ECOWITT_MQTT_SENSOR_TRANSPORT,
      adapter_id: ECOWITT_MQTT_SENSOR_ADAPTER_ID,
      adapter_version: ECOWITT_MQTT_SENSOR_ADAPTER_VERSION,
      origin_source: "verdant_derived",
      trust_level: trust,
      captured_at: capturedAt,
      received_at: temp.received_at,
      tent_id: tentId,
      plant_id: plantId || null,
      metric: "vpd_kpa",
      normalized_value: vpd,
      normalized_unit: "kPa",
      validity: "valid",
      confidence: Math.min(temp.confidence, humidity.confidence),
      warnings: combinedWarnings,
      raw_payload_ref: SENSOR_ADAPTER_REDACTED_PAYLOAD_REF,
      channel_ref: channelRef,
      device_ref: deviceRef,
      raw_field: rawField,
      value_origin: "derived",
      comparison_role: "primary",
      reading_id: readingId,
      ingest_boundary_status: source === "stale" ? "blocked_stale" : "ready",
    });
  }

  return { readings: derived, warnings: dedupeSorted(warnings) };
}

function markIngestBoundaryCollisions(readings: SensorAdapterReading[]): SensorAdapterReading[] {
  const groups = new Map<string, number[]>();
  readings.forEach((reading, index) => {
    if (
      reading.validity !== "valid" ||
      reading.ingest_boundary_status !== "ready" ||
      !reading.tent_id ||
      !reading.captured_at
    ) {
      return;
    }
    const key = [reading.tent_id, reading.metric, reading.captured_at, reading.source].join("|");
    const indexes = groups.get(key) ?? [];
    indexes.push(index);
    groups.set(key, indexes);
  });

  const collisionIndexes = new Set<number>();
  for (const indexes of groups.values()) {
    if (indexes.length > 1) indexes.forEach((index) => collisionIndexes.add(index));
  }

  return readings.map((reading, index) => {
    if (!collisionIndexes.has(index)) return reading;
    return {
      ...reading,
      warnings: dedupeSorted([...reading.warnings, "ingest_boundary_channel_collision"]),
      ingest_boundary_status: "blocked_channel_collision",
    };
  });
}

function isControlKey(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    CONTROL_KEYS.has(lower) ||
    CONTROL_KEY_TOKEN_RE.test(lower) ||
    CONTROL_KEY_PREFIX_RE.test(lower) ||
    /(?:_command|_cmd|_set|_setpoint|_control)$/.test(lower)
  );
}

function isSafeRedactedEvidenceKey(key: string): boolean {
  const lower = key.toLowerCase();
  return NON_METRIC_KEYS.has(lower) || describeField(lower) !== null;
}

function sanitizeRedactedPayload(value: unknown): {
  value: unknown;
  omitted_control_field_count: number;
} {
  if (!isPlainObject(value)) {
    return { value: null, omitted_control_field_count: 0 };
  }

  const out: Record<string, unknown> = {};
  let omitted = 0;

  // EcoWitt MQTT JSON is a flat key/value payload. Keeping this projection
  // top-level and primitive-only prevents cycles or attacker-controlled depth
  // from becoming a stack-exhaustion path at the untrusted adapter boundary.
  for (const key of Object.keys(value).sort(lexicalCompare)) {
    if (UNSAFE_OBJECT_KEYS.has(key.toLowerCase())) continue;
    if (isControlKey(key)) {
      omitted += 1;
      continue;
    }
    if (SENSITIVE_OUTPUT_KEY_RE.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    if (!isSafeRedactedEvidenceKey(key)) continue;

    const raw = value[key];
    if (raw === null || typeof raw === "boolean") {
      out[key] = raw;
      continue;
    }
    if (typeof raw === "number") {
      if (Number.isFinite(raw)) out[key] = raw;
      continue;
    }
    if (typeof raw === "string") {
      out[key] = containsSensitiveValue(raw) ? "[redacted]" : raw;
    }
  }

  return { value: out, omitted_control_field_count: omitted };
}

function aggregateWarnings(readings: readonly SensorAdapterReading[]): SensorAdapterWarning[] {
  return dedupeSorted(readings.flatMap((reading) => reading.warnings));
}

/**
 * Normalize one decoded EcoWitt MQTT payload. Unknown keys are ignored as
 * metrics and omitted from the allowlisted, redacted evidence projection.
 */
export function adaptEcowittMqttSensorPayload(
  input: EcowittMqttSensorAdapterInput,
): SensorAdapterResult {
  const sanitized = sanitizeRedactedPayload(input?.payload);
  if (!input || !isPlainObject(input.payload)) {
    return {
      ok: false,
      readings: [],
      warnings: ["malformed_payload"],
      redacted_payload: sanitized.value,
      ignored_field_count: 0,
      omitted_control_field_count: sanitized.omitted_control_field_count,
    };
  }

  const normalizedPayload = normalizedPayloadKeys(input.payload);
  const payload = normalizedPayload.payload;
  const duplicateRawFields = normalizedPayload.duplicate_keys;
  const mappings = assignmentIndex(
    Array.isArray(input.channel_assignments) ? input.channel_assignments : [],
  );
  const timestamp =
    duplicateRawFields.has("captured_at") || duplicateRawFields.has("dateutc")
      ? ({ captured_at: null, warning: "malformed_timestamp" } as const)
      : parseCapturedAt(payload);
  const receivedAt = normalizeReceivedAt({
    value: input.received_at,
    now_ms: input.now_ms,
    policy: input.freshness_policy,
  });
  const freshness = classifySensorAdapterFreshness({
    captured_at: timestamp.captured_at,
    now_ms: input.now_ms,
    policy: input.freshness_policy,
  });
  const freshnessWarnings = dedupeSorted([
    ...(timestamp.warning ? [timestamp.warning] : []),
    ...freshness.warnings.filter(
      (warning) =>
        !(timestamp.warning === "malformed_timestamp" && warning === "missing_timestamp"),
    ),
  ]);

  let withPairing: ReadingWithPairing[] = [];
  let ignoredFieldCount = 0;
  for (const rawField of Object.keys(payload).sort(lexicalCompare)) {
    const descriptor = describeField(rawField);
    if (!descriptor) {
      if (!NON_METRIC_KEYS.has(rawField)) ignoredFieldCount += 1;
      continue;
    }
    const target = resolveTarget(descriptor, mappings);
    const normalized = normalizeMetricValue({
      descriptor,
      assignment: target.assignment,
      raw_value: payload[rawField],
    });
    withPairing.push({
      reading: buildObservedReading({
        descriptor,
        target,
        normalized,
        freshness_source: freshness.source,
        freshness_warnings: freshnessWarnings,
        captured_at: timestamp.captured_at,
        received_at: receivedAt.received_at,
        received_at_warning: receivedAt.warning,
        duplicate_raw_field: duplicateRawFields.has(rawField),
      }),
      pairing_ref: target.pairing_ref,
    });
  }

  withPairing = markDuplicateChannelAssignments(withPairing);

  const derived = deriveVpdReadings(withPairing);
  let readings = [...withPairing.map(({ reading }) => reading), ...derived.readings];
  readings = markIngestBoundaryCollisions(readings);
  readings = sortSensorAdapterReadings(readings);

  const duplicateMappingWarning = [...mappings.values()].some(
    (assignments) => assignments.length > 1,
  )
    ? (["duplicate_channel_assignment"] as const)
    : [];
  const warnings = dedupeSorted([
    ...aggregateWarnings(readings),
    ...derived.warnings,
    ...freshnessWarnings,
    ...(duplicateRawFields.size > 0 ? (["duplicate_raw_field"] as const) : []),
    ...duplicateMappingWarning,
    ...(!isValidSensorAdapterFreshnessPolicy(input.freshness_policy)
      ? (["invalid_freshness_policy"] as const)
      : []),
    ...(receivedAt.warning ? [receivedAt.warning] : []),
    ...(readings.length === 0 ? (["no_supported_metrics"] as const) : []),
  ]);

  return {
    ok: readings.some(
      (reading) => reading.validity === "valid" && reading.ingest_boundary_status === "ready",
    ),
    readings,
    warnings,
    redacted_payload: sanitized.value,
    ignored_field_count: ignoredFieldCount,
    omitted_control_field_count: sanitized.omitted_control_field_count,
  };
}

export function isEcowittMqttSensorAdapterMetricField(field: string): boolean {
  return typeof field === "string" && describeField(field.trim().toLowerCase()) !== null;
}

export function normalizedUnitForEcowittMqttMetric(
  metric: SensorAdapterMetric,
): SensorAdapterNormalizedUnit {
  return canonicalUnitForSensorAdapterMetric(metric);
}

export type EcowittMqttSensorAdapterIngestStatus = SensorAdapterIngestBoundaryStatus;
