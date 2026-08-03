import { lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from "react";
import { useAuth } from "@/store/auth";
import { resolveRootEntrySurface } from "@/lib/rootEntryRules";

// Keep the signed-out apex light: the protected shell, dashboard, and app chrome
// chunks are only requested after AuthProvider resolves an authenticated user.
const AppShell = lazy(() => import("@/components/AppShell"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Landing = lazy(() => import("@/pages/Landing"));
const AppChromeProviders = lazy(() =>
  import("@/components/providers/AppDataProviders").then((m) => ({
    default: m.AppChromeProviders as ComponentType<{ children: ReactNode }>,
  })),
);

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
 *
 * The signed-in branch lazy-mounts AppChromeProviders (Grows + reconsent +
 * payment) under the outer PublicAuthProviders Auth shell — no nested
 * AuthProvider, and no Grows import on the signed-out landing path.
 */
export default function RootEntry() {
  const { user, loading } = useAuth();
  // The server always renders the "loading" surface (no session on the SSR
  // pass). A returning grower's cached session can resolve before React's
  // first client render, which would otherwise commit `landing`/`dashboard`
  // against server HTML that says `loading`. Staying on the loading surface
  // until after hydration keeps the first client pass byte-identical to SSR;
  // the real surface commits on the next render.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  const surface = hydrated
    ? resolveRootEntrySurface({
        authLoading: loading,
        hasAuthenticatedUser: Boolean(user),
      })
    : "loading";

  // The Suspense boundary is rendered unconditionally so the server ("loading")
  // and first client pass (session may already be cached) produce the same tree
  // shape — a conditional boundary here caused a hydration mismatch at `/`.
  return (
    <Suspense fallback={<RootEntryLoader />}>
      {surface === "loading" ? (
        <RootEntryLoader />
      ) : surface === "landing" ? (
        <Landing canonicalPath="/" />
      ) : (
        <AppChromeProviders>
          <AppShell>
            <Dashboard />
          </AppShell>
        </AppChromeProviders>
      )}
    </Suspense>
  );
}
