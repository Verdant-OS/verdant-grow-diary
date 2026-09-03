// useRequireAuth — protected-route session revalidation hook.
//
// Calls supabase.auth.getUser() on mount so we re-validate the bearer with
// the auth server rather than trusting only the cached session. Used at the
// protected layout boundary (AppShell), not from every component.
//
// Safety:
// - never reads tokens out of storage directly
// - never logs the user object
// - redirects only when the session is genuinely gone: this client holds none
//   (AuthSessionMissingError — also how auth-js reports the server's
//   session_not_found, after removing the local session) or the auth server
//   rejected the bearer (401 / 403)
// - a rejected bearer is dropped from THIS tab (local sign-out) so no cached
//   identity — "Signed in", "Open dashboard" — outlives the rejection
// - a getUser transport/server error is revalidation_failed, not signed-out:
//   do not dump a cached session onto the marketing page
// - the wait is bounded: a getUser that never settles becomes
//   revalidation_failed instead of a permanent loading shell; a late answer
//   still applies
// See docs/auth-security.md.
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@/lib/react-router-compat";
import { supabase } from "@/integrations/supabase/client";

export type RequireAuthStatus =
  "loading" | "authenticated" | "unauthenticated" | "revalidation_failed";

/** Gate Retry (and other recoveries) re-run getUser without a marketing bounce. */
export const AUTH_REVALIDATE_EVENT = "verdant:auth-revalidate";

/**
 * Upper bound on one getUser round-trip. Past it the status is
 * revalidation_failed (recoverable through `retry` and AUTH_REVALIDATE_EVENT),
 * so a request that never settles cannot pin the shell on a bare loading
 * state. A late answer still applies.
 */
export const AUTH_REVALIDATION_TIMEOUT_MS = 15_000;

export type RevalidationFailure = "session_missing" | "session_rejected" | "transport";

/**
 * Sort a getUser `{ error }` by what it proves about the session.
 *
 * - `session_missing`: this client holds no session. auth-js answers this
 *   without a network call (AuthSessionMissingError) and raises the same
 *   error after removing a session the server reported as session_not_found.
 * - `session_rejected`: the auth server refused the bearer (401 / 403). The
 *   cached identity is dead; keeping it visible would be a lie.
 * - `transport`: anything else — network failure, 5xx, 429, an error with no
 *   status. Retryable; proves nothing about the session either way.
 */
export function classifyRevalidationFailure(error: unknown): RevalidationFailure {
  if (typeof error !== "object" || error === null) return "transport";
  const { name, status } = error as { name?: unknown; status?: unknown };
  if (name === "AuthSessionMissingError") return "session_missing";
  if (status === 401 || status === 403) return "session_rejected";
  return "transport";
}

export interface RequireAuthOptions {
  /** Test seam for the bounded wait; production uses AUTH_REVALIDATION_TIMEOUT_MS. */
  timeoutMs?: number;
}

export function useRequireAuth(
  redirectTo: string = "/auth",
  options?: RequireAuthOptions,
): {
  status: RequireAuthStatus;
  retry: () => void;
} {
  const nav = useNavigate();
  const timeoutMs = options?.timeoutMs ?? AUTH_REVALIDATION_TIMEOUT_MS;
  const [status, setStatus] = useState<RequireAuthStatus>("loading");
  const [retryToken, setRetryToken] = useState(0);

  const retry = useCallback(() => {
    setRetryToken((t) => t + 1);
  }, []);

  useEffect(() => {
    function onRevalidate() {
      setRetryToken((t) => t + 1);
    }
    window.addEventListener(AUTH_REVALIDATE_EVENT, onRevalidate);
    return () => window.removeEventListener(AUTH_REVALIDATE_EVENT, onRevalidate);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let settled = false;
    const redirectUnauthenticated = () => {
      if (cancelled) return;
      setStatus("unauthenticated");
      nav(redirectTo, { replace: true });
    };

    setStatus("loading");
    const bound = setTimeout(() => {
      if (cancelled || settled) return;
      setStatus("revalidation_failed");
    }, timeoutMs);

    void supabase.auth.getUser().then(
      ({ data, error }) => {
        if (cancelled) return;
        settled = true;
        clearTimeout(bound);
        if (error) {
          const failure = classifyRevalidationFailure(error);
          if (failure === "transport") {
            setStatus("revalidation_failed");
            return;
          }
          if (failure === "session_rejected") {
            // Drop the bearer the server refused from THIS tab only. Fire and
            // forget: the redirect must not wait on /logout, and the SIGNED_OUT
            // it raises reaches AuthProvider, which clears the cached identity.
            void Promise.resolve()
              .then(() => supabase.auth.signOut({ scope: "local" }))
              .catch(() => undefined);
          }
          redirectUnauthenticated();
          return;
        }
        if (!data?.user) {
          redirectUnauthenticated();
          return;
        }
        setStatus("authenticated");
      },
      () => {
        if (cancelled) return;
        settled = true;
        clearTimeout(bound);
        setStatus("revalidation_failed");
      },
    );
    return () => {
      cancelled = true;
      clearTimeout(bound);
    };
  }, [nav, redirectTo, retryToken, timeoutMs]);

  return { status, retry };
}
