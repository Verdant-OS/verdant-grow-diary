/**
 * First-time Google OAuth signup vs a later Google sign-in.
 *
 * Supabase stamps `created_at` and `last_sign_in_at` in the same signup
 * request. A later sign-in moves only `last_sign_in_at`. The skew bound
 * absorbs that split stamp. A same-tab reload still sits inside the bound,
 * so the sessionStorage marker is what keeps the funnel event at one emit
 * across the OAuth redirect and a re-render.
 *
 * Email signup stays on Auth.tsx. This rule never treats an email provider
 * as a Google signup.
 */

export const GOOGLE_OAUTH_SIGNUP_FUNNEL_METHOD = "google" as const;

/** Split between the user row stamp and the first sign-in stamp. */
export const FIRST_GOOGLE_OAUTH_SIGNUP_MAX_SKEW_MS = 10_000;

/**
 * Same-tab dedupe for the OAuth return reload. Not under `verdant:auth:`
 * so a safe sign-out does not erase the marker and let a fast second
 * sign-in inside the skew window emit again.
 */
export const OAUTH_SIGNUP_FUNNEL_EMITTED_STORAGE_KEY =
  "verdant:oauth-signup-funnel-emitted:v1" as const;

export type GoogleOAuthSignupCandidate = {
  id?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
  app_metadata?: {
    provider?: string | null;
    providers?: readonly string[] | null;
  } | null;
  identities?: ReadonlyArray<{ provider?: string | null } | null> | null;
};

const emittedUserIds = new Set<string>();

function readProvider(user: GoogleOAuthSignupCandidate): string {
  const provider = user.app_metadata?.provider;
  return typeof provider === "string" ? provider : "";
}

/**
 * Google is the only auth provider on this user. An email account that
 * later links Google keeps `provider: "email"` and is not a Google signup.
 */
export function isGoogleOAuthSignupUser(
  user: GoogleOAuthSignupCandidate | null | undefined,
): boolean {
  if (!user) return false;
  const provider = readProvider(user);
  if (provider === GOOGLE_OAUTH_SIGNUP_FUNNEL_METHOD) return true;
  if (provider.length > 0) return false;

  const providers = user.app_metadata?.providers;
  if (Array.isArray(providers) && providers.length > 0) {
    return providers.length === 1 && providers[0] === GOOGLE_OAUTH_SIGNUP_FUNNEL_METHOD;
  }

  const identities = Array.isArray(user.identities) ? user.identities : [];
  return (
    identities.length > 0 &&
    identities.every((identity) => identity?.provider === GOOGLE_OAUTH_SIGNUP_FUNNEL_METHOD)
  );
}

export function isFirstGoogleOAuthSignup(
  user: GoogleOAuthSignupCandidate | null | undefined,
): boolean {
  if (!user || typeof user.id !== "string" || user.id.length === 0) return false;
  if (!isGoogleOAuthSignupUser(user)) return false;
  const createdAt = Date.parse(user.created_at ?? "");
  const lastSignInAt = Date.parse(user.last_sign_in_at ?? "");
  if (!Number.isFinite(createdAt) || !Number.isFinite(lastSignInAt)) return false;
  return Math.abs(lastSignInAt - createdAt) <= FIRST_GOOGLE_OAUTH_SIGNUP_MAX_SKEW_MS;
}

export function resolveOAuthSignupFunnelStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function readEmittedUserId(storage: Pick<Storage, "getItem"> | null): string | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(OAUTH_SIGNUP_FUNNEL_EMITTED_STORAGE_KEY);
    return typeof raw === "string" && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Returns true only the first time this user id is claimed in this document
 * or in the tab's sessionStorage. Callers emit only after a true result.
 */
export function claimFirstGoogleOAuthSignupEmission(
  userId: string,
  storage: Pick<Storage, "getItem" | "setItem"> | null,
): boolean {
  if (emittedUserIds.has(userId)) return false;
  if (readEmittedUserId(storage) === userId) {
    emittedUserIds.add(userId);
    return false;
  }
  emittedUserIds.add(userId);
  if (storage) {
    try {
      storage.setItem(OAUTH_SIGNUP_FUNNEL_EMITTED_STORAGE_KEY, userId);
    } catch {
      // The in-memory claim still blocks a second emit in this document.
    }
  }
  return true;
}

export function emitFirstGoogleOAuthSignup(
  user: GoogleOAuthSignupCandidate | null | undefined,
  trackSignup: () => void,
  storage: Pick<Storage, "getItem" | "setItem"> | null = resolveOAuthSignupFunnelStorage(),
): boolean {
  if (!isFirstGoogleOAuthSignup(user) || typeof user?.id !== "string") return false;
  if (!claimFirstGoogleOAuthSignupEmission(user.id, storage)) return false;
  trackSignup();
  return true;
}

/** Test isolation. Does not clear sessionStorage. */
export function clearOAuthSignupFunnelEmissionMemoryForTests(): void {
  emittedUserIds.clear();
}
