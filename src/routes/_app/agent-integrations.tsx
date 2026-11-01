import { createFileRoute } from "@tanstack/react-router";
import RouteAliasRedirect from "@/components/RouteAliasRedirect";

export const Route = createFileRoute("/_app/agent-integrations")({
  component: RouteComponent,
});

function RouteComponent() {
  return <RouteAliasRedirect to="/settings/agent-integrations" />;
}
