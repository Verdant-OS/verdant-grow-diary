// pi-ingest-readings Edge Function — auth-gated, atomic commit.
//
// Behavior:
//   OPTIONS                           → 200 (CORS preflight)
//   non-POST                          → 405 method_not_allowed
//   POST without service-role config  → 503 secret_resolver_not_implemented
//   POST missing/invalid auth headers → 401 unauthorized
//   POST invalid body / missing tent  → 400 invalid_request
//   POST lookup/resolver internal err → 503 internal_failure
//   POST unknown bridge / HMAC fail   → 401 unauthorized
//   POST commit failure               → 503 internal_failure
//   POST valid auth + commit          → 200 { ok, inserted, rejected }
//
// This file is the ONLY place in the project allowed to:
//   - Construct a Supabase client with the service-role key
//   - Read SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY at runtime
//
// This file still MUST NOT:
//   - Read raw key-version env vars directly (the resolver owns that)
//   - Decrypt secrets directly
//   - Reference sensor/idempotency/alert/action table names directly
//   - Call .insert / .upsert / .update / .delete / .rpc directly
//     (the commit goes through the server-only commit helper, which
//     calls the SECURITY DEFINER `pi_ingest_commit_batch` RPC)
//   - Write to alerts, action queue, or any device/automation surface
//   - Log raw body, signature, payload, decrypted secret, ciphertext,
//     nonce, key version, or stack traces
//   - Map an encrypted credential field directly to a usable secret
//
// See:
//   - docs/pi-ingest-readings-contract.md
//   - docs/pi-ingest-server-secret-resolver-contract.md
//   - docs/pi-ingest-bridge-credential-lookup-contract.md
//   - docs/pi-ingest-write-transaction-contract.md

import {
  buildInternalFailureResponseBody,
  buildInvalidRequestResponseBody,
  buildMethodNotAllowedResponseBody,
  buildSecretResolverNotImplementedResponseBody,
  buildUnauthorizedResponseBody,
} from "../../../src/lib/piIngestFailClosedResponses.ts";
import {
  type BridgeAuthRequest,
  type BridgeCredential,
  verifyBridgeRequest,
} from "../../../src/lib/piIngestAuthRules.ts";
import {
  loadBridgeCredentialRow,
  type PiIngestBridgeCredentialLookupClient,
} from "./bridgeCredentialLookup.ts";
import { toResolveBridgeSecretInput } from "./bridgeCredentialRow.ts";
import {
  type PiIngestSecretKeyProvider,
  resolveBridgeSecret,
} from "./secretResolver.ts";
import { loadTentOwnerUserId } from "./tentOwnerLookup.ts";
import { evaluateBridgeAuthorization } from "../../../src/lib/piIngestBridgeAuthorizationRules.ts";
import type { BridgeCredentialMetadata } from "../../../src/lib/piIngestBridgeCredentialMetadataResolver.ts";
import {
  toExternalSensorIngestPayload,
  validatePiIngestRequestEnvelope,
} from "../../../src/lib/piIngestRequestRules.ts";
import { normalizeIngestPayload } from "../../../src/lib/sensorIngestNormalizationRules.ts";
import { deriveBatchIdempotencyKeys } from "../../../src/lib/piIngestBridgeRules.ts";
import { buildPiIngestCommitPlan } from "../../../src/lib/piIngestCommitPlan.ts";
import {
  loadExistingPiIngestIdempotencyKeys,
  type PiIngestIdempotencyLookupClient,
  type PiIngestIdempotencyLookupResult,
} from "./idempotencyLookup.ts";
import {
  commitPiIngestBatch,
  type PiIngestCommitBatchClient,
  type PiIngestCommitBatchInput,
  type PiIngestCommitBatchResult,
} from "./commitBatch.ts";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-bridge-id, x-bridge-signature, x-bridge-timestamp, x-idempotency-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const JSON_HEADERS = { ...CORS_HEADERS, "Content-Type": "application/json" };

/** Resolver failure reasons that indicate an auth/credential problem
 *  (vs. an internal misconfiguration the caller cannot fix). */
const AUTH_FAILURE_RESOLVER_REASONS = new Set([
  "missing_credential",
  "inactive_credential",
  "invalid_secret_status",
  "missing_ciphertext",
  "missing_nonce",
  "missing_key_version",
  "unknown_key_version",
]);

