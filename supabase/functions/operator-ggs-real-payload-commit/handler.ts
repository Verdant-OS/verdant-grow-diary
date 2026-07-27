/**
 * JWT-authenticated operator boundary for committing one real Spider Farmer
 * GGS payload through the existing private pi_ingest_commit_batch RPC.
 *
 * The browser supplies only tent/bridge/device context plus the raw payload.
 * The verified JWT, operator role, and tent ownership authorize the write.
 * Active same-owner/tent bridge-token context, payload normalization, and the
 * final write are all re-established server-side.
 */
import {
  buildGgsRealPayloadCommitInput,
  buildGgsRealPayloadCohortId,
  GGS_OPERATOR_ATTESTATION_BOUNDARY,
  GGS_OPERATOR_ATTESTED_PROVENANCE,
  GGS_REAL_PAYLOAD_SOURCE,
  GGS_REAL_PAYLOAD_SOURCE_APP,
  type GgsRealPayloadCommitRow,
} from "../_shared/lib/lib/ggsRealPayloadIngestRules.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_DEVICE_ID_LENGTH = 128;
export const MAX_OPERATOR_GGS_REQUEST_BODY_BYTES = 64 * 1024;

const ALLOWED_ORIGINS = new Set([
  "https://verdantgrowdiary.com",
  "https://www.verdantgrowdiary.com",
  "https://verdantgrowdiary-com.lovable.app",
  "https://id-preview--66255e7b-892c-4be5-8686-ab1cfc3666db.lovable.app",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:8080",
]);

export type OperatorGgsLookupResult<T> =
  | { ok: true; value: T | null }
  | {
      ok: false;
    };

export interface OperatorGgsTentAuthority {
  userId: string;
}

/**
 * Non-secret bridge-token row used only as active, same-owner/tent audit and
 * idempotency context. It does not authorize the caller or prove possession
 * of the bridge bearer secret.
 */
export interface OperatorGgsBridgeTokenContext {
  id: string;
  userId: string;
  tentId: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface OperatorGgsCommitBatchInput {
  userId: string;
  bridgeId: string;
  tentId: string;
  rows: GgsRealPayloadCommitRow[];
}

export type OperatorGgsCommitBatchResult =
  | { ok: true; inserted: number; rejected: number }
  | { ok: false };

export interface OperatorGgsRealPayloadCommitDeps {
  getVerifiedUserId: (authorizationHeader: string) => Promise<OperatorGgsLookupResult<string>>;
  hasOperatorRole: (userId: string) => Promise<OperatorGgsLookupResult<boolean>>;
  loadTentAuthority: (tentId: string) => Promise<OperatorGgsLookupResult<OperatorGgsTentAuthority>>;
  loadBridgeTokenContext: (
    bridgeId: string,
  ) => Promise<OperatorGgsLookupResult<OperatorGgsBridgeTokenContext>>;
  commitBatch: (input: OperatorGgsCommitBatchInput) => Promise<OperatorGgsCommitBatchResult>;
  now?: () => Date;
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://verdantgrowdiary.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(req: Request, status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type RequestBodyReadResult =
  | { ok: true; value: Record<string, unknown> }
  | {
      ok: false;
      status: 400 | 413;
      error: "invalid_json" | "invalid_request" | "payload_too_large";
    };

async function readRequestBody(req: Request): Promise<RequestBodyReadResult> {
  const declaredLength = req.headers.get("content-length");
  if (declaredLength !== null) {
    const trimmed = declaredLength.trim();
    if (!/^\d+$/.test(trimmed)) {
      return { ok: false, status: 400, error: "invalid_request" };
    }
    const parsed = Number(trimmed);
    if (!Number.isSafeInteger(parsed)) {
      return { ok: false, status: 400, error: "invalid_request" };
    }
    if (parsed > MAX_OPERATOR_GGS_REQUEST_BODY_BYTES) {
      return { ok: false, status: 413, error: "payload_too_large" };
    }
  }

  const reader = req.body?.getReader();
  if (!reader) {
    return { ok: false, status: 400, error: "invalid_json" };
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_OPERATOR_GGS_REQUEST_BODY_BYTES) {
      try {
        await reader.cancel();
      } catch {
        // The request is already rejected; cancellation is best effort.
      }
      return { ok: false, status: 413, error: "payload_too_large" };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const parsed = JSON.parse(text);
    if (!isPlainObject(parsed)) {
      return { ok: false, status: 400, error: "invalid_request" };
    }
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, status: 400, error: "invalid_json" };
  }
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function readDeviceId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_DEVICE_ID_LENGTH) return null;
  return trimmed;
}

