/**
 * RequireOperatorRole — route-element guard that requires the server-side
 * `operator` role (via has_role security-definer RPC) in addition to
 * authentication.
 *
 * Behavior:
 *  - loading / unauthenticated → renders calm placeholder (AppShell already
 *    redirects unauthenticated users to /auth; this guard sits inside it).
 *  - denied → calm Access Restricted state. No internal IDs, no role-query
 *    internals, no auth tokens exposed.
 *  - granted → <Outlet /> renders the operator route.
 *
 * Safety:
 *  - never trusts client-side role inference; defers to useHasRole → RPC.
 *  - never reads tokens or secrets.
 *  - never logs the user object.
 */
import { Outlet } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useHasRole } from "@/hooks/useHasRole";

export function RequireOperatorRole() {
  const role = useHasRole("operator");

  if (role.status === "loading" || role.status === "unauthenticated") {
    return (
      <div className="mx-auto max-w-2xl p-6" data-testid="require-operator-loading">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Checking operator access…
          </CardContent>
        </Card>
      </div>
    );
  }

  if (role.status !== "granted") {
    return (
      <div className="mx-auto max-w-2xl p-6" data-testid="require-operator-denied">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-4 w-4" /> Access restricted
            </CardTitle>
            <CardDescription>
              Signed in, but this account does not have operator access.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Use an operator-role account for this preview.</p>
            <p>No operator data was loaded.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <Outlet />;
}

export default RequireOperatorRole;