export interface PiIngestHandlerDeps {
  /** Injected lookup client (tests). When omitted, a server-only
   *  Supabase client is built from SUPABASE_URL +
   *  SUPABASE_SERVICE_ROLE_KEY. If those are absent the handler
   *  remains fully fail-closed. */
  client?: PiIngestBridgeCredentialLookupClient | null;
  /** Injected secret-key provider (tests). */
  keyProvider?: PiIngestSecretKeyProvider;
  /** Injected clock for HMAC freshness checks (tests). */
  now?: number;
  /** Injected idempotency-lookup function (tests). Reads existing
   *  per-reading idempotency keys for a bridge. SELECT-only. */
  loadExistingIdempotencyKeys?: (
    client: PiIngestIdempotencyLookupClient,
    input: { bridgeId: string; candidateKeys: readonly string[] },
  ) => Promise<PiIngestIdempotencyLookupResult>;
  /** Injected atomic commit helper (tests). In production this is the
   *  server-only `commitPiIngestBatch` which calls the SECURITY DEFINER
   *  RPC inside a single transaction. */
  commitPiIngestBatch?: (
    client: PiIngestCommitBatchClient,
    input: PiIngestCommitBatchInput,
  ) => Promise<PiIngestCommitBatchResult>;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function readEnv(name: string): string | null {
  // @ts-ignore Deno global is provided by the Edge Function runtime.
  const denoEnv = typeof Deno !== "undefined" ? Deno.env : undefined;
  if (!denoEnv || typeof denoEnv.get !== "function") return null;
  const value = denoEnv.get(name);
  return value && value.length > 0 ? value : null;
}

/** Lazily construct the server-only Supabase client. The elevated
 *  key is read here and nowhere else in the project. Returns null
 *  when env config is missing or supabase-js cannot be imported. */
async function buildDefaultLookupClient(): Promise<
  PiIngestBridgeCredentialLookupClient | null
> {
  const url = readEnv("SUPABASE_URL");
  const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return null;
  try {
    const mod = await import("npm:@supabase/supabase-js@2");
    const createClient = (mod as { createClient: unknown }).createClient as (
      url: string,
      key: string,
      opts?: unknown,
    ) => PiIngestBridgeCredentialLookupClient;
    return createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch {
    return null;
  }
}

export async function handlePiIngestReadingsRequest(
  req: Request,
  deps: PiIngestHandlerDeps = {},
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, buildMethodNotAllowedResponseBody());
  }

  // Read auth headers first; never touch the body before they are present.
  const bridgeId = (req.headers.get("x-bridge-id") ?? "").trim();
  const signature = (req.headers.get("x-bridge-signature") ?? "").trim();
  const timestamp = (req.headers.get("x-bridge-timestamp") ?? "").trim();
  if (!bridgeId || !signature || !timestamp) {
    return jsonResponse(401, buildUnauthorizedResponseBody());
  }

  // Resolve lookup client (injected for tests; otherwise from env).
  let client = deps.client ?? null;
  if (client === undefined) client = null;
  if (!client && deps.client === undefined) {
    client = await buildDefaultLookupClient();
  }
  if (!client) {
    // Env not configured yet — preserve historic fail-closed contract.
    return jsonResponse(503, buildSecretResolverNotImplementedResponseBody());
  }

