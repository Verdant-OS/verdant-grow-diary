import { Navigate, useLocation } from "react-router-dom";
import { buildRouteAliasTarget } from "@/lib/routeAliasRules";

interface RouteAliasRedirectProps {
  to: string;
}

/** Presenter-only redirect that preserves the incoming query and hash. */
export default function RouteAliasRedirect({ to }: RouteAliasRedirectProps) {
  const location = useLocation();
  return <Navigate replace to={buildRouteAliasTarget(to, location.search, location.hash)} />;
}
