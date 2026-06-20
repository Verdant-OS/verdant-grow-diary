// Safe sign-out helper.
//
// SAFETY:
//  - Never logs token/session/email/password.
//  - Never clears grow / diary / sensor data.
//  - Never clears user-scoped start-screen preference
//    (verdant:startScreen:<userId>).
//  - Only clears a small allowlist of transient auth-only UI keys.
//  - Always resolves the post-signout redirect through sanitizeAuthRedirect
//    so an external value can never escape this app's origin.
//  - On Supabase signOut failure: returns a friendly non-sensitive message
//    and STILL redirects to a safe internal page.
import { sanitizeAuthRedirect } from "@/lib/authRedirectRules";

export const SAFE_SIGN_OUT_REDIRECT = "/welcome";
export const SIGN_OUT_FALLBACK_REDIRECT = "/auth";
export const SIGN_OUT_LOADING_LABEL = "Signing out…";
export const SIGN_OUT_FAILURE_MESSAGE =
  "We couldn't fully sign you out. Please refresh and try again.";

/**
 * Prefix-allowlist of session-storage keys safe to clear on sign-out.
 *
 * Explicitly NOT cleared:
 *  - `verdant:startScreen:*` (per-user preference; survives sign-out)
 *  - any grow / tent / plant / diary / sensor / action-queue cache
 *  - any Supabase-managed `sb-*` key (signOut handles that itself)
 */
export const AUTH_TRANSIENT_SESSION_PREFIXES: ReadonlyArray<string> = [
  "verdant:auth:",
  "verdant:onboarding:session:",
  "verdant:authRedirect:",
];

export interface ClearAuthUiStateDeps {
  sessionStorage?: Storage | null;
  onClearQueryCache?: () => void;
}

export function clearAuthTransientUiState(deps: ClearAuthUiStateDeps = {}): void {
  const ss =
    deps.sessionStorage ??
    (typeof window !== "undefined" ? window.sessionStorage : null);
  if (ss) {
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < ss.length; i++) {
        const k = ss.key(i);
        if (!k) continue;
        if (AUTH_TRANSIENT_SESSION_PREFIXES.some((p) => k.startsWith(p))) {
          toRemove.push(k);
        }
      }
      for (const k of toRemove) ss.removeItem(k);
    } catch {
      /* fail open */
    }
  }
  try {
    deps.onClearQueryCache?.();
  } catch {
    /* never throw to caller */
  }
}

export function resolveSignOutRedirect(requested?: unknown): string {
  const value =
    typeof requested === "string" && requested.length > 0
      ? requested
      : SAFE_SIGN_OUT_REDIRECT;
  return sanitizeAuthRedirect(value, SAFE_SIGN_OUT_REDIRECT);
}

export interface PerformSafeSignOutDeps {
  signOut: () => Promise<unknown> | unknown;
  clearUiState?: () => void;
}

export type SafeSignOutResult =
  | { ok: true; redirectTo: string }
  | { ok: false; redirectTo: string; message: string };

export async function performSafeSignOut(
  deps: PerformSafeSignOutDeps,
  requestedRedirect?: string,
): Promise<SafeSignOutResult> {
  const redirectTo = resolveSignOutRedirect(requestedRedirect);
  let ok = true;
  try {
    await deps.signOut();
  } catch {
    // Never re-throw, never log: the error may carry token/session strings.
    ok = false;
  }
  try {
    deps.clearUiState?.();
  } catch {
    /* never throw to caller */
  }
  return ok
    ? { ok: true, redirectTo }
    : { ok: false, redirectTo, message: SIGN_OUT_FAILURE_MESSAGE };
}