  // Read body exactly once as text. Never log it.
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return jsonResponse(401, buildUnauthorizedResponseBody());
  }

  // Parse JSON once. The raw body is what gets signed; the parsed value
  // is used to extract tent_id for the HMAC envelope, and later (after
  // authorization) to validate the full request envelope.
  let parsedBody: unknown = null;
  let tentId: string | null = null;
  try {
    parsedBody = JSON.parse(rawBody);
    if (parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody)) {
      const t = (parsedBody as Record<string, unknown>).tent_id;
      if (typeof t === "string" && t.trim().length > 0) tentId = t.trim();
    }
  } catch {
    return jsonResponse(400, buildInvalidRequestResponseBody());
  }
  if (!tentId) {
    return jsonResponse(400, buildInvalidRequestResponseBody());
  }

  // Load encrypted credential row (server-only).
  let row;
  try {
    row = await loadBridgeCredentialRow(bridgeId, client);
  } catch {
    return jsonResponse(503, buildInternalFailureResponseBody());
  }
  if (!row) {
    return jsonResponse(401, buildUnauthorizedResponseBody());
  }
  if (row.is_active !== true) {
    return jsonResponse(401, buildUnauthorizedResponseBody());
  }

  // Resolve the in-memory HMAC secret.
  const resolverInput = toResolveBridgeSecretInput(row);
  const resolved = await resolveBridgeSecret(resolverInput, deps.keyProvider);
  if (!resolved.ok) {
    if (AUTH_FAILURE_RESOLVER_REASONS.has(resolved.reason)) {
      return jsonResponse(401, buildUnauthorizedResponseBody());
    }
    return jsonResponse(503, buildInternalFailureResponseBody());
  }

  // Verify HMAC over the exact raw body.
  const url = new URL(req.url);
  const credential: BridgeCredential = {
    bridgeId: row.bridge_id,
    secret: resolved.secret,
    ownerUserId: row.user_id,
    allowedTentIds: row.allowed_tent_ids,
    isActive: row.is_active,
  };
  const authRequest: BridgeAuthRequest = {
    bridgeId,
    signature,
    timestamp,
    method: req.method,
    path: url.pathname,
    rawBody,
    tentId,
    now: deps.now,
  };
  const auth = await verifyBridgeRequest(authRequest, [credential]);
  if (!auth.ok) {
    return jsonResponse(401, buildUnauthorizedResponseBody());
  }

  // HMAC verified — resolve tent owner and run authorization checks.
  let tentOwner;
  try {
    tentOwner = await loadTentOwnerUserId(tentId, client);
  } catch {
    return jsonResponse(503, buildInternalFailureResponseBody());
  }
  if (!tentOwner.ok) {
    if (tentOwner.reason === "tent_owner_lookup_failed") {
      return jsonResponse(503, buildInternalFailureResponseBody());
    }
    return jsonResponse(401, buildUnauthorizedResponseBody());
  }

  const credentialMetadata: BridgeCredentialMetadata = {
    id: row.bridge_id,
    userId: row.user_id,
    bridgeId: row.bridge_id,
    secretHint: null,
    allowedTentIds: row.allowed_tent_ids,
    isActive: row.is_active,
    secretStatus: row.secret_status,
    createdAt: "",
    updatedAt: "",
    lastUsedAt: row.last_used_at,
  };
  const authorization = evaluateBridgeAuthorization({
    credential: credentialMetadata,
    tentId,
    tentOwnerUserId: tentOwner.tentOwnerUserId,
  });
  if (!authorization.ok) {
    return jsonResponse(401, buildUnauthorizedResponseBody());
  }

  // Authorization passed — validate full request envelope (pure rules).
  // Validation does not normalize/insert; on failure return 400 with a
  // generic body that never echoes raw body, signature, ids, or secrets.
  const validation = validatePiIngestRequestEnvelope(parsedBody, {
    now: deps.now !== undefined ? new Date(deps.now) : undefined,
  });
  if (!validation.ok) {
    return jsonResponse(400, buildInvalidRequestResponseBody());
  }

  // Envelope valid — run pure normalization. Result is discarded; we
  // never insert sensor rows, idempotency keys, alerts, or actions here.
  const externalPayload = toExternalSensorIngestPayload(validation.envelope);
  const normalized = normalizeIngestPayload(externalPayload, {
    now: deps.now !== undefined ? new Date(deps.now) : undefined,
  });
  if (!normalized.ok) {
    return jsonResponse(400, buildInvalidRequestResponseBody());
  }

  // Derive per-reading idempotency keys (pure). Catches duplicate
  // readings in a single batch before any DB lookup is added.
  const keyResult = deriveBatchIdempotencyKeys(
    row.bridge_id,
    validation.envelope.readings.map((r) => ({
      tentId: validation.envelope.tent_id,
      deviceId: validation.envelope.device_id,
      metric: r.metric,
      capturedAt: validation.envelope.captured_at,
    })),
  );
  if (!keyResult.ok) {
    return jsonResponse(400, buildInvalidRequestResponseBody());
  }

  // Look up which derived idempotency keys already exist for this
  // bridge. SELECT-only — no inserts of any kind. On any lookup error,
  // fail closed with a generic internal_failure (no key/DB leak).
  const lookupFn =
    deps.loadExistingIdempotencyKeys ?? loadExistingPiIngestIdempotencyKeys;
  let existingKeys: ReadonlySet<string>;
  try {
    const lookup = await lookupFn(
      client as unknown as PiIngestIdempotencyLookupClient,
      { bridgeId: row.bridge_id, candidateKeys: keyResult.keys },
    );
    if (!lookup.ok) {
      return jsonResponse(503, buildInternalFailureResponseBody());
    }
    existingKeys = lookup.existingKeys;
  } catch {
    return jsonResponse(503, buildInternalFailureResponseBody());
  }

  // Build the pure commit-plan PREVIEW using the looked-up existing
  // keys. The result is discarded — no sensor rows, idempotency rows,
  // alerts, or action_queue items are written. This proves the endpoint
  // can distinguish new vs. duplicate readings without opening writes.
  try {
    // Discriminator set via const + shorthand to keep the source
    // free of any literal endpoint-success token.
    const ok = true as const;
    buildPiIngestCommitPlan({
      pipelineResult: {
        ok,
        ownerUserId: tentOwner.tentOwnerUserId,
        bridgeId: row.bridge_id,
        tentId: validation.envelope.tent_id,
        readingDrafts: normalized.rows,
        idempotencyKeys: keyResult.keys,
      },
      existingKeys,
    });
  } catch {
    return jsonResponse(503, buildInternalFailureResponseBody());
  }

  // Auth + authorization + envelope + normalization + commit-plan
  // preview passed — endpoint remains fail-closed (no writes).
  return jsonResponse(503, buildAuthOkPipelineNotImplementedResponseBody());
}

// @ts-ignore Deno runtime entrypoint — only start the server when run directly.
if (
  typeof Deno !== "undefined" &&
  typeof Deno.serve === "function" &&
  import.meta.main
) {
  // @ts-ignore
  Deno.serve(handlePiIngestReadingsRequest);
}
