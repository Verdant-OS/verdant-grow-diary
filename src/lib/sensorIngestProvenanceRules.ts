/**
 * sensorIngestProvenanceRules — pure helpers for constructing safe
 * provenance metadata for future sensor ingest adapters.
 *
 * This module does not write sensor rows, does not call Supabase, and does
 * not change schema. It only validates that the canonical source is one of
 * Verdant's allowed trust/state labels and keeps vendor/transport/bridge
 * details inside raw_payload provenance.
 */
import {
  CANONICAL_SENSOR_SOURCES,
  SENSOR_PROVENANCE_APPS,
  SENSOR_PROVENANCE_TRANSPORTS,
  isCanonicalSensorSource,
  isNonCanonicalSourceAlias,
  type CanonicalSensorSource,
  type SensorProvenanceApp,
  type SensorProvenanceTransport,
} from "@/constants/sensorIngestProvenance";

export type SensorIngestProvenanceReason =
  | "source_not_canonical"
  | "source_app_not_allowed"
  | "transport_not_allowed";

export interface SensorIngestProvenanceInput {
  source: unknown;
  sourceApp: unknown;
  transport: unknown;
  vendor?: unknown;
  bridge?: unknown;
  externalDeviceId?: unknown;
}

export interface SensorIngestProvenancePayload {
  source: CanonicalSensorSource;
  raw_payload: {
    source_app: SensorProvenanceApp;
    transport: SensorProvenanceTransport;
    vendor?: string;
    bridge?: string;
    external_device_id?: string;
  };
}

export type BuildSensorIngestProvenanceResult =
  | { ok: true; payload: SensorIngestProvenancePayload }
  | { ok: false; reason: SensorIngestProvenanceReason };

const SOURCE_APP_SET = new Set<string>(SENSOR_PROVENANCE_APPS);
const TRANSPORT_SET = new Set<string>(SENSOR_PROVENANCE_TRANSPORTS);

const SENSITIVE_TEXT_PATTERN =
  /service_role|authorization|bearer\s+|passkey|api[_-]?key|secret|token/i;

function asAllowedSourceApp(value: unknown): SensorProvenanceApp | null {
  return typeof value === "string" && SOURCE_APP_SET.has(value)
    ? (value as SensorProvenanceApp)
    : null;
}

function asAllowedTransport(value: unknown): SensorProvenanceTransport | null {
  return typeof value === "string" && TRANSPORT_SET.has(value)
    ? (value as SensorProvenanceTransport)
    : null;
}

function safeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (SENSITIVE_TEXT_PATTERN.test(trimmed)) return undefined;
  return trimmed.slice(0, 120);
}

export function buildSensorIngestProvenancePayload(
  input: SensorIngestProvenanceInput,
): BuildSensorIngestProvenanceResult {
  if (!isCanonicalSensorSource(input.source)) {
    return { ok: false, reason: "source_not_canonical" };
  }

  const sourceApp = asAllowedSourceApp(input.sourceApp);
  if (!sourceApp) return { ok: false, reason: "source_app_not_allowed" };

  const transport = asAllowedTransport(input.transport);
  if (!transport) return { ok: false, reason: "transport_not_allowed" };

  const raw_payload: SensorIngestProvenancePayload["raw_payload"] = {
    source_app: sourceApp,
    transport,
  };

  const vendor = safeOptionalString(input.vendor);
  if (vendor) raw_payload.vendor = vendor;

  const bridge = safeOptionalString(input.bridge);
  if (bridge) raw_payload.bridge = bridge;

  const externalDeviceId = safeOptionalString(input.externalDeviceId);
  if (externalDeviceId) raw_payload.external_device_id = externalDeviceId;

  return {
    ok: true,
    payload: {
      source: input.source,
      raw_payload,
    },
  };
}

export function isRejectedSourceAlias(value: unknown): boolean {
  return !isCanonicalSensorSource(value) && isNonCanonicalSourceAlias(value);
}

export { CANONICAL_SENSOR_SOURCES };
