/**
 * Pure redaction + formatting helpers for the latest EcoWitt local
 * validation evidence. No I/O, no network, no JSX.
 *
 * Operator-safe surface: never reveal tokens, bearer/authorization,
 * service_role, JWTs, signatures, api keys, raw user_id, or internal IDs
 * outside masked form.
 */

export const ECOWITT_EVIDENCE_LABEL =
  "Local EcoWitt validation evidence — test/local validation data.";

const SECRETY_KEY_PATTERNS: RegExp[] = [
  /token/i,
  /bridge_token/i,
  /vbt/i,
  /authorization/i,
  /bearer/i,
  /jwt/i,
  /service_role/i,
  /signature/i,
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /^user_id$/i,
];

const INTERNAL_ID_KEYS = new Set(["id", "row_id", "internal_id"]);

function isSecretKey(key: string): boolean {
  if (SECRETY_KEY_PATTERNS.some((p) => p.test(key))) return true;
  return false;
}

function maskInternalId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "—";
  return `${value.slice(0, 4)}…(len=${value.length})`;
}

export function redactEvidenceValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => redactEvidenceValue(v));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSecretKey(k)) {
        out[k] = "[redacted]";
        continue;
      }
      if (INTERNAL_ID_KEYS.has(k.toLowerCase())) {
        out[k] = maskInternalId(v);
        continue;
      }
      out[k] = redactEvidenceValue(v);
    }
    return out;
  }
  return value;
}

export interface EcowittEvidenceMetricSummary {
  key: string;
  label: string;
  status: string;
  value: number | null;
  reason: string;
}

export interface EcowittEvidenceSnapshot {
  label: string;
  source: string;
  tent: string;
  captured_at: string | null;
  status: string;
  status_message: string;
  test_sender: boolean;
  invalid_test: boolean;
  stale: boolean;
  metrics: EcowittEvidenceMetricSummary[];
  redacted_raw_payload: unknown;
  derived_reading_warnings: string[];
}

export interface BuildLatestEvidenceInput {
  hasEvidence: boolean;
  status: string;
  statusMessage: string;
  sourceLabel: string;
  tentScopedLabel: string;
  capturedAtLabel: string;
  isTestSender: boolean;
  invalidTest: boolean;
  stale: boolean;
  metricRows: readonly EcowittEvidenceMetricSummary[];
  rawPayload: unknown;
  derivedReadingWarnings: readonly string[];
}

export function buildLatestEvidenceSnapshot(
  input: BuildLatestEvidenceInput,
): EcowittEvidenceSnapshot | null {
  if (!input.hasEvidence) return null;
  return {
    label: ECOWITT_EVIDENCE_LABEL,
    source: input.sourceLabel,
    tent: input.tentScopedLabel,
    captured_at: input.capturedAtLabel === "—" ? null : input.capturedAtLabel,
    status: input.status,
    status_message: input.statusMessage,
    test_sender: input.isTestSender,
    invalid_test: input.invalidTest,
    stale: input.stale,
    metrics: input.metricRows.map((m) => ({
      key: m.key,
      label: m.label,
      status: m.status,
      value: m.value,
      reason: m.reason,
    })),
    redacted_raw_payload: redactEvidenceValue(input.rawPayload),
    derived_reading_warnings: [...input.derivedReadingWarnings],
  };
}

export function serializeEvidenceForClipboard(
  snap: EcowittEvidenceSnapshot,
): string {
  return JSON.stringify(snap, null, 2);
}

export const COPY_EVIDENCE_REDACTION_NOTICE =
  "Tokens, bridge tokens, authorization/bearer/JWT, service_role, signatures, api keys, raw user_id, and internal IDs are redacted before clipboard. Test/local data only — never sent.";

export interface EcowittEvidencePreview {
  label: string;
  source: string;
  tent: string;
  captured_at: string | null;
  metric_summary: { key: string; label: string; status: string }[];
  redaction_notice: string;
}

export function buildEvidencePreview(
  snap: EcowittEvidenceSnapshot,
): EcowittEvidencePreview {
  return {
    label: snap.label,
    source: snap.source,
    tent: snap.tent,
    captured_at: snap.captured_at,
    metric_summary: snap.metrics.map((m) => ({
      key: m.key,
      label: m.label,
      status: m.status,
    })),
    redaction_notice: COPY_EVIDENCE_REDACTION_NOTICE,
  };
}
