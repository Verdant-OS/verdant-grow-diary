import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import AppShell from "@/components/AppShell";
import { AppDocumentTitle } from "@/components/AppDocumentTitle";
import { appLayoutDocumentHead } from "@/lib/appDocumentTitleRules";

/**
 * Authenticated layout route.
 *
 * Replaces the Classic `<Route element={<AppShell />}>` layout wrapper.
 * AppShell runs `useRequireAuth()` and the server session revalidation, then
 * renders its `<Outlet />`. This is presentation-level gating only — every
 * table behind these routes is RLS-scoped server-side.
 */
export const Route = createFileRoute("/_app")({
  head: ({ matches }) => appLayoutDocumentHead(matches),
  component: AppLayout,
});

function AppLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <AppShell>
      <AppDocumentTitle pathname={pathname} />
      <Outlet />
    </AppShell>
  );
}
