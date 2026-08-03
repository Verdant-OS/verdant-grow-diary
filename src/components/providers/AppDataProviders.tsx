/**
 * Authenticated-app data providers.
 *
 * Mounted under `/_app` (and not on the global root) so pure marketing SSR
 * routes never statically import the browser Supabase client via
 * Auth/Grows/reconsent/paddle.
 *
 * AppChromeProviders is the Grows/reconsent/payment layer alone — used when
 * AuthProvider is already mounted (e.g. signed-in apex via PublicAuthProviders).
 */
import type { ReactNode } from "react";
import { AuthProvider } from "@/store/auth";
import { GrowsProvider } from "@/store/grows";
import OAuthPostAuthRedirect from "@/components/OAuthPostAuthRedirect";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { AgreementReconsentGate } from "@/components/AgreementReconsentGate";
import { useAuthIdentityFence } from "@/components/providers/authIdentityFence";

/** Grows + app-only chrome (no Auth). Requires an outer AuthProvider. */
export function AppChromeProviders({ children }: { children: ReactNode }) {
  return (
    <GrowsProvider>
      <PaymentTestModeBanner />
      <AgreementReconsentGate />
      {children}
    </GrowsProvider>
  );
}

/** Full private-shell stack: Auth + OAuth redirect + app chrome. */
export function AppDataProviders({ children }: { children: ReactNode }) {
  const onBeforeAuthIdentityChange = useAuthIdentityFence();
  return (
    <AuthProvider onBeforeAuthIdentityChange={onBeforeAuthIdentityChange}>
      <OAuthPostAuthRedirect />
      <AppChromeProviders>{children}</AppChromeProviders>
    </AuthProvider>
  );
}
