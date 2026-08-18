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

export interface SafeQuickLogAuditDiagnostic {
  keyedHttpStatus: number;
  followupHttpStatus: number | null;
  path: "manual_persist" | "dual_timestamp_persist" | "unknown";
  status: "save_failed" | null;
  sqlState: string | null;
  code: string | null;
}

const SAFE_POSTGREST_CODE = /^(?:PGRST\d{3}|[0-9A-Z]{5})$/;
const SAFE_SQLSTATE = /^[0-9A-Z]{5}$/;
const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,200}$/;
const SAFE_POSTGRES_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

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

function safePostgrestCode(value: unknown): string | null {
  return typeof value === "string" && SAFE_POSTGREST_CODE.test(value) ? value : null;
}

function quickLogAuditBaseUrl(rpcUrl: string): URL {
  const url = new URL(rpcUrl);
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    !/^\/rest\/v1\/rpc\/quicklog_save_manual\/?$/.test(url.pathname)
  ) {
    throw new Error("invalid_quicklog_rpc_url");
  }
  url.pathname = "/rest/v1/quicklog_audit_events";
  url.search = "";
  url.hash = "";
  return url;
}

function safeAuditTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !SAFE_POSTGRES_TIMESTAMP.test(value)) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

export function readSafeQuickLogIdempotencyKey(requestBody: unknown): string | null {
  const body = objectRecord(requestBody);
  const value = body?.p_idempotency_key;
  return typeof value === "string" && SAFE_IDEMPOTENCY_KEY.test(value) ? value : null;
}

export function shouldReadQuickLogAuditDiagnostic(diagnostic: SafeQuickLogRpcDiagnostic): boolean {
  return (
    diagnostic.httpStatus === 200 &&
    diagnostic.ok === false &&
    diagnostic.code === null &&
    diagnostic.reason === "save_failed"
  );
}

export function buildQuickLogKeyedAuditQueryUrl(rpcUrl: string, idempotencyKey: string): string {
  if (!SAFE_IDEMPOTENCY_KEY.test(idempotencyKey)) {
    throw new Error("invalid_quicklog_idempotency_key");
  }
  const url = quickLogAuditBaseUrl(rpcUrl);
  url.searchParams.set("select", "status,reason,created_at");
  url.searchParams.set("idempotency_key", `eq.${idempotencyKey}`);
  url.searchParams.set("order", "created_at.desc");
  url.searchParams.set("limit", "4");
  return url.toString();
}

export function buildQuickLogUnkeyedAuditQueryUrl(rpcUrl: string, createdAt: string): string {
  const safeCreatedAt = safeAuditTimestamp(createdAt);
  if (!safeCreatedAt) throw new Error("invalid_quicklog_audit_timestamp");
  const url = quickLogAuditBaseUrl(rpcUrl);
  url.searchParams.set("select", "status,reason");
  url.searchParams.set("idempotency_key", "is.null");
  url.searchParams.set("status", "eq.save_failed");
  url.searchParams.set("created_at", `eq.${safeCreatedAt}`);
  url.searchParams.set("limit", "4");
  return url.toString();
}

export function extractQuickLogAuditStartedAt(keyedResponseBody: unknown): string | null {
  if (!Array.isArray(keyedResponseBody) || keyedResponseBody.length !== 1) return null;
  const row = objectRecord(keyedResponseBody[0]);
  if (!row || row.status !== "save_started" || row.reason != null) return null;
  return safeAuditTimestamp(row.created_at);
}

export function buildSafeQuickLogAuditDiagnostic(
  keyedStatus: number,
  keyedResponseBody: unknown,
  followupStatus?: number,
  followupResponseBody?: unknown,
): SafeQuickLogAuditDiagnostic {
  const safeKeyedStatus = safeStatus(keyedStatus);
  const safeFollowupStatus = followupStatus === undefined ? null : safeStatus(followupStatus);
  const unknown = (code: string | null): SafeQuickLogAuditDiagnostic => ({
    keyedHttpStatus: safeKeyedStatus,
    followupHttpStatus: safeFollowupStatus,
    path: "unknown",
    status: null,
    sqlState: null,
    code,
  });

  if (safeKeyedStatus !== 200 || !Array.isArray(keyedResponseBody)) {
    return unknown(safePostgrestCode(objectRecord(keyedResponseBody)?.code));
  }

  if (keyedResponseBody.length === 1) {
    const keyedRow = objectRecord(keyedResponseBody[0]);
    if (keyedRow?.status === "save_failed" && keyedRow.reason === "dual_timestamp_persist_failed") {
      return {
        keyedHttpStatus: safeKeyedStatus,
        followupHttpStatus: null,
        path: "dual_timestamp_persist",
        status: "save_failed",
        sqlState: null,
        code: null,
      };
    }
  }

  if (!extractQuickLogAuditStartedAt(keyedResponseBody)) return unknown(null);
  if (safeFollowupStatus !== 200 || !Array.isArray(followupResponseBody)) {
    return unknown(safePostgrestCode(objectRecord(followupResponseBody)?.code));
  }
  if (followupResponseBody.length !== 1) return unknown(null);
  const failureRow = objectRecord(followupResponseBody[0]);
  const sqlState = failureRow?.status === "save_failed" ? failureRow.reason : null;
  if (typeof sqlState !== "string" || !SAFE_SQLSTATE.test(sqlState)) return unknown(null);

  return {
    keyedHttpStatus: safeKeyedStatus,
    followupHttpStatus: safeFollowupStatus,
    path: "manual_persist",
    status: "save_failed",
    sqlState,
    code: null,
  };
}

export function formatSafeQuickLogAuditDiagnostic(diagnostic: SafeQuickLogAuditDiagnostic): string {
  return [
    `keyed_http_status=${diagnostic.keyedHttpStatus}`,
    `followup_http_status=${diagnostic.followupHttpStatus ?? "none"}`,
    `path=${diagnostic.path}`,
    `status=${diagnostic.status ?? "none"}`,
    `sqlstate=${diagnostic.sqlState ?? "none"}`,
    `code=${diagnostic.code ?? "none"}`,
  ].join(", ");
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
    code: safePostgrestCode(rawCode),
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