function isActiveSameOwnerTentBridgeTokenContext(
  bridge: OperatorGgsBridgeTokenContext,
  userId: string,
  tentId: string,
  now: Date,
): boolean {
  if (bridge.id === "" || bridge.id !== bridge.id.trim()) return false;
  if (bridge.userId !== userId || bridge.tentId !== tentId) return false;
  if (bridge.revokedAt !== null) return false;
  const expiresAt = Date.parse(bridge.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > now.getTime();
}

function rowsAreTrusted(
  rows: readonly GgsRealPayloadCommitRow[],
  deviceId: string,
  attestedAt: Date,
): boolean {
  return rows.every(
    (row) =>
      row.source === GGS_REAL_PAYLOAD_SOURCE &&
      row.quality === "ok" &&
      row.device_id === deviceId &&
      row.raw_payload?.source_app === GGS_REAL_PAYLOAD_SOURCE_APP &&
      row.raw_payload?.sensor_id === deviceId &&
      row.raw_payload?.device_id === deviceId &&
      row.raw_payload?.captured_at === row.captured_at &&
      row.raw_payload?.cohort_id === buildGgsRealPayloadCohortId(deviceId, row.captured_at) &&
      row.raw_payload?.provenance === GGS_OPERATOR_ATTESTED_PROVENANCE &&
      row.raw_payload?.operator_attestation?.attested === true &&
      row.raw_payload?.operator_attestation?.attested_at === attestedAt.toISOString() &&
      row.raw_payload?.operator_attestation?.boundary === GGS_OPERATOR_ATTESTATION_BOUNDARY &&
      Number.isFinite(row.value),
  );
}

/**
 * Testable request handler. Production dependencies are built in index.ts.
 * No response contains raw payloads, database errors, bridge metadata, or
 * service credentials.
 */
export async function handleOperatorGgsRealPayloadCommit(
  req: Request,
  deps: OperatorGgsRealPayloadCommitDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json(req, 405, { error: "method_not_allowed" });
  }

  try {
    const authorization = req.headers.get("Authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) {
      return json(req, 401, { error: "auth_required" });
    }

    const verifiedUser = await deps.getVerifiedUserId(authorization);
    if (!verifiedUser.ok) {
      return json(req, 503, { error: "authorization_unavailable" });
    }
    if (!verifiedUser.value) {
      return json(req, 401, { error: "auth_required" });
    }
    const userId = verifiedUser.value;

    const role = await deps.hasOperatorRole(userId);
    if (!role.ok) {
      return json(req, 503, { error: "authorization_unavailable" });
    }
    if (role.value !== true) {
      return json(req, 403, { error: "operator_required" });
    }

    const parsedBody = await readRequestBody(req);
    if (!parsedBody.ok) {
      return json(req, parsedBody.status, { error: parsedBody.error });
    }
    const body = parsedBody.value;

    const tentId = body.tentId;
    const bridgeId = body.bridgeId;
    const deviceId = readDeviceId(body.deviceId);
    if (!isUuid(tentId) || !isUuid(bridgeId) || !deviceId) {
      return json(req, 400, { error: "invalid_request" });
    }
    if (body.attested !== true) {
      return json(req, 400, { error: "attestation_required" });
    }

    const tent = await deps.loadTentAuthority(tentId);
    if (!tent.ok) {
      return json(req, 503, { error: "authorization_unavailable" });
    }
    if (!tent.value || tent.value.userId !== userId) {
      return json(req, 403, { error: "tent_forbidden" });
    }

    const bridge = await deps.loadBridgeTokenContext(bridgeId);
    if (!bridge.ok) {
      return json(req, 503, { error: "authorization_unavailable" });
    }
    const requestNow = deps.now?.() ?? new Date();
    if (
      !bridge.value ||
      bridge.value.id !== bridgeId ||
      !isActiveSameOwnerTentBridgeTokenContext(bridge.value, userId, tentId, requestNow)
    ) {
      return json(req, 403, { error: "bridge_forbidden" });
    }

    const plan = buildGgsRealPayloadCommitInput(body.payload, {
      userId,
      bridgeId,
      tentId,
      deviceId,
      operatorAttested: true,
      now: requestNow,
    });
    if (!plan.ok || !rowsAreTrusted(plan.rows, deviceId, requestNow)) {
      return json(req, 400, { error: "payload_rejected" });
    }

    const committed = await deps.commitBatch({
      userId,
      bridgeId,
      tentId,
      rows: plan.rows,
    });
    if (!committed.ok) {
      return json(req, 500, { error: "commit_failed" });
    }

    return json(req, 200, {
      ok: true,
      inserted: committed.inserted,
      rejected: committed.rejected,
    });
  } catch {
    return json(req, 500, { error: "internal_error" });
  }
}
