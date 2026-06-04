// Server-only helper: resolve a bearer token into an auth context.
// Pure (DB client + claims fn are injected) so it can be unit-tested without
// network calls. Used by sensor-ingest-webhook.

export const BRIDGE_PREFIX = "vbt_";

export type BridgeTokenRow = {
  id: string;
  user_id: string;
  tent_id: string;
  expires_at: string;
  revoked_at: string | null;
};

export type AuthResult =
  | { kind: "jwt"; userId: string }
  | { kind: "bridge"; userId: string; tentScope: string; tokenId: string };

export type AuthError =
  | "unauthorized"
  | "token_revoked"
  | "token_expired"
  | "server_misconfigured"
  | "auth_lookup_failed";

export interface BridgeTokenLookup {
  (hash: string): Promise<{ data: BridgeTokenRow | null; error: { message: string } | null }>;
}

export interface JwtClaimsLookup {
  (token: string): Promise<{ sub: string | null }>;
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function authenticateBearer(
  rawToken: string,
  deps: {
    lookupBridgeToken: BridgeTokenLookup;
    verifyJwtClaims: JwtClaimsLookup;
    serviceKeyAvailable: boolean;
    now?: () => number;
  },
): Promise<{ ok: true; auth: AuthResult } | { ok: false; error: AuthError }> {
  const now = deps.now ?? Date.now;
  if (rawToken.startsWith(BRIDGE_PREFIX)) {
    if (!deps.serviceKeyAvailable) return { ok: false, error: "server_misconfigured" };
    if (rawToken.length < BRIDGE_PREFIX.length + 16) return { ok: false, error: "unauthorized" };
    const hash = await sha256Hex(rawToken);
    const { data, error } = await deps.lookupBridgeToken(hash);
    if (error) return { ok: false, error: "auth_lookup_failed" };
    if (!data) return { ok: false, error: "unauthorized" };
    if (data.revoked_at) return { ok: false, error: "token_revoked" };
    if (new Date(data.expires_at).getTime() <= now()) {
      return { ok: false, error: "token_expired" };
    }
    return {
      ok: true,
      auth: { kind: "bridge", userId: data.user_id, tentScope: data.tent_id, tokenId: data.id },
    };
  }
  const { sub } = await deps.verifyJwtClaims(rawToken);
  if (!sub) return { ok: false, error: "unauthorized" };
  return { ok: true, auth: { kind: "jwt", userId: sub } };
}

export function tentScopeMatches(
  auth: AuthResult,
  payloadTentId: string,
): boolean {
  if (auth.kind === "jwt") return true;
  return auth.tentScope === payloadTentId;
}
