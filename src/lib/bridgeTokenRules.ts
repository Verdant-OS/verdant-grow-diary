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
