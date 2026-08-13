import { lazy, Suspense, useEffect, useState } from "react";
import { useAuth } from "@/store/auth";
import {
  resolveRootEntrySurface,
  ROOT_ENTRY_PRE_HYDRATION_SURFACE,
  shouldTrackRootLandingPageView,
} from "@/lib/rootEntryRules";

// Keep the signed-out apex light: the protected shell and dashboard chunks are
// only requested after AuthProvider resolves an authenticated user.
const AppShell = lazy(() => import("@/components/AppShell"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Landing = lazy(() => import("@/pages/Landing"));

function RootEntryLoader() {
  return (
    <div role="status" aria-live="polite" className="flex min-h-[60vh] items-center justify-center">
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/**
 * Session-aware apex boundary.
 *
 * Signed-out visitors see the public acquisition page directly at `/`, with no
 * redirect through the private shell. Signed-in growers retain the existing
 * dashboard-at-apex behavior and the AppShell's server session revalidation.
 */
export default function RootEntry() {
  const { user, loading } = useAuth();
  // SSR has no trusted session, so both the server and first client pass render
  // the public landing surface. AuthProvider may restore a cached session
  // before hydration finishes; waiting for this effect keeps those two passes
  // byte-identical. The existing auth resolver takes over on the next render.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  const rootEntryState = {
    authLoading: loading,
    hasAuthenticatedUser: Boolean(user),
  };

  const surface = hydrated
    ? resolveRootEntrySurface(rootEntryState)
    : ROOT_ENTRY_PRE_HYDRATION_SURFACE;
  const trackLandingPageView = shouldTrackRootLandingPageView(rootEntryState);

  // Keep this boundary unconditional so SSR and the first client pass retain
  // the same tree shape even when a returning grower's session is cached.
  return (
    <Suspense fallback={<RootEntryLoader />}>
      {surface === "loading" ? (
        <RootEntryLoader />
      ) : surface === "landing" ? (
        <Landing canonicalPath="/" trackPageView={trackLandingPageView} />
      ) : (
        <AppShell>
          <Dashboard />
        </AppShell>
      )}
    </Suspense>
  );
}
