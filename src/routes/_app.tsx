import { createFileRoute, Outlet } from "@tanstack/react-router";
import AppShell from "@/components/AppShell";

/**
 * Authenticated layout route.
 *
 * Replaces the Classic `<Route element={<AppShell />}>` layout wrapper.
 * AppShell runs `useRequireAuth()` and the server session revalidation, then
 * renders its `<Outlet />`. This is presentation-level gating only — every
 * table behind these routes is RLS-scoped server-side.
 */
export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
