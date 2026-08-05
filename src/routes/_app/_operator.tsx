import { createFileRoute } from "@tanstack/react-router";
import { RequireOperatorRole } from "@/components/RequireOperatorRole";

/**
 * Operator-only layout route, nested inside the authenticated `_app` layout.
 *
 * Replaces the Classic `<Route element={<RequireOperatorRole />}>` wrapper.
 * The guard resolves the server-side `has_role('operator')` RPC and renders
 * its own `<Outlet />` on grant, a calm access-restricted state otherwise.
 * Presentation-level only — operator tables remain RLS-enforced server-side.
 */
export const Route = createFileRoute("/_app/_operator")({
  component: RequireOperatorRole,
});
