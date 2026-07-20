/**
 * OAuthPostAuthRedirect — consumes a one-shot, manifest-validated OAuth
 * CSV-onboarding destination after the provider returns to the public app
 * origin.
 *
 * It never reads URL values as authority, never writes data, and only runs at
 * the apex after a verified client session exists.
 */
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/store/auth";
import { consumePendingOAuthPostAuthRedirect } from "@/lib/oauthPostAuthRedirectRules";

export default function OAuthPostAuthRedirect() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // OAuth is configured to return to the public app origin. Never hijack a
    // normal authenticated route or a signed-out landing-page visit.
    if (loading || !user || location.pathname !== "/") return;
    const redirectTo = consumePendingOAuthPostAuthRedirect();
    if (!redirectTo || redirectTo === "/") return;
    navigate(redirectTo, { replace: true });
  }, [loading, location.pathname, navigate, user]);

  return null;
}
