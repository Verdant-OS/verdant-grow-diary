import { lazy, Suspense, useEffect, useState } from "react";
import { useAuth } from "@/store/auth";
import { resolveRootEntrySurface } from "@/lib/rootEntryRules";

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
  const surface = resolveRootEntrySurface({
    authLoading: loading,
    hasAuthenticatedUser: Boolean(user),
  });

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
        <AppShell>
          <Dashboard />
        </AppShell>
      )}
    </Suspense>
  );
}
