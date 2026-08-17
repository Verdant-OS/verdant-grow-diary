/**
 * Fixed-shape, secret-safe receipt for the authenticated Quick Log smoke.
 *
 * Never retain raw response text, PostgREST messages/details/hints, row IDs,
 * request payloads, headers, or URLs. The receipt exists only to distinguish a
 * transport/schema failure from a calm RPC business response in CI artifacts.
 */
export interface SafeQuickLogRpcDiagnostic {
  httpStatus: number;
  ok: boolean | null;
  code: string | null;
  reason: string | null;
}

const SAFE_POSTGREST_CODE = /^(?:PGRST\d{3}|[0-9A-Z]{5})$/;

const SAFE_QUICKLOG_REASONS = new Set([
  "not_authenticated",
  "invalid_target_type",
  "missing_target_id",
  "target_not_owned",
  "grow_not_owned",
  "invalid_action",
  "invalid_volume",
  "invalid_sensor_value",
  "temperature_out_of_range",
  "humidity_out_of_range",
  "vpd_out_of_range",
  "invalid_details",
  "invalid_idempotency_key",
  "invalid_stage",
  "invalid_occurred_at",
  "invalid_logged_at",
  "save_failed",
]);

function safeStatus(value: number): number {
  return Number.isInteger(value) && value >= 100 && value <= 599 ? value : 0;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function buildSafeQuickLogRpcDiagnostic(
  status: number,
  responseBody: unknown,
): SafeQuickLogRpcDiagnostic {
  const body = objectRecord(responseBody);
  const rawCode = body?.code;
  const rawReason = body?.reason;

  return {
    httpStatus: safeStatus(status),
    ok: typeof body?.ok === "boolean" ? body.ok : null,
    code: typeof rawCode === "string" && SAFE_POSTGREST_CODE.test(rawCode) ? rawCode : null,
    reason:
      typeof rawReason === "string" && SAFE_QUICKLOG_REASONS.has(rawReason) ? rawReason : null,
  };
}

export function formatSafeQuickLogRpcDiagnostic(diagnostic: SafeQuickLogRpcDiagnostic): string {
  return [
    `http_status=${diagnostic.httpStatus}`,
    `rpc_ok=${diagnostic.ok === null ? "unknown" : String(diagnostic.ok)}`,
    `code=${diagnostic.code ?? "none"}`,
    `reason=${diagnostic.reason ?? "none"}`,
  ].join(", ");
}
