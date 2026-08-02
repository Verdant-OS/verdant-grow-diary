import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import RouteAliasRedirect from "@/components/RouteAliasRedirect";

export const Route = createFileRoute("/strains")({
  head: () => staticRouteHead("/strains"),
  component: RouteComponent,
});

function RouteComponent() {
  return <RouteAliasRedirect to="/cultivars" />;
}
