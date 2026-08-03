/**
 * Session-aware public shell (Auth only).
 *
 * Used by marketing edges that need signed-in CTAs or auth forms
 * (landing, pricing, /auth, checkout) without mounting Grows, reconsent,
 * or payment banners — those stay app-only under AppDataProviders.
 *
 * OAuthPostAuthRedirect stays here so post-login round-trips on public
 * auth routes still complete.
 */
import type { ReactNode } from "react";
import { AuthProvider } from "@/store/auth";
import OAuthPostAuthRedirect from "@/components/OAuthPostAuthRedirect";
import { useAuthIdentityFence } from "@/components/providers/authIdentityFence";

export function PublicAuthProviders({ children }: { children: ReactNode }) {
  const onBeforeAuthIdentityChange = useAuthIdentityFence();
  return (
    <AuthProvider onBeforeAuthIdentityChange={onBeforeAuthIdentityChange}>
      <OAuthPostAuthRedirect />
      {children}
    </AuthProvider>
  );
}
