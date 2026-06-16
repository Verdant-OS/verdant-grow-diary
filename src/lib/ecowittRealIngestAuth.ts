/**
 * EcoWitt Real Ingest — Phase 1 authorization helper.
 *
 * Pure, deterministic, side-effect-free. Validates a single
 * `Authorization` header against an expected bridge token. Never reads
 * the environment, never logs, never returns the token value, and never
 * performs I/O. Designed to be called by the endpoint handler with both
 * the header and the expected token injected.
 *
 * Phase 1 contract:
 *   - Missing header                          -> "unauthorized"
 *   - Malformed header / non-Bearer scheme    -> "unauthorized"
 *   - Expected token missing (server not yet
 *     configured for real ingest)             -> "not_configured"
 *   - Wrong token                             -> "forbidden"
 *   - Correct Bearer token                    -> "authorized"
 *
 * The function MUST NOT include the token value in its result.
 */

export type EcoWittRealIngestAuthStatus =
  | "authorized"
  | "unauthorized"
  | "forbidden"
  | "not_configured";

export interface EcoWittRealIngestAuthResult {
  status: EcoWittRealIngestAuthStatus;
  ok: boolean;
  reason:
    | "ok"
    | "missing_authorization_header"
    | "malformed_authorization_header"
    | "unsupported_auth_scheme"
    | "empty_bearer_token"
    | "server_token_not_configured"
    | "token_mismatch";
}

function result(
  status: EcoWittRealIngestAuthStatus,
  reason: EcoWittRealIngestAuthResult["reason"],
): EcoWittRealIngestAuthResult {
  return { status, ok: status === "authorized", reason };
}

/**
 * Constant-time-ish string compare. We avoid early-return on the first
 * mismatched byte. This is not a cryptographic guarantee in JS, but it
 * removes the most obvious timing oracle. Both strings must already be
 * non-empty.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function validateEcoWittBridgeAuthorization(
  headerValue: string | null | undefined,
  expectedToken: string | null | undefined,
): EcoWittRealIngestAuthResult {
  // Server-side configuration check first: if the server has no token,
  // we must fail closed BEFORE comparing anything, but only when the
  // caller actually presented credentials. A missing header without a
  // configured token is still unauthorized (no credentials offered).
  const hasExpected =
    typeof expectedToken === "string" && expectedToken.length > 0;

  if (headerValue == null || typeof headerValue !== "string") {
    return result("unauthorized", "missing_authorization_header");
  }

  const trimmed = headerValue.trim();
  if (trimmed.length === 0) {
    return result("unauthorized", "missing_authorization_header");
  }

  // Must be exactly "<scheme> <token>"; reject anything else as malformed.
  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx <= 0 || spaceIdx === trimmed.length - 1) {
    return result("unauthorized", "malformed_authorization_header");
  }

  const scheme = trimmed.slice(0, spaceIdx);
  const token = trimmed.slice(spaceIdx + 1).trim();

  if (scheme.toLowerCase() !== "bearer") {
    return result("unauthorized", "unsupported_auth_scheme");
  }
  if (token.length === 0) {
    return result("unauthorized", "empty_bearer_token");
  }

  // Caller presented credentials. If the server has no expected token,
  // fail closed with not_configured (do NOT echo the presented token).
  if (!hasExpected) {
    return result("not_configured", "server_token_not_configured");
  }

  if (!safeEqual(token, expectedToken as string)) {
    return result("forbidden", "token_mismatch");
  }

  return result("authorized", "ok");
}
