// useRequireAuth — protected-route session revalidation hook.
//
// Calls supabase.auth.getUser() on mount so we re-validate the bearer with
// the auth server rather than trusting only the cached session. Used at the
// protected layout boundary (AppShell), not from every component.
//
// Safety:
// - never reads tokens out of storage directly
// - never logs the user object
// - redirects only when getUser settles with no user (true signed-out)
// - a getUser transport/server error is revalidation_failed, not signed-out:
//   do not dump a cached session onto the marketing page
// See docs/auth-security.md.
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@/lib/react-router-compat";
import { supabase } from "@/integrations/supabase/client";

export type RequireAuthStatus =
  "loading" | "authenticated" | "unauthenticated" | "revalidation_failed";

/** Gate Retry (and other recoveries) re-run getUser without a marketing bounce. */
export const AUTH_REVALIDATE_EVENT = "verdant:auth-revalidate";

export function useRequireAuth(redirectTo: string = "/auth"): {
  status: RequireAuthStatus;
  retry: () => void;
} {
  const nav = useNavigate();
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
    const redirectUnauthenticated = () => {
      if (cancelled) return;
      setStatus("unauthenticated");
      nav(redirectTo, { replace: true });
    };

    setStatus("loading");
    void supabase.auth.getUser().then(
      ({ data, error }) => {
        if (cancelled) return;
        if (error) {
          // A server/transport error is not proof of signed-out. Stay put so a
          // cached session is not dumped onto /welcome. AppShell withholds
          // private REST until a later retry authenticates.
          setStatus("revalidation_failed");
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
        setStatus("revalidation_failed");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [nav, redirectTo, retryToken]);

  return { status, retry };
}
