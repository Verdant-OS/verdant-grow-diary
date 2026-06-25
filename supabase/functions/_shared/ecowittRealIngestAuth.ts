// Edge mirror of src/lib EcoWitt real-ingest logic.
// Keep behavior in parity with src/lib via ecowitt-real-ingest-edge-parity tests.
// Do not add persistence, Supabase writes, network calls, alerts, Action Queue writes, AI calls, automation, or device control here.

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
  const hasExpected =
    typeof expectedToken === "string" && expectedToken.length > 0;

  if (headerValue == null || typeof headerValue !== "string") {
    return result("unauthorized", "missing_authorization_header");
  }

  const trimmed = headerValue.trim();
  if (trimmed.length === 0) {
    return result("unauthorized", "missing_authorization_header");
  }

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

  if (!hasExpected) {
    return result("not_configured", "server_token_not_configured");
  }

  if (!safeEqual(token, expectedToken as string)) {
    return result("forbidden", "token_mismatch");
  }

  return result("authorized", "ok");
}
