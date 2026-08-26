// useRequireAuth — protected-route session revalidation hook.
//
// Calls supabase.auth.getUser() on mount so we re-validate the bearer with
// the auth server rather than trusting only the cached session. Used at the
// protected layout boundary (AppShell), not from every component.
//
// Safety:
// - never reads tokens out of storage directly
// - never logs the user object
// - redirects unauthenticated users to /auth
// See docs/auth-security.md.
import { useEffect, useState } from "react";
import { useNavigate } from "@/lib/react-router-compat";
import { supabase } from "@/integrations/supabase/client";

export type RequireAuthStatus = "loading" | "authenticated" | "unauthenticated";

export function useRequireAuth(redirectTo: string = "/auth"): {
  status: RequireAuthStatus;
} {
  const nav = useNavigate();
  const [status, setStatus] = useState<RequireAuthStatus>("loading");

  useEffect(() => {
    let cancelled = false;
    const redirectUnauthenticated = () => {
      if (cancelled) return;
      setStatus("unauthenticated");
      nav(redirectTo, { replace: true });
    };

    void supabase.auth.getUser().then(
      ({ data, error }) => {
        if (error || !data?.user) {
          redirectUnauthenticated();
          return;
        }
        if (cancelled) return;
        setStatus("authenticated");
      },
      () => {
        // A transport/runtime rejection cannot be trusted as authenticated.
        // Fail closed without exposing the underlying error or user data.
        redirectUnauthenticated();
      },
    );
    return () => {
      cancelled = true;
    };
  }, [nav, redirectTo]);

  return { status };
}
