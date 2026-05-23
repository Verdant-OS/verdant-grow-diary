/**
 * piIngestAuthRules — pure HMAC bridge authentication rules for the future
 * `pi-ingest-readings` Edge Function.
 *
 * STRICT SCOPE:
 *  - Pure TypeScript. No Supabase. No React. No I/O. No network.
 *  - No writes. No elevated keys. No schema knowledge.
 *  - Verification only. Caller is responsible for fetching credentials and
 *    persisting the validated readings later, behind its own gates.
 *
 * The module verifies a bridge request using only the inputs provided.
 * It never reads secrets, never derives ownership from the request body,
 * and never returns the credential secret.
 */

// ----------------------------- Types -----------------------------

export interface BridgeCredential {
  readonly bridgeId: string;
  readonly secret: string;
  readonly ownerUserId: string;
  readonly allowedTentIds: readonly string[];
  readonly isActive: boolean;
}

export interface BridgeAuthRequest {
  readonly bridgeId: string | null | undefined;
  readonly signature: string | null | undefined;
  readonly timestamp: string | null | undefined; // ISO 8601
  readonly method: string;
  readonly path: string;
  readonly rawBody: string;
  readonly tentId: string | null | undefined;
  /** Injectable current time in ms since epoch. */
  readonly now?: number;
}

export type BridgeAuthFailureCode =
  | "missing_bridge_id"
  | "unknown_bridge_id"
  | "inactive_credential"
  | "missing_signature"
  | "missing_timestamp"
  | "invalid_timestamp"
  | "timestamp_too_old"
  | "timestamp_too_far_future"
  | "missing_tent_id"
  | "tent_not_allowed"
  | "invalid_signature";

export type BridgeAuthResult =
  | {
      readonly ok: true;
      readonly ownerUserId: string;
      readonly bridgeId: string;
      readonly tentId: string;
    }
  | {
      readonly ok: false;
      readonly code: BridgeAuthFailureCode;
      readonly message: string;
    };

/** Accepted clock skew window in milliseconds (±5 minutes). */
export const SIGNING_WINDOW_MS = 5 * 60 * 1000;

// ----------------------------- Helpers -----------------------------

/**
 * Build the deterministic signing string. Signs the EXACT rawBody string,
 * never a re-serialized or normalized version of it.
 */
export function buildSigningString(
  method: string,
  path: string,
  timestamp: string,
  rawBody: string,
): string {
  return `${method.toUpperCase()}\n${path}\n${timestamp}\n${rawBody}`;
}

/** Constant-time hex string equality. */
export function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Compute HMAC SHA-256 of `message` with `secret`, returned as lowercase hex. */
export async function computeHmacSha256Hex(
  secret: string,
  message: string,
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const bytes = new Uint8Array(sig);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

function resolveCredential(
  bridgeId: string,
  credentials:
    | readonly BridgeCredential[]
    | ReadonlyMap<string, BridgeCredential>,
): BridgeCredential | undefined {
  if (Array.isArray(credentials)) {
    return (credentials as readonly BridgeCredential[]).find(
      (c) => c.bridgeId === bridgeId,
    );
  }
  return (credentials as ReadonlyMap<string, BridgeCredential>).get(bridgeId);
}

function fail(
  code: BridgeAuthFailureCode,
  message: string,
): BridgeAuthResult {
  return { ok: false, code, message };
}

// ----------------------------- Verify -----------------------------

/**
 * Verify a bridge request. Returns a discriminated result. The success
 * branch reports the verified ownerUserId from the credential — never
 * from the request body — and the verified tentId.
 */
export async function verifyBridgeRequest(
  req: BridgeAuthRequest,
  credentials:
    | readonly BridgeCredential[]
    | ReadonlyMap<string, BridgeCredential>,
): Promise<BridgeAuthResult> {
  const bridgeId = (req.bridgeId ?? "").trim();
  if (!bridgeId) return fail("missing_bridge_id", "bridgeId is required");

  const cred = resolveCredential(bridgeId, credentials);
  if (!cred) return fail("unknown_bridge_id", "Unknown bridge id");
  if (!cred.isActive)
    return fail("inactive_credential", "Bridge credential is inactive");

  const signature = (req.signature ?? "").trim();
  if (!signature) return fail("missing_signature", "signature is required");

  const timestamp = (req.timestamp ?? "").trim();
  if (!timestamp) return fail("missing_timestamp", "timestamp is required");

  const tsMs = Date.parse(timestamp);
  if (!Number.isFinite(tsMs))
    return fail("invalid_timestamp", "timestamp must be a valid ISO 8601 string");

  const now = typeof req.now === "number" ? req.now : Date.now();
  const skew = tsMs - now;
  if (-skew > SIGNING_WINDOW_MS)
    return fail("timestamp_too_old", "timestamp is older than 5 minutes");
  if (skew > SIGNING_WINDOW_MS)
    return fail(
      "timestamp_too_far_future",
      "timestamp is more than 5 minutes in the future",
    );

  const tentId = (req.tentId ?? "").trim();
  if (!tentId) return fail("missing_tent_id", "tentId is required");
  if (!cred.allowedTentIds.includes(tentId))
    return fail("tent_not_allowed", "tentId is not allowed for this bridge");

  const signingString = buildSigningString(
    req.method,
    req.path,
    timestamp,
    req.rawBody,
  );
  const expected = await computeHmacSha256Hex(cred.secret, signingString);
  // Normalize incoming signature to lowercase hex for comparison only.
  if (!constantTimeEqualHex(expected, signature.toLowerCase()))
    return fail("invalid_signature", "Signature did not match");

  return {
    ok: true,
    ownerUserId: cred.ownerUserId,
    bridgeId: cred.bridgeId,
    tentId,
  };
}
