/**
 * Pure helpers for the Tent Bridge Tokens presenter. No DB or React imports.
 *
 * Bridge tokens are tent-scoped, expiring API tokens issued server-side. The
 * plaintext is shown ONCE at mint time and never persisted on the client.
 */

export const BRIDGE_TOKEN_PREFIX = "vbt_";
export const BRIDGE_TOKEN_MIN_TTL_DAYS = 1;
export const BRIDGE_TOKEN_MAX_TTL_DAYS = 365;
export const BRIDGE_TOKEN_DEFAULT_TTL_DAYS = 30;

export type BridgeTokenRow = {
  id: string;
  name: string;
  token_prefix: string;
  expires_at: string;
  last_used_at: string | null;
  first_used_at: string | null;
  ingest_count: number;
  revoked_at: string | null;
  created_at: string;
};

/** Compact, grower-friendly count label (e.g. 0, 42, 1.2k, 3.4M). */
export function formatIngestCount(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v) || v <= 0) return "0";
  if (v < 1000) return String(Math.floor(v));
  if (v < 1_000_000) return `${(v / 1000).toFixed(v < 10_000 ? 1 : 0)}k`;
  return `${(v / 1_000_000).toFixed(v < 10_000_000 ? 1 : 0)}M`;
}

export type BridgeTokenStatus = "active" | "revoked" | "expired";

export function bridgeTokenStatus(
  row: Pick<BridgeTokenRow, "expires_at" | "revoked_at">,
  now: Date = new Date(),
): BridgeTokenStatus {
  if (row.revoked_at) return "revoked";
  if (Date.parse(row.expires_at) <= now.getTime()) return "expired";
  return "active";
}

export function clampTtlDays(input: number): number {
  if (!Number.isFinite(input)) return BRIDGE_TOKEN_DEFAULT_TTL_DAYS;
  const n = Math.floor(input);
  if (n < BRIDGE_TOKEN_MIN_TTL_DAYS) return BRIDGE_TOKEN_MIN_TTL_DAYS;
  if (n > BRIDGE_TOKEN_MAX_TTL_DAYS) return BRIDGE_TOKEN_MAX_TTL_DAYS;
  return n;
}

export function sanitizeTokenName(input: string | null | undefined): string {
  const s = (input ?? "").trim();
  if (s.length === 0) return "bridge";
  return s.slice(0, 60);
}

/** Looks like a plausible bridge token (shape-only; not a verification). */
export function looksLikeBridgeToken(input: string): boolean {
  return (
    typeof input === "string" &&
    input.startsWith(BRIDGE_TOKEN_PREFIX) &&
    input.length >= BRIDGE_TOKEN_PREFIX.length + 16
  );
}

/**
 * Fixed, grower-readable failure copy for mint/revoke toasts (bridge audit
 * gap G6). Server-controlled or transport error text must NEVER be rendered
 * verbatim — only these strings ship, keyed by the edge functions' stable
 * reason codes; anything unrecognized falls back to calm generic copy.
 */
const MINT_FAILURE_COPY: Record<string, string> = {
  upgrade_required: "Live sensors need a paid plan. The token was not created.",
  entitlement_lookup_failed: "Billing status could not be verified. Try again shortly.",
  forbidden_tent: "This tent is not yours to bridge. The token was not created.",
  invalid_tent_id: "This tent cannot mint tokens.",
  tent_lookup_failed: "Tent lookup failed. Try again shortly.",
  unauthorized: "Sign in again to mint bridge tokens.",
  insert_failed: "The token could not be saved. Try again shortly.",
  server_misconfigured: "The mint service is unavailable right now.",
};

const REVOKE_FAILURE_COPY: Record<string, string> = {
  not_found: "Token not found — it may already be revoked or deleted.",
  invalid_id: "That token id is not valid.",
  unauthorized: "Sign in again to revoke bridge tokens.",
  update_failed: "The token was not revoked. Try again shortly.",
  lookup_failed: "Revocation state could not be confirmed. Try again shortly.",
  server_misconfigured: "The revoke service is unavailable right now.",
};

export const BRIDGE_TOKEN_MINT_FAILED_FALLBACK = "The token was not created. Try again shortly.";
export const BRIDGE_TOKEN_REVOKE_FAILED_FALLBACK = "The token was not revoked. Try again shortly.";

export function mintFailureDescription(code: unknown): string {
  // Own-property match only: hostile codes like "__proto__" or
  // "constructor" must fall through to the fallback, never to inherited
  // Object.prototype members.
  if (typeof code === "string" && Object.hasOwn(MINT_FAILURE_COPY, code)) {
    return MINT_FAILURE_COPY[code];
  }
  return BRIDGE_TOKEN_MINT_FAILED_FALLBACK;
}

export function revokeFailureDescription(code: unknown): string {
  if (typeof code === "string" && Object.hasOwn(REVOKE_FAILURE_COPY, code)) {
    return REVOKE_FAILURE_COPY[code];
  }
  return BRIDGE_TOKEN_REVOKE_FAILED_FALLBACK;
}

/**
 * Extract the edge function's stable reason code from a functions.invoke
 * failure. Non-2xx responses arrive as FunctionsHttpError with `data: null`
 * and the JSON body riding on `error.context` (house precedent:
 * src/lib/customerPortal.ts). Returns the raw code string or null — callers
 * MUST pass the result through the fixed-copy mappers above and never
 * render it directly.
 */
export function extractBridgeFailureCode(error: unknown, data: unknown): string | null {
  const dataCode = (data as { error?: unknown } | null | undefined)?.error;
  if (typeof dataCode === "string") return dataCode;
  const ctx = (error as { context?: { body?: unknown } } | null | undefined)?.context;
  const body = ctx?.body;
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body) as { error?: unknown };
      return typeof parsed?.error === "string" ? parsed.error : null;
    } catch {
      return null;
    }
  }
  if (body && typeof body === "object") {
    const code = (body as { error?: unknown }).error;
    return typeof code === "string" ? code : null;
  }
  return null;
}
