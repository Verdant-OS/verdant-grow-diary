import { createFileRoute } from "@tanstack/react-router";
import RouteAliasRedirect from "@/components/RouteAliasRedirect";

export const Route = createFileRoute("/help")({
  component: RouteComponent,
});

function RouteComponent() {
  return <RouteAliasRedirect to="/tools/grow-help-toolkit" />;
}
