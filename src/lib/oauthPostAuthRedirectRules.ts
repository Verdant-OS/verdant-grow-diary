/**
 * oauthPostAuthRedirectRules — one-shot, same-origin OAuth continuation.
 *
 * OAuth returns to the configured public app origin, not the transient
 * /auth URL. Keep the manifest-validated destination in sessionStorage so an
 * explicit protected deep link survives that round trip. This stores no
 * identity, token, grow, plant, tent, billing, or arbitrary off-route data.
 */
import { resolveKnownRouteReturnTo } from "@/lib/authRedirectRules";

export const OAUTH_POST_AUTH_REDIRECT_STORAGE_KEY = "verdant:oauth-post-auth-redirect:v1" as const;
export const OAUTH_POST_AUTH_REDIRECT_TTL_MS = 30 * 60 * 1_000;

interface PendingOAuthPostAuthRedirect {
  readonly redirectTo: string;
  readonly startedAt: number;
}

const BLOCKED_OAUTH_POST_AUTH_PATHS = new Set([
  "/",
  "/auth",
  "/checkout/cancel",
  "/checkout/success",
  "/login",
  "/reset-password",
  "/signup",
  "/welcome",
]);

function resolveAllowedOAuthPostAuthRedirect(value: unknown): string | null {
  const redirectTo = resolveKnownRouteReturnTo(value);
  if (!redirectTo) return null;
  const pathname = redirectTo.split("?")[0].split("#")[0];
  const canonicalPathname =
    pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return BLOCKED_OAUTH_POST_AUTH_PATHS.has(canonicalPathname) ? null : redirectTo;
}

function removePending(storage: Storage | null): void {
  if (!storage) return;
  try {
    storage.removeItem(OAUTH_POST_AUTH_REDIRECT_STORAGE_KEY);
  } catch {
    // Browser storage can be unavailable. Authentication must still work.
  }
}

export function resolveOAuthPostAuthSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Persist one known, non-transitional app route. Rejected values clear stale
 * state so a later unrelated sign-in cannot inherit an old request.
 */
export function savePendingOAuthPostAuthRedirect(
  requestedRedirect: unknown,
  storage: Storage | null = resolveOAuthPostAuthSessionStorage(),
  now = Date.now(),
): boolean {
  const redirectTo = resolveAllowedOAuthPostAuthRedirect(requestedRedirect);
  if (!storage || !redirectTo || !Number.isFinite(now) || now < 0) {
    removePending(storage);
    return false;
  }
  try {
    const pending: PendingOAuthPostAuthRedirect = {
      redirectTo,
      startedAt: Math.floor(now),
    };
    storage.setItem(OAUTH_POST_AUTH_REDIRECT_STORAGE_KEY, JSON.stringify(pending));
    return true;
  } catch {
    return false;
  }
}

export function clearPendingOAuthPostAuthRedirect(
  storage: Storage | null = resolveOAuthPostAuthSessionStorage(),
): void {
  removePending(storage);
}

/**
 * Consume, rather than merely read, the one-shot target. Stale, malformed,
 * unknown, and transitional routes are removed and never navigated to.
 */
export function consumePendingOAuthPostAuthRedirect(
  storage: Storage | null = resolveOAuthPostAuthSessionStorage(),
  now = Date.now(),
): string | null {
  if (!storage || !Number.isFinite(now) || now < 0) return null;
  try {
    const raw = storage.getItem(OAUTH_POST_AUTH_REDIRECT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingOAuthPostAuthRedirect>;
    const redirectTo = resolveAllowedOAuthPostAuthRedirect(parsed.redirectTo);
    const valid =
      typeof parsed.startedAt === "number" &&
      Number.isFinite(parsed.startedAt) &&
      parsed.startedAt >= 0 &&
      now >= parsed.startedAt &&
      now - parsed.startedAt <= OAUTH_POST_AUTH_REDIRECT_TTL_MS &&
      redirectTo !== null;
    removePending(storage);
    return valid ? redirectTo : null;
  } catch {
    removePending(storage);
    return null;
  }
}
