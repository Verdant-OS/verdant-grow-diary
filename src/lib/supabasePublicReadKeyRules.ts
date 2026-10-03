/**
 * Classify a Supabase API key for a read path that must run as the public
 * (anonymous) role — e.g. the Strain Reference Library parity receipt.
 *
 * Pure: decides from the key itself, never from other environment variables,
 * so a service-role key mapped into an "anon" variable is still refused.
 * Accepts only a publishable key or a legacy JWT whose `role` claim is `anon`.
 * The signature is not verified (that is the server's job); the claim only
 * decides whether this caller may proceed.
 */

export type SupabasePublicReadKeyClassification =
  { ok: true; kind: "publishable" | "anon_jwt" } | { ok: false; reason: string };

const PUBLISHABLE_PREFIX = "sb_publishable_";
const SECRET_PREFIX = "sb_secret_";

function decodeBase64UrlJson(segment: string): unknown {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return JSON.parse(atob(padded));
}

export function classifySupabasePublicReadKey(
  key: string | null | undefined,
): SupabasePublicReadKeyClassification {
  const value = (key ?? "").trim();
  if (!value) return { ok: false, reason: "no key supplied" };
  if (value.startsWith(SECRET_PREFIX)) {
    return { ok: false, reason: "secret key format (sb_secret_) is not a public key" };
  }
  if (value.startsWith(PUBLISHABLE_PREFIX)) return { ok: true, kind: "publishable" };

  const segments = value.split(".");
  if (segments.length !== 3 || segments.some((segment) => segment.length === 0)) {
    return { ok: false, reason: "unrecognized key format" };
  }
  let payload: unknown;
  try {
    payload = decodeBase64UrlJson(segments[1]);
  } catch {
    return { ok: false, reason: "JWT payload is not decodable JSON" };
  }
  const role =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>).role
      : undefined;
  if (role === "anon") return { ok: true, kind: "anon_jwt" };
  return {
    ok: false,
    reason: `JWT role ${JSON.stringify(role ?? null)} is not anon`,
  };
}

/**
 * Verdant's production Supabase project. Verdant is production only (AGENTS.md,
 * Release and Environment Rules); the same ref is pinned in the repo's other
 * production-only scripts and harnesses.
 */
export const VERDANT_PRODUCTION_SUPABASE_PROJECT_REF = "knkwiiywfkbqznbxwqfh";

export type CultivarParityReceiptTargetClassification =
  { ok: true } | { ok: false; reason: string };

/**
 * The parity receipt gates enabling database reads, so it must target the
 * pinned production project exactly: https, the project host, no path. A
 * stale shell pointing at a local, retired, or unrelated project is refused
 * rather than allowed to emit an indistinguishable READY.
 */
export function classifyCultivarParityReceiptTarget(
  url: string | null | undefined,
): CultivarParityReceiptTargetClassification {
  let parsed: URL;
  try {
    parsed = new URL((url ?? "").trim());
  } catch {
    return { ok: false, reason: "not a valid URL" };
  }
  const expectedHost = `${VERDANT_PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`;
  if (parsed.protocol !== "https:") return { ok: false, reason: "must use https" };
  if (parsed.hostname.toLowerCase() !== expectedHost) {
    return { ok: false, reason: `host ${parsed.hostname} is not the production project` };
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.port) {
    return { ok: false, reason: "must be the bare project URL" };
  }
  return { ok: true };
}
